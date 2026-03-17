import { z } from "zod";
import {
  modelsAuthListLogic,
  type ModelsAuthListOptions,
} from "../../commands/models/auth-list.logic.js";
import {
  performAuthSwitch,
  getAuthSwitchContext,
} from "../../commands/models/auth-switch.logic.js";
import { modelsListLogic, type ModelsListOptions } from "../../commands/models/list.logic.js";
import type { BridgeRegistry, BridgeResult } from "../types.js";

// Schemas
const ModelsListSchema = z.object({
  all: z.boolean().optional(),
  local: z.boolean().optional(),
  provider: z.string().optional(),
});

const ModelsAuthListSchema = z.object({
  provider: z.string().optional(),
  agent: z.string().optional(),
});

const ModelsSwitchSchema = z.object({
  provider: z.string(),
  profile: z.string(),
  agent: z.string().optional(),
});

// Adapter helper
function success<T>(data: T, view?: BridgeResult["view"]): BridgeResult<T> {
  return { success: true, data, view };
}

function failure(error: string): BridgeResult {
  return { success: false, error };
}

export function wireModelsBridgeCommands(registry: BridgeRegistry) {
  // 1. models.list
  registry.register({
    name: "models.list",
    description: "List available models and their status",
    schema: ModelsListSchema,
    handler: async (args: ModelsListOptions) => {
      try {
        const { rows, error } = await modelsListLogic(args);
        // Partial success is still success in list logic, but we can signal warnings if needed
        return {
          success: true,
          data: rows,
          error, // Pass through partial error
          view: "table",
        };
      } catch (err) {
        return failure(String(err));
      }
    },
  });

  // 2. models.auth.list
  registry.register({
    name: "models.auth.list",
    description: "List authentication profiles",
    schema: ModelsAuthListSchema,
    handler: async (args: ModelsAuthListOptions) => {
      try {
        const result = await modelsAuthListLogic(args);
        return success(result, "table");
      } catch (err) {
        return failure(String(err));
      }
    },
  });

  // 3. models.switch
  registry.register({
    name: "models.switch",
    description: "Switch active model profile",
    schema: ModelsSwitchSchema,
    handler: async (args: z.infer<typeof ModelsSwitchSchema>) => {
      try {
        const ctx = getAuthSwitchContext({ provider: args.provider, agent: args.agent });
        await performAuthSwitch(ctx, args.profile);
        return success({ message: `Switched ${args.provider} to ${args.profile}` }, "text");
      } catch (err) {
        return failure(String(err));
      }
    },
  });
}
