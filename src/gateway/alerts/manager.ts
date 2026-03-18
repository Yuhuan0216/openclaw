import type { CliDeps } from "../../cli/deps.js";
import { getChildLogger } from "../../logging.js";
import { type SystemAlert, formatAlertMessage } from "./format.js";

const logger = getChildLogger({ module: "alerts" });

export class AlertManager {
  private deps: CliDeps;

  constructor(deps: CliDeps) {
    this.deps = deps;
  }

  /**
   * Broadcasts a critical alert to all configured admin channels.
   * Bypasses the Agent runtime entirely.
   */
  async broadcast(alert: SystemAlert) {
    // Use ENV var for toggle since config type isn't extended yet
    const enabled = process.env.OPENCLAW_ALERTS_ENABLED !== "false";

    if (!enabled) {
      logger.debug({ alert }, "alerts: suppressed (disabled by env)");
      return;
    }

    // Filter by level (future: config.alerts.minLevel)
    if (alert.level === "info" || alert.level === "warning") {
      logger.info({ alert }, "alerts: system alert (log only)");
      return;
    }

    const messageText = formatAlertMessage(alert);
    // Use ENV var only (config type doesn't support users list yet)
    const targetUser = process.env.OPENCLAW_ADMIN_USER;

    if (!targetUser) {
      logger.warn(
        { alert },
        "alerts: no admin user configured to receive alerts (set OPENCLAW_ADMIN_USER)",
      );
      return;
    }

    logger.info({ alert, targetUser }, "alerts: broadcasting critical alert");

    // Strategy: Try Telegram first (Primary for Yee), then generic.
    // In the future, we can iterate all send functions in `this.deps`.

    try {
      // 1. Try Telegram (Primary)
      await (
        this.deps as { sendMessageTelegram: (to: string, text: string) => Promise<void> }
      ).sendMessageTelegram(targetUser, messageText);
    } catch (err) {
      logger.error({ err }, "alerts: failed to send to telegram");
      // TODO: Add fallbacks for Signal/WhatsApp here if needed
    }
  }
}
