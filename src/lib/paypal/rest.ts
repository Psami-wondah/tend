import { toMajorString } from "../money";

/**
 * Thin PayPal REST client for the calls the Agent Toolkit doesn't cover
 * (Payouts, webhook verification) and for server-side Checkout.
 * Sandbox only unless PAYPAL_ENV=live.
 *
 * With no credentials, Tend runs in demo mode: the same calls return
 * simulated results with SIM- ids, so the whole flow can be tried before
 * any keys exist. The UI labels every simulated transaction.
 */

const BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cached: { token: string; expiresAt: number } | null = null;

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export type PayPalMode = "sandbox" | "live" | "simulated";

export function paypalMode(): PayPalMode {
  if (!paypalConfigured() || process.env.TEND_SIMULATE_PAYPAL === "1") return "simulated";
  return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
}

export const simulated = () => paypalMode() === "simulated";

/** Simulated ids all start with SIM- so they can never be mistaken for PayPal's. */
export const isSimulatedId = (id: string | null | undefined) => Boolean(id?.startsWith("SIM-"));

const simId = (kind: string, seed: string) => `SIM-${kind}-${seed.replace(/-/g, "").slice(0, 12).toUpperCase()}`;

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
  if (simulated()) return { id: simId("ORDER", opts.contributionId), status: "CREATED" };
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
  if (isSimulatedId(orderId)) {
    return { id: orderId, status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: simId("CAPTURE", orderId), status: "COMPLETED" }] } }] };
  }
  return call<{
    id: string;
    status: string;
    purchase_units: { payments?: { captures?: { id: string; status: string }[] } }[];
  }>("capture_order", "POST", `/v2/checkout/orders/${orderId}/capture`, {}, {
    "PayPal-Request-Id": `capture-${orderId}`,
  });
}

// --- Cooling-off: authorize now, capture or void later ---------------------
//
// The person pays from their own PayPal. Tend creates an order with intent
// AUTHORIZE: once they approve, the money is held in their account (up to
// 29 days; capture within the 3-day honor period). Tend captures when the
// hold ends or someone in the circle lets it go, and voids it if anyone
// stops it. Nothing leaves their account until capture.

export async function createAuthorizeOrder(opts: {
  intentId: string;
  amountMinor: number;
  currency: string;
  description: string;
  vaultId?: string | null;
}) {
  if (simulated()) return { id: simId("ORDER", opts.intentId), status: opts.vaultId ? "COMPLETED" : "CREATED" };
  return call<{ id: string; status: string; links?: { rel: string; href: string }[] }>(
    "create_authorize_order",
    "POST",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: opts.intentId,
          custom_id: opts.intentId,
          description: opts.description.slice(0, 127),
          amount: { currency_code: opts.currency, value: toMajorString(opts.amountMinor) },
        },
      ],
      ...(opts.vaultId ? { payment_source: { paypal: { vault_id: opts.vaultId } } } : {}),
    },
    { "PayPal-Request-Id": `auth-order-${opts.intentId}` },
  );
}

export interface Authorization {
  id: string;
  status: string;
  expiresAt: string | null;
}

/** After the payer approves: place the hold. */
export async function authorizeOrder(orderId: string): Promise<Authorization> {
  if (isSimulatedId(orderId)) {
    return { id: orderId.replace("ORDER", "AUTH"), status: "CREATED", expiresAt: new Date(Date.now() + 29 * 864e5).toISOString() };
  }
  const res = await call<{
    status: string;
    purchase_units: { payments?: { authorizations?: { id: string; status: string; expiration_time?: string }[] } }[];
  }>("authorize_order", "POST", `/v2/checkout/orders/${orderId}/authorize`, {}, { "PayPal-Request-Id": `authorize-${orderId}` });
  const a = res.purchase_units[0]?.payments?.authorizations?.[0];
  if (!a) throw new PayPalError("authorize_order", 200, `No authorization in response: ${JSON.stringify(res).slice(0, 300)}`);
  return { id: a.id, status: a.status, expiresAt: a.expiration_time ?? null };
}

/** A vaulted order (buyer not present) may come back already authorized. */
export function authorizationFromOrder(order: unknown): Authorization | null {
  const o = order as { purchase_units?: { payments?: { authorizations?: { id: string; status: string; expiration_time?: string }[] } }[] };
  const a = o.purchase_units?.[0]?.payments?.authorizations?.[0];
  return a ? { id: a.id, status: a.status, expiresAt: a.expiration_time ?? null } : null;
}

export async function captureAuthorization(authorizationId: string, intentId: string) {
  if (isSimulatedId(authorizationId)) return { id: authorizationId.replace("AUTH", "CAPTURE"), status: "COMPLETED" };
  return call<{ id: string; status: string }>(
    "capture_authorization",
    "POST",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { final_capture: true, invoice_id: intentId.slice(0, 127) },
    { "PayPal-Request-Id": `capture-auth-${authorizationId}` },
  );
}

export async function voidAuthorization(authorizationId: string) {
  if (isSimulatedId(authorizationId)) return { status: "VOIDED" };
  await call("void_authorization", "POST", `/v2/payments/authorizations/${authorizationId}/void`, undefined, {
    "PayPal-Request-Id": `void-${authorizationId}`,
  });
  return { status: "VOIDED" };
}

export async function getAuthorization(authorizationId: string) {
  if (isSimulatedId(authorizationId)) return { id: authorizationId, status: "CREATED" };
  return call<{ id: string; status: string; expiration_time?: string }>("get_authorization", "GET", `/v2/payments/authorizations/${authorizationId}`);
}

// --- JS SDK v6: a browser-safe client token ------------------------------------

export async function clientToken(domain: string): Promise<{ accessToken: string; expiresIn: number }> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal isn't configured");
  const body = new URLSearchParams({ grant_type: "client_credentials", response_type: "client_token" });
  body.append("domains[]", domain);
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new PayPalError("client_token", res.status, await res.text());
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

// --- Vault (Payment Method Tokens v3): save the person's PayPal once ---------

export async function createVaultSetupToken(opts: { memberId: string; returnUrl: string; cancelUrl: string; customerId?: string | null }) {
  if (simulated()) return { id: simId("SETUP", opts.memberId), approveUrl: null as string | null };
  const res = await call<{ id: string; links?: { rel: string; href: string }[] }>(
    "create_setup_token",
    "POST",
    "/v3/vault/setup-tokens",
    {
      ...(opts.customerId ? { customer: { id: opts.customerId } } : {}),
      payment_source: {
        paypal: {
          description: "Tend pays repeat bills you've agreed to, inside your circle's rules",
          usage_pattern: "IMMEDIATE",
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          permit_multiple_payment_tokens: false,
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
            brand_name: "Tend",
            return_url: opts.returnUrl,
            cancel_url: opts.cancelUrl,
          },
        },
      },
    },
    { "PayPal-Request-Id": `setup-${opts.memberId}-${Date.now()}` },
  );
  return { id: res.id, approveUrl: res.links?.find((l) => l.rel === "approve")?.href ?? null };
}

export async function createVaultPaymentToken(setupTokenId: string) {
  if (isSimulatedId(setupTokenId)) return { id: setupTokenId.replace("SETUP", "VAULT"), customerId: setupTokenId.replace("SETUP", "CUST") };
  const res = await call<{ id: string; customer?: { id: string } }>(
    "create_payment_token",
    "POST",
    "/v3/vault/payment-tokens",
    { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
    { "PayPal-Request-Id": `token-${setupTokenId}` },
  );
  return { id: res.id, customerId: res.customer?.id ?? null };
}

export async function deleteVaultPaymentToken(tokenId: string) {
  if (isSimulatedId(tokenId)) return;
  await call("delete_payment_token", "DELETE", `/v3/vault/payment-tokens/${tokenId}`);
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
  if (simulated()) return { batchId: simId("BATCH", opts.intentId), batchStatus: "PENDING" };
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
  if (isSimulatedId(batchId)) {
    return {
      batch_header: { batch_status: "SUCCESS" },
      items: [{ payout_item_id: batchId.replace("BATCH", "ITEM"), transaction_id: batchId.replace("BATCH", "TX"), transaction_status: "SUCCESS" }],
    };
  }
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
