import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  normalizePluginsConfig,
  resolveEffectiveEnableState,
  resolveMemorySlotDecision,
} from "../plugins/config-state.js";
import { loadPluginManifestRegistry } from "../plugins/manifest-registry.js";
import type { OpenClawPluginApi } from "../plugins/types.js";
import { isPathInsideWithRealpath } from "../security/scan-paths.js";
import { shouldIncludeHook } from "./config.js";
import type { InternalHookHandler } from "./internal-hooks.js";
import type { HookEntry } from "./types.js";
import { loadHookEntriesFromDir } from "./workspace.js";

const log = createSubsystemLogger("hooks");

export type PluginHookDirEntry = {
  dir: string;
  pluginId: string;
};

export type PluginHookLoadResult = {
  hooks: HookEntry[];
  loaded: number;
  skipped: number;
  errors: string[];
};

function resolveHookDir(api: OpenClawPluginApi, dir: string): string {
  if (path.isAbsolute(dir)) {
    return dir;
  }
  return path.resolve(path.dirname(api.source), dir);
}

function normalizePluginHookEntry(api: OpenClawPluginApi, entry: HookEntry): HookEntry {
  return {
    ...entry,
    hook: {
      ...entry.hook,
      source: "openclaw-plugin",
      pluginId: api.id,
    },
    metadata: {
      ...entry.metadata,
      hookKey: entry.metadata?.hookKey ?? `${api.id}:${entry.hook.name}`,
      events: entry.metadata?.events ?? [],
    },
  };
}

async function loadHookHandler(
  entry: HookEntry,
  api: OpenClawPluginApi,
): Promise<InternalHookHandler | null> {
  try {
    const url = pathToFileURL(entry.hook.handlerPath).href;
    const cacheBustedUrl = `${url}?t=${Date.now()}`;
    const mod = (await import(cacheBustedUrl)) as Record<string, unknown>;
    const exportName = entry.metadata?.export ?? "default";
    const handler = mod[exportName];
    if (typeof handler === "function") {
      return handler as InternalHookHandler;
    }
    api.logger.warn?.(`[hooks] ${entry.hook.name} handler is not a function`);
    return null;
  } catch (err) {
    api.logger.warn?.(`[hooks] Failed to load ${entry.hook.name}: ${String(err)}`);
    return null;
  }
}

export async function registerPluginHooksFromDir(
  api: OpenClawPluginApi,
  dir: string,
): Promise<PluginHookLoadResult> {
  const resolvedDir = resolveHookDir(api, dir);
  const hooks = loadHookEntriesFromDir({
    dir: resolvedDir,
    source: "openclaw-plugin",
    pluginId: api.id,
  });

  const result: PluginHookLoadResult = {
    hooks,
    loaded: 0,
    skipped: 0,
    errors: [],
  };

  for (const entry of hooks) {
    const normalizedEntry = normalizePluginHookEntry(api, entry);
    const events = normalizedEntry.metadata?.events ?? [];
    if (events.length === 0) {
      api.logger.warn?.(`[hooks] ${entry.hook.name} has no events; skipping`);
      api.registerHook(events, async () => undefined, {
        entry: normalizedEntry,
        register: false,
      });
      result.skipped += 1;
      continue;
    }

    const handler = await loadHookHandler(entry, api);
    if (!handler) {
      result.errors.push(`[hooks] Failed to load ${entry.hook.name}`);
      api.registerHook(events, async () => undefined, {
        entry: normalizedEntry,
        register: false,
      });
      result.skipped += 1;
      continue;
    }

    const eligible = shouldIncludeHook({ entry: normalizedEntry, config: api.config });
    api.registerHook(events, handler, {
      entry: normalizedEntry,
      register: eligible,
    });

    if (eligible) {
      result.loaded += 1;
    } else {
      result.skipped += 1;
    }
  }

  return result;
}

export function resolvePluginHookDirs(params: {
  workspaceDir: string | undefined;
  config?: OpenClawConfig;
}): PluginHookDirEntry[] {
  const workspaceDir = (params.workspaceDir ?? "").trim();
  if (!workspaceDir) {
    return [];
  }
  const registry = loadPluginManifestRegistry({
    workspaceDir,
    config: params.config,
  });
  if (registry.plugins.length === 0) {
    return [];
  }

  const normalizedPlugins = normalizePluginsConfig(params.config?.plugins);
  const memorySlot = normalizedPlugins.slots.memory;
  let selectedMemoryPluginId: string | null = null;
  const seen = new Set<string>();
  const resolved: PluginHookDirEntry[] = [];

  for (const record of registry.plugins) {
    if (!record.hooks || record.hooks.length === 0) {
      continue;
    }
    const enableState = resolveEffectiveEnableState({
      id: record.id,
      origin: record.origin,
      config: normalizedPlugins,
      rootConfig: params.config,
    });
    if (!enableState.enabled) {
      continue;
    }

    const memoryDecision = resolveMemorySlotDecision({
      id: record.id,
      kind: record.kind,
      slot: memorySlot,
      selectedId: selectedMemoryPluginId,
    });
    if (!memoryDecision.enabled) {
      continue;
    }
    if (memoryDecision.selected && record.kind === "memory") {
      selectedMemoryPluginId = record.id;
    }

    for (const raw of record.hooks) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      const candidate = path.resolve(record.rootDir, trimmed);
      if (!fs.existsSync(candidate)) {
        log.warn(`plugin hook path not found (${record.id}): ${candidate}`);
        continue;
      }
      if (!isPathInsideWithRealpath(record.rootDir, candidate, { requireRealpath: true })) {
        log.warn(`plugin hook path escapes plugin root (${record.id}): ${candidate}`);
        continue;
      }
      if (seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      resolved.push({
        dir: candidate,
        pluginId: record.id,
      });
    }
  }

  return resolved;
}
