import { describe, expect, it, vi, beforeEach } from "vitest";
import { CommandBridgeRegistry } from "../registry.js";
import { BridgeContext } from "../types.js";
import { wireAgentsBridgeCommands } from "./agents.js";

// Mock dependencies
vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(() => ({
    agents: {
      main: { capabilities: ["test"], description: "Main Agent" },
      test: { capabilities: [], description: "Test Agent" },
    },
  })),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  listAgentIds: vi.fn(() => ["main", "test"]),
}));

vi.mock("../../config/sessions.js", () => ({
  resolveAgentMainSessionKey: vi.fn(({ agentId }) => `agent:${agentId}:session`),
}));

vi.mock("../../gateway/session-utils.js", () => ({
  loadSessionEntry: vi.fn((key) => ({
    entry: {
      label: key.includes("main") ? "Main Agent" : "Test Agent",
      modelOverride: "gpt-4",
      providerOverride: "openai",
      updatedAt: Date.now(),
    },
    storePath: "/tmp/sessions.json",
  })),
}));

describe("Agents Bridge Commands", () => {
  let registry: CommandBridgeRegistry;

  beforeEach(() => {
    registry = new CommandBridgeRegistry();
    wireAgentsBridgeCommands(registry);
  });

  const adminContext: BridgeContext = {
    channel: "test",
    isAdmin: true,
  };

  const userContext: BridgeContext = {
    channel: "test",
    isAdmin: false,
  };

  describe("agents.list", () => {
    it("should list agents for admin", async () => {
      const cmd = registry.get("agents.list");
      expect(cmd).toBeDefined();

      // @ts-ignore
      const result = await cmd!.handler({}, adminContext);
      expect(result.success).toBe(true);
      const data = result.data as { agents: any[] };
      expect(data.agents).toHaveLength(2);
      expect(data.agents[0].id).toBe("main");
    });

    it("should filter agents", async () => {
      const cmd = registry.get("agents.list");
      // @ts-ignore
      const result = await cmd!.handler({ filter: "main" }, adminContext);
      expect(result.success).toBe(true);
      const data = result.data as { agents: any[] };
      expect(data.agents).toHaveLength(1);
      expect(data.agents[0].id).toBe("main");
    });

    it("should handle empty filter gracefully", async () => {
      const cmd = registry.get("agents.list");
      // @ts-ignore
      const result = await cmd!.handler({ filter: "" }, adminContext);
      expect(result.success).toBe(true);
      const data = result.data as { agents: any[] };
      expect(data.agents).toHaveLength(2);
    });

    it("should deny access for non-admin", async () => {
      const cmd = registry.get("agents.list");
      // @ts-ignore
      const result = await cmd!.handler({}, userContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unauthorized");
    });
  });

  describe("agents.status", () => {
    it("should return status for existing agent", async () => {
      const cmd = registry.get("agents.status");
      // @ts-ignore
      const result = await cmd!.handler({ agentId: "main" }, adminContext);
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.sessionKey).toBe("agent:main:session");
    });

    it("should return error for unknown agent", async () => {
      const cmd = registry.get("agents.status");
      // @ts-ignore
      const result = await cmd!.handler({ agentId: "unknown" }, adminContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should deny access for non-admin", async () => {
      const cmd = registry.get("agents.status");
      // @ts-ignore
      const result = await cmd!.handler({ agentId: "main" }, userContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unauthorized");
    });
  });
});
