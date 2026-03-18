import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { upsertAuthProfile } from "../../agents/auth-profiles.js";
import type { AuthProfileCredential } from "../../agents/auth-profiles/types.js";
import { resolveDefaultAgentWorkspaceDir } from "../../agents/workspace.js";
import { formatCliCommand } from "../../cli/command-format.js";
import { readConfigFileSnapshot } from "../../config/config.js";
import { applyAuthProfileConfig } from "../../plugins/provider-auth-helpers.js";
import { resolvePluginProviders } from "../../plugins/providers.js";
import type { ProviderAuthResult, ProviderPlugin } from "../../plugins/types.js";
import {
  applyDefaultModel,
  mergeConfigPatch,
  pickAuthMethod,
  resolveProviderMatch,
} from "../provider-auth-helpers.js";
import { updateConfig } from "./shared.js";

// Helper Types
export type LoginResultHandlerParams = {
  result: ProviderAuthResult;
  agentDir: string;
  setDefault?: boolean;
};

// Pure logic for handling login results
export async function handleLoginResult(params: LoginResultHandlerParams) {
  const { result, agentDir, setDefault } = params;

  // 1. Save Profiles
  for (const profile of result.profiles) {
    upsertAuthProfile({
      profileId: profile.profileId,
      credential: profile.credential,
      agentDir,
    });
  }

  // 2. Update Config
  await updateConfig((cfg) => {
    let next = cfg;
    if (result.configPatch) {
      next = mergeConfigPatch(next, result.configPatch);
    }
    for (const profile of result.profiles) {
      next = applyAuthProfileConfig(next, {
        profileId: profile.profileId,
        provider: profile.credential.provider,
        mode: credentialMode(profile.credential),
      });
    }
    if (setDefault && result.defaultModel) {
      next = applyDefaultModel(next, result.defaultModel);
    }
    return next;
  });
}

// Logic for resolving provider/method (non-interactive matching)
export function resolveLoginTarget(
  providers: ProviderPlugin[],
  opts: { provider?: string; method?: string },
) {
  const provider = resolveProviderMatch(providers, opts.provider);
  const method = provider ? pickAuthMethod(provider, opts.method) : null;
  return { provider, method };
}

// Logic for preparing environment
export async function prepareLoginEnv() {
  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid) {
    throw new Error(`Invalid config at ${snapshot.path}`);
  }
  const config = snapshot.config;
  const defaultAgentId = resolveDefaultAgentId(config);
  const agentDir = resolveAgentDir(config, defaultAgentId);
  const workspaceDir =
    resolveAgentWorkspaceDir(config, defaultAgentId) ?? resolveDefaultAgentWorkspaceDir();
  const providers = resolvePluginProviders({ config, workspaceDir });

  return { config, agentDir, workspaceDir, providers };
}

export function resolveRequestedLoginProviderOrThrow(
  providers: ProviderPlugin[],
  rawProvider?: string,
): ProviderPlugin | null {
  const requested = rawProvider?.trim();
  if (!requested) {
    return null;
  }
  const matched = resolveProviderMatch(providers, requested);
  if (matched) {
    return matched;
  }
  const available = providers
    .map((provider) => provider.id)
    .filter(Boolean)
    .toSorted((a, b) => a.localeCompare(b));
  const availableText = available.length > 0 ? available.join(", ") : "(none)";
  throw new Error(
    `Unknown provider "${requested}". Loaded providers: ${availableText}. Verify plugins via \`${formatCliCommand("openclaw plugins list --json")}\`.`,
  );
}

export function credentialMode(credential: AuthProfileCredential): "api_key" | "oauth" | "token" {
  if (credential.type === "api_key") {
    return "api_key";
  }
  if (credential.type === "token") {
    return "token";
  }
  return "oauth";
}
