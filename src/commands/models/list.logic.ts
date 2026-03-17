import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { ensureAuthProfileStore } from "../../agents/auth-profiles.js";
import { resolveForwardCompatModel } from "../../agents/model-forward-compat.js";
import { parseModelRef } from "../../agents/model-selection.js";
import { resolveModel } from "../../agents/pi-embedded-runner/model.js";
import { loadConfig, type OpenClawConfig } from "../../config/config.js";
import { resolveConfiguredEntries } from "./list.configured.js";
import { loadModelRegistry, toModelRow } from "./list.registry.js";
import type { ModelRow } from "./list.types.js";
import { DEFAULT_PROVIDER, isLocalBaseUrl, modelKey } from "./shared.js";

export type ModelsListOptions = {
  all?: boolean;
  local?: boolean;
  provider?: string;
};

export async function modelsListLogic(
  opts: ModelsListOptions,
  cfg: OpenClawConfig = loadConfig(),
): Promise<{ rows: ModelRow[]; error?: string }> {
  const authStore = ensureAuthProfileStore();
  const providerFilter = (() => {
    const raw = opts.provider?.trim();
    if (!raw) {
      return undefined;
    }
    const parsed = parseModelRef(`${raw}/_`, DEFAULT_PROVIDER);
    return parsed?.provider ?? raw.toLowerCase();
  })();

  let models: Model<Api>[] = [];
  let modelRegistry: ModelRegistry | undefined;
  let availableKeys: Set<string> | undefined;
  let error: string | undefined;

  try {
    const loaded = await loadModelRegistry(cfg);
    modelRegistry = loaded.registry;
    models = loaded.models;
    availableKeys = loaded.availableKeys;
    if (loaded.availabilityErrorMessage !== undefined) {
      error = `Model availability lookup failed; falling back to auth heuristics for discovered models: ${loaded.availabilityErrorMessage}`;
    }
  } catch (err) {
    // Registry completely failed — no model data available, fail fast.
    return { rows: [], error: `Model registry unavailable: ${String(err)}` };
  }

  const modelByKey = new Map(models.map((model) => [modelKey(model.provider, model.id), model]));

  const { entries } = resolveConfiguredEntries(cfg);
  const configuredByKey = new Map(entries.map((entry) => [entry.key, entry]));

  const rows: ModelRow[] = [];

  if (opts.all) {
    const sorted = [...models].toSorted((a, b) => {
      const p = a.provider.localeCompare(b.provider);
      if (p !== 0) {
        return p;
      }
      return a.id.localeCompare(b.id);
    });

    for (const model of sorted) {
      if (providerFilter && model.provider.toLowerCase() !== providerFilter) {
        continue;
      }
      if (opts.local && !isLocalBaseUrl(model.baseUrl)) {
        continue;
      }
      const key = modelKey(model.provider, model.id);
      const configured = configuredByKey.get(key);
      rows.push(
        toModelRow({
          model,
          key,
          tags: configured ? Array.from(configured.tags) : [],
          aliases: configured?.aliases ?? [],
          availableKeys,
          cfg,
          authStore,
        }),
      );
    }
  } else {
    for (const entry of entries) {
      if (providerFilter && entry.ref.provider.toLowerCase() !== providerFilter) {
        continue;
      }
      let model = modelByKey.get(entry.key);
      if (!model && modelRegistry) {
        const forwardCompat = resolveForwardCompatModel(
          entry.ref.provider,
          entry.ref.model,
          modelRegistry,
        );
        if (forwardCompat) {
          model = forwardCompat;
          modelByKey.set(entry.key, forwardCompat);
        }
      }
      if (!model && modelRegistry) {
        model = resolveModel(entry.ref.provider, entry.ref.model, undefined, cfg).model;
      }
      if (opts.local && model && !isLocalBaseUrl(model.baseUrl)) {
        continue;
      }
      if (opts.local && !model) {
        continue;
      }
      rows.push(
        toModelRow({
          model,
          key: entry.key,
          tags: Array.from(entry.tags),
          aliases: entry.aliases,
          availableKeys,
          cfg,
          authStore,
        }),
      );
    }
  }

  return { rows, error };
}
