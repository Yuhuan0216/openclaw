import { spawn } from "child_process";
import type { BridgeContext } from "../bridge/types.js";

interface BridgeResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  view?: string;
}

export class OpenClawClient {
  constructor(private binPath: string = process.env.OPENCLAW_BIN || "openclaw") {}

  async execute<T>(
    action: string,
    args: Record<string, unknown> = {},
    context: Partial<BridgeContext> = {},
    timeoutMs: number = 5000,
  ): Promise<BridgeResponse<T>> {
    const isTsFile = this.binPath.endsWith(".ts");
    const isJsFile = this.binPath.endsWith(".js");
    const cmd = isTsFile ? "npx" : isJsFile ? "node" : this.binPath;
    const cmdArgs = isTsFile
      ? ["tsx", this.binPath, "bridge"]
      : isJsFile
        ? [this.binPath, "bridge"]
        : ["bridge"];

    return new Promise((resolve, reject) => {
      // Allow caller to override defaults, but default to safe values if not provided
      const ctx: BridgeContext = {
        channel: "opencode-client",
        isAdmin: true, // Legacy default, but now overridable
        ...context,
      };

      const payload = JSON.stringify({
        action,
        args,
        context: ctx,
      });

      const child = spawn(cmd, cmdArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          try {
            const errResponse = JSON.parse(stdout);
            resolve(errResponse);
          } catch {
            reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
          }
          return;
        }

        try {
          const response = JSON.parse(stdout);
          resolve(response);
        } catch (err) {
          reject(new Error(`Failed to parse response: ${String(err)}\nOutput: ${stdout}`));
        }
      });

      child.stdin.write(payload);
      child.stdin.end();
    });
  }
}

// Example usage if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new OpenClawClient();
  console.log("Fetching agents...");
  client.execute("agents.list", {}, { isAdmin: true }).then(console.log).catch(console.error);
}
