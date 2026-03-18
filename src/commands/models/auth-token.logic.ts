import { upsertAuthProfile } from "../../agents/auth-profiles.js";
import { normalizeProviderId } from "../../agents/model-selection.js";
import type { OpenClawConfig } from "../../config/config.js";
import { applyAuthProfileConfig } from "../../plugins/provider-auth-helpers.js";
import { updateConfig } from "./shared.js";

export type SaveTokenProfileParams = {
  provider: string;
  profileId: string;
  token: string;
  expiresAt?: number;
};

export async function saveTokenProfile(params: SaveTokenProfileParams): Promise<void> {
  const { provider, profileId, token, expiresAt } = params;
  const normalizedProvider = normalizeProviderId(provider);

  upsertAuthProfile({
    profileId,
    credential: {
      type: "token",
      provider: normalizedProvider,
      token,
      ...(expiresAt ? { expires: expiresAt } : {}),
    },
  });

  await updateConfig((cfg: OpenClawConfig) =>
    applyAuthProfileConfig(cfg, {
      profileId,
      provider: normalizedProvider,
      mode: "token",
    }),
  );
}

export function resolveDefaultTokenProfileId(provider: string): string {
  return `${normalizeProviderId(provider)}:manual`;
}
