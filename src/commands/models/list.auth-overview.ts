import {
  type AuthProfileHealth,
  buildAuthHealthSummary,
  DEFAULT_OAUTH_WARN_MS,
  formatRemainingShort,
} from "../../agents/auth-health.js";
import {
  type AuthProfileStore,
  listProfilesForProvider,
  resolveAuthProfileDisplayLabel,
  resolveAuthProfileOrder,
  resolveAuthStorePathForDisplay,
  resolveProfileUnusableUntilForDisplay,
} from "../../agents/auth-profiles.js";
import { isNonSecretApiKeyMarker } from "../../agents/model-auth-markers.js";
import {
  getCustomProviderApiKey,
  resolveEnvApiKey,
  resolveUsableCustomProviderApiKey,
} from "../../agents/model-auth.js";
import type { OpenClawConfig } from "../../config/config.js";
import { shortenHomePath } from "../../utils.js";
import { maskApiKey } from "./list.format.js";
import type { ProviderAuthOverview } from "./list.types.js";

export type ProfileDisplayStatus =
  | "ok"
  | "expiring"
  | "expired"
  | "static"
  | "cooldown"
  | "disabled"
  | "missing";

export type ProfileDisplayInfo = {
  profileId: string;
  provider: string;
  type: "oauth" | "token" | "api_key";
  status: ProfileDisplayStatus;
  active: boolean;
  email?: string;
  detail: string;
  expiresAt?: number;
  remainingMs?: number;
};

/**
 * Resolve display info for all profiles of a provider, merging health status
 * with cooldown/disabled state. The first profile from resolveAuthProfileOrder()
 * is marked as active.
 */
export function resolveProfileDisplayInfos(params: {
  provider: string;
  cfg: OpenClawConfig;
  store: AuthProfileStore;
}): ProfileDisplayInfo[] {
  const { provider, cfg, store } = params;
  const now = Date.now();
  const profileIds = listProfilesForProvider(store, provider);
  if (profileIds.length === 0) {
    return [];
  }

  // Build health summary for these profiles
  const health = buildAuthHealthSummary({
    store,
    cfg,
    warnAfterMs: DEFAULT_OAUTH_WARN_MS,
    providers: [provider],
  });
  const healthMap = new Map<string, AuthProfileHealth>();
  for (const h of health.profiles) {
    healthMap.set(h.profileId, h);
  }

  // Determine active profile via order resolution
  const ordered = resolveAuthProfileOrder({ cfg, store, provider });
  const activeProfileId = ordered.length > 0 ? ordered[0] : undefined;

  return profileIds.map((profileId) => {
    const cred = store.profiles[profileId];
    const h = healthMap.get(profileId);
    const type: "oauth" | "token" | "api_key" = cred?.type ?? "oauth";
    const active = profileId === activeProfileId;

    // Resolve email
    const configEmail = cfg.auth?.profiles?.[profileId]?.email?.trim();
    const email = configEmail || (cred && "email" in cred ? cred.email?.trim() : undefined);

    // Check cooldown/disabled status (overrides health status)
    const unusableUntil = resolveProfileUnusableUntilForDisplay(store, profileId);
    const isUnusable = unusableUntil !== null && now < unusableUntil;
    const stats = store.usageStats?.[profileId];
    const isDisabled =
      isUnusable && typeof stats?.disabledUntil === "number" && now < stats.disabledUntil;

    let status: ProfileDisplayStatus;
    if (isDisabled) {
      status = "disabled";
    } else if (isUnusable) {
      status = "cooldown";
    } else {
      status = h?.status ?? "missing";
    }

    // Build detail string
    let detail = "";
    if (type === "api_key") {
      detail = maskApiKey(cred?.type === "api_key" ? (cred.key ?? "") : "");
    } else if (type === "token") {
      detail = cred?.type === "token" ? maskApiKey(cred.token ?? "") : "";
    } else {
      detail = email ?? "";
    }

    // Append remaining time for expirable types
    if (h?.remainingMs !== undefined && h.remainingMs > 0 && status !== "static") {
      detail += detail
        ? ` (${formatRemainingShort(h.remainingMs)} remaining)`
        : `${formatRemainingShort(h.remainingMs)} remaining`;
    }

    // Append cooldown/disabled remaining
    if (isUnusable && unusableUntil) {
      const remaining = formatRemainingShort(unusableUntil - now);
      const kind = isDisabled
        ? `disabled${stats?.disabledReason ? `:${stats.disabledReason}` : ""}`
        : "cooldown";
      detail += detail ? ` [${kind} ${remaining}]` : `[${kind} ${remaining}]`;
    }

    return {
      profileId,
      provider,
      type,
      status,
      active,
      email,
      detail,
      expiresAt: h?.expiresAt,
      remainingMs: h?.remainingMs,
    };
  });
}

function formatMarkerOrSecret(value: string): string {
  return isNonSecretApiKeyMarker(value, { includeEnvVarName: false })
    ? `marker(${value.trim()})`
    : maskApiKey(value);
}

function formatProfileSecretLabel(params: {
  value: string | undefined;
  ref: { source: string; id: string } | undefined;
  kind: "api-key" | "token";
}): string {
  const value = typeof params.value === "string" ? params.value.trim() : "";
  if (value) {
    const display = formatMarkerOrSecret(value);
    return params.kind === "token" ? `token:${display}` : display;
  }
  if (params.ref) {
    const refLabel = `ref(${params.ref.source}:${params.ref.id})`;
    return params.kind === "token" ? `token:${refLabel}` : refLabel;
  }
  return params.kind === "token" ? "token:missing" : "missing";
}

export function resolveProviderAuthOverview(params: {
  provider: string;
  cfg: OpenClawConfig;
  store: AuthProfileStore;
  modelsPath: string;
}): ProviderAuthOverview {
  const { provider, cfg, store } = params;
  const now = Date.now();
  const profiles = listProfilesForProvider(store, provider);
  const withUnusableSuffix = (base: string, profileId: string) => {
    const unusableUntil = resolveProfileUnusableUntilForDisplay(store, profileId);
    if (!unusableUntil || now >= unusableUntil) {
      return base;
    }
    const stats = store.usageStats?.[profileId];
    const kind =
      typeof stats?.disabledUntil === "number" && now < stats.disabledUntil
        ? `disabled${stats.disabledReason ? `:${stats.disabledReason}` : ""}`
        : "cooldown";
    const remaining = formatRemainingShort(unusableUntil - now);
    return `${base} [${kind} ${remaining}]`;
  };
  const labels = profiles.map((profileId) => {
    const profile = store.profiles[profileId];
    if (!profile) {
      return `${profileId}=missing`;
    }
    if (profile.type === "api_key") {
      return withUnusableSuffix(
        `${profileId}=${formatProfileSecretLabel({
          value: profile.key,
          ref: profile.keyRef,
          kind: "api-key",
        })}`,
        profileId,
      );
    }
    if (profile.type === "token") {
      return withUnusableSuffix(
        `${profileId}=${formatProfileSecretLabel({
          value: profile.token,
          ref: profile.tokenRef,
          kind: "token",
        })}`,
        profileId,
      );
    }
    const display = resolveAuthProfileDisplayLabel({ cfg, store, profileId });
    const suffix =
      display === profileId
        ? ""
        : display.startsWith(profileId)
          ? display.slice(profileId.length).trim()
          : `(${display})`;
    const base = `${profileId}=OAuth${suffix ? ` ${suffix}` : ""}`;
    return withUnusableSuffix(base, profileId);
  });
  const oauthCount = profiles.filter((id) => store.profiles[id]?.type === "oauth").length;
  const tokenCount = profiles.filter((id) => store.profiles[id]?.type === "token").length;
  const apiKeyCount = profiles.filter((id) => store.profiles[id]?.type === "api_key").length;

  const envKey = resolveEnvApiKey(provider);
  const customKey = getCustomProviderApiKey(cfg, provider);
  const usableCustomKey = resolveUsableCustomProviderApiKey({ cfg, provider });

  const effective: ProviderAuthOverview["effective"] = (() => {
    if (profiles.length > 0) {
      return {
        kind: "profiles",
        detail: shortenHomePath(resolveAuthStorePathForDisplay()),
      };
    }
    if (envKey) {
      const isOAuthEnv =
        envKey.source.includes("OAUTH_TOKEN") || envKey.source.toLowerCase().includes("oauth");
      return {
        kind: "env",
        detail: isOAuthEnv ? "OAuth (env)" : maskApiKey(envKey.apiKey),
      };
    }
    if (usableCustomKey) {
      return { kind: "models.json", detail: formatMarkerOrSecret(usableCustomKey.apiKey) };
    }
    return { kind: "missing", detail: "missing" };
  })();

  return {
    provider,
    effective,
    profiles: {
      count: profiles.length,
      oauth: oauthCount,
      token: tokenCount,
      apiKey: apiKeyCount,
      labels,
    },
    ...(envKey
      ? {
          env: {
            value:
              envKey.source.includes("OAUTH_TOKEN") || envKey.source.toLowerCase().includes("oauth")
                ? "OAuth (env)"
                : maskApiKey(envKey.apiKey),
            source: envKey.source,
          },
        }
      : {}),
    ...(customKey
      ? {
          modelsJson: {
            value: formatMarkerOrSecret(customKey),
            source: `models.json: ${shortenHomePath(params.modelsPath)}`,
          },
        }
      : {}),
  };
}
