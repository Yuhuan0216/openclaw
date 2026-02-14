import { z } from "zod";
import type { BridgeCommand, BridgeRegistry } from "../types.js";
import { listAgentIds } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { resolveAgentMainSessionKey } from "../../config/sessions.js";
import { loadSessionEntry } from "../../gateway/session-utils.js";

const AgentsListSchema = z.object({
  filter: z.string().optional(),
});

const AgentsStatusSchema = z.object({
  agentId: z.string(),
});

export function wireAgentsBridgeCommands(registry: BridgeRegistry) {
  registry.register({
    name: "agents.list",
    description: "List all available agents and their basic status",
    schema: AgentsListSchema,
    handler: async (args, context) => {
      if (!context.isAdmin) {
        return {
          success: false,
          error: "Unauthorized: Admin access required",
        };
      }

      const config = loadConfig();
      const agentIds = listAgentIds(config);

      const agents = agentIds.map((id) => {
        // Resolve main session for basic info
        const sessionKey = resolveAgentMainSessionKey({ cfg: config, agentId: id });
        const { entry } = loadSessionEntry(sessionKey);

        return {
          id,
          name: entry?.label || id, // Fallback to ID if no label
          model: entry?.modelOverride || "default",
          provider: entry?.providerOverride || "default",
        };
      });

      // Filter if requested (substring match on id or name)
      const filtered = args.filter
        ? agents.filter((a) => a.id.startsWith(args.filter!) || a.name.startsWith(args.filter!))
        : agents;

      return {
        success: true,
        data: { agents: filtered },
        view: "table",
      };
    },
  });

  registry.register({
    name: "agents.status",
    description: "Get detailed status for a specific agent",
    schema: AgentsStatusSchema,
    handler: async (args, context) => {
      if (!context.isAdmin) {
        return {
          success: false,
          error: "Unauthorized: Admin access required",
        };
      }

      const config = loadConfig();
      const agentIds = listAgentIds(config);

      if (!agentIds.includes(args.agentId)) {
        return {
          success: false,
          error: `Agent '${args.agentId}' not found`,
        };
      }

      const sessionKey = resolveAgentMainSessionKey({ cfg: config, agentId: args.agentId });
      const { entry, storePath } = loadSessionEntry(sessionKey);

      // Gather stats (mock placeholder for now, real stats would come from session store/metrics)
      const stats = {
        sessionKey,
        storePath,
        lastActive: entry?.updatedAt ? new Date(entry.updatedAt).toISOString() : "never",
        model: entry?.modelOverride,
        provider: entry?.providerOverride,
        capabilities: config.agents?.[args.agentId]?.capabilities || [],
        description: config.agents?.[args.agentId]?.description,
      };

      return {
        success: true,
        data: stats,
        view: "json",
      };
    },
  });
}
