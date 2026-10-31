import { aiConfigured, aiProvider, modelId } from "./agent/model";
import { paypalMode } from "./paypal/rest";

/** What's connected. Drives the demo-mode labels and the Setup page. */
export function integrations() {
  const paypal = paypalMode();
  return {
    ai: aiConfigured(),
    model: modelId(),
    aiProvider: aiProvider(),
    paypal,
    mcpToken: Boolean(process.env.TEND_MCP_TOKEN),
    webhook: Boolean(process.env.PAYPAL_WEBHOOK_ID),
    database: process.env.DATABASE_URL ? "postgres" : "embedded",
    cronSecret: Boolean(process.env.CRON_SECRET),
    channel3: Boolean(process.env.CHANNEL3_API_KEY),
    sandboxEmails: [
      "SANDBOX_PHARMACY_EMAIL",
      "SANDBOX_CARER_EMAIL",
      "SANDBOX_TAXI_EMAIL",
      "SANDBOX_ADA_EMAIL",
      "SANDBOX_TUNDE_EMAIL",
      "SANDBOX_CHIOMA_EMAIL",
      "SANDBOX_MUM_EMAIL",
      "SANDBOX_WALTER_EMAIL",
    ].map(
      (k) => ({ key: k, set: Boolean(process.env[k]?.trim()) }),
    ),
  };
}

export type Integrations = ReturnType<typeof integrations>;
