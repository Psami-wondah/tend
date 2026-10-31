import { toMajorString } from "../money";

/**
 * Thin PayPal REST client for the calls the Agent Toolkit doesn't cover
 * (Payouts, webhook verification) and for server-side Checkout.
 * Sandbox only unless PAYPAL_ENV=live.
 */

const BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cached: { token: string; expiresAt: number } | null = null;

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError("oauth", res.status, await res.text());
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

export class PayPalError extends Error {
  constructor(
    public op: string,
    public status: number,
    public body: string,
  ) {
    super(`PayPal ${op} failed (${status}): ${body.slice(0, 500)}`);
  }
}

async function call<T>(
  op: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new PayPalError(op, res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

// --- Checkout: family members topping up the pot ----------------------------

export async function createTopUpOrder(opts: {
  amountMinor: number;
  currency: string;
  contributionId: string;
  description: string;
}) {
  return call<{ id: string; status: string }>(
    "create_order",
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: opts.contributionId,
          custom_id: opts.contributionId,
          description: opts.description.slice(0, 127),
          amount: { currency_code: opts.currency, value: toMajorString(opts.amountMinor) },
        },
      ],
    },
    { "PayPal-Request-Id": `topup-${opts.contributionId}` },
  );
}

export async function captureOrder(orderId: string) {
  return call<{
    id: string;
    status: string;
    purchase_units: { payments?: { captures?: { id: string; status: string }[] } }[];
  }>("capture_order", "POST", `/v2/checkout/orders/${orderId}/capture`, {}, {
    "PayPal-Request-Id": `capture-${orderId}`,
  });
}

// --- Payouts: Tend paying pharmacies and carers from the pot ---------------

export interface PayoutResult {
  batchId: string;
  batchStatus: string;
}

/**
 * Send one payout. sender_batch_id = intent id, so retrying the same intent
 * can never pay twice — PayPal rejects duplicate batch ids.
 */
export async function sendPayout(opts: {
  intentId: string;
  receiverEmail: string;
  amountMinor: number;
  currency: string;
  note: string;
}): Promise<PayoutResult> {
  const res = await call<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "create_payout",
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: opts.intentId,
        email_subject: "You have a payment from Tend",
        email_message: opts.note.slice(0, 1000),
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: opts.receiverEmail,
          sender_item_id: opts.intentId,
          note: opts.note.slice(0, 4000),
          amount: { currency: opts.currency, value: toMajorString(opts.amountMinor) },
        },
      ],
    },
  );
  return {
    batchId: res.batch_header.payout_batch_id,
    batchStatus: res.batch_header.batch_status,
  };
}

export async function getPayoutBatch(batchId: string) {
  return call<{
    batch_header: { batch_status: string };
    items?: {
      payout_item_id: string;
      transaction_id?: string;
      transaction_status: string;
      errors?: { message?: string };
    }[];
  }>("get_payout", "GET", `/v1/payments/payouts/${batchId}`);
}

// --- Webhooks ----------------------------------------------------------------

export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const res = await call<{ verification_status: string }>(
    "verify_webhook",
    "POST",
    "/v1/notifications/verify-webhook-signature",
    {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    },
  );
  return res.verification_status === "SUCCESS";
}
