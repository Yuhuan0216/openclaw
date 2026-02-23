import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { normalizeChatChannelId } from "../channels/registry.js";
import type { OpenClawConfig } from "../config/config.js";
import type { AgentBinding } from "../config/types.agents.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveConfigDir } from "../utils.js";
import { normalizeAccountId, normalizeAgentId } from "./session-key.js";

const log = createSubsystemLogger("routing/bindings");

const AgentBindingSchema = z.object({
  agentId: z.string(),
  match: z.object({
    channel: z.string(),
    accountId: z.string().optional(),
    peer: z
      .object({
        kind: z.enum(["dm", "group", "channel"]),
        id: z.string(),
      })
      .optional(),
    guildId: z.string().optional(),
    teamId: z.string().optional(),
  }),
});

function normalizeBindingChannelId(raw?: string | null): string | null {
  const normalized = normalizeChatChannelId(raw);
  if (normalized) {
    return normalized;
  }
  const fallback = (raw ?? "").trim().toLowerCase();
  return fallback || null;
}

let cachedExtraBindings: AgentBinding[] | null = null;

export function loadExtraBindings(): AgentBinding[] {
  if (cachedExtraBindings !== null) {
    return cachedExtraBindings;
  }

  const paths = [join(resolveConfigDir(), "routing.json"), join(process.cwd(), "routing.json")];

  const allBindings: AgentBinding[] = [];

  for (const path of paths) {
    try {
      if (existsSync(path)) {
        const content = readFileSync(path, "utf-8");
        const json = JSON.parse(content);
        if (Array.isArray(json)) {
          for (let i = 0; i < json.length; i++) {
            const result = AgentBindingSchema.safeParse(json[i]);
            if (result.success) {
              allBindings.push(result.data as AgentBinding);
            } else {
              log.debug(
                `Invalid binding at index ${i} in ${path}: ${JSON.stringify(result.error.format())}`,
              );
            }
          }
        } else {
          log.debug(`routing.json root must be an array in ${path}`);
        }
      }
    } catch (error) {
      log.debug(`Failed to load routing.json from ${path}: ${String(error)}`);
    }
  }

  cachedExtraBindings = allBindings;
  return cachedExtraBindings;
}

export function resetBindingsCacheForTest() {
  cachedExtraBindings = null;
}

export function listBindings(cfg: OpenClawConfig): AgentBinding[] {
  const extra = loadExtraBindings();
  const configBindings = Array.isArray(cfg.bindings) ? cfg.bindings : [];
  return [...extra, ...configBindings];
}

function resolveNormalizedBindingMatch(binding: AgentBinding): {
  agentId: string;
  accountId: string;
  channelId: string;
} | null {
  if (!binding || typeof binding !== "object") {
    return null;
  }
  const match = binding.match;
  if (!match || typeof match !== "object") {
    return null;
  }
  const channelId = normalizeBindingChannelId(match.channel);
  if (!channelId) {
    return null;
  }
  const accountId = typeof match.accountId === "string" ? match.accountId.trim() : "";
  if (!accountId || accountId === "*") {
    return null;
  }
  return {
    agentId: normalizeAgentId(binding.agentId),
    accountId: normalizeAccountId(accountId),
    channelId,
  };
}

export function listBoundAccountIds(cfg: OpenClawConfig, channelId: string): string[] {
  const normalizedChannel = normalizeBindingChannelId(channelId);
  if (!normalizedChannel) {
    return [];
  }
  const ids = new Set<string>();
  for (const binding of listBindings(cfg)) {
    const resolved = resolveNormalizedBindingMatch(binding);
    if (!resolved || resolved.channelId !== normalizedChannel) {
      continue;
    }
    ids.add(resolved.accountId);
  }
  return Array.from(ids).toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultAgentBoundAccountId(
  cfg: OpenClawConfig,
  channelId: string,
): string | null {
  const normalizedChannel = normalizeBindingChannelId(channelId);
  if (!normalizedChannel) {
    return null;
  }
  const defaultAgentId = normalizeAgentId(resolveDefaultAgentId(cfg));
  for (const binding of listBindings(cfg)) {
    const resolved = resolveNormalizedBindingMatch(binding);
    if (
      !resolved ||
      resolved.channelId !== normalizedChannel ||
      resolved.agentId !== defaultAgentId
    ) {
      continue;
    }
    return resolved.accountId;
  }
  return null;
}

export function buildChannelAccountBindings(cfg: OpenClawConfig) {
  const map = new Map<string, Map<string, string[]>>();
  for (const binding of listBindings(cfg)) {
    const resolved = resolveNormalizedBindingMatch(binding);
    if (!resolved) {
      continue;
    }
    const byAgent = map.get(resolved.channelId) ?? new Map<string, string[]>();
    const list = byAgent.get(resolved.agentId) ?? [];
    if (!list.includes(resolved.accountId)) {
      list.push(resolved.accountId);
    }
    byAgent.set(resolved.agentId, list);
    map.set(resolved.channelId, byAgent);
  }
  return map;
}

export function resolvePreferredAccountId(params: {
  accountIds: string[];
  defaultAccountId: string;
  boundAccounts: string[];
}): string {
  if (params.boundAccounts.length > 0) {
    return params.boundAccounts[0];
  }
  return params.defaultAccountId;
}
