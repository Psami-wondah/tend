import { eq } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { alert, audit, getMember, listPayees } from "./circle";
import { createVaultPaymentToken, createVaultSetupToken, deleteVaultPaymentToken, isSimulatedId } from "./paypal/rest";
import { formatMoney } from "./money";

const { members } = schema;

/**
 * One consent, then hands-free: the person saves their PayPal once with
 * PayPal Vault (Payment Method Tokens v3), for repeat bills to payees they
 * name, up to an amount they set. Tend can then pay those bills from their
 * own wallet without them in the loop, still inside the circle's rules and
 * the cooling-off hold. They can take it back any time.
 */
export class VaultError extends Error {}

export async function startVault(opts: { memberId: string; maxPerPaymentMinor: number; payeeIds: string[]; appUrl: string }) {
  const db = await getDb();
  const me = await getMember(opts.memberId);
  if (!me || me.role !== "care_recipient") throw new VaultError("Only the person whose PayPal it is can save it.");
  const payees = (await listPayees(me.circleId)).filter((p) => opts.payeeIds.includes(p.id));
  if (!payees.length) throw new VaultError("Choose at least one payee.");
  const setup = await createVaultSetupToken({
    memberId: me.id,
    customerId: me.vaultCustomerId,
    returnUrl: `${opts.appUrl}/api/vault/return?member=${me.id}`,
    cancelUrl: `${opts.appUrl}/me?vault=cancelled`,
  });
  const consent = { maxPerPaymentMinor: opts.maxPerPaymentMinor, payeeIds: payees.map((p) => p.id), grantedAt: new Date().toISOString() };
  await db.update(members).set({ vaultTokenId: `pending:${setup.id}`, vaultConsent: consent }).where(eq(members.id, me.id));
  await audit(me.circleId, `member:${me.id}`, "vault_started", { setupTokenId: setup.id, ...consent });
  if (isSimulatedId(setup.id)) return finishVault(me.id, setup.id).then(() => ({ approveUrl: null, simulated: true }));
  return { approveUrl: setup.approveUrl, simulated: false };
}

export async function finishVault(memberId: string, setupTokenId?: string | null) {
  const db = await getDb();
  const me = await getMember(memberId);
  if (!me?.vaultTokenId?.startsWith("pending:")) throw new VaultError("There's no PayPal save waiting to finish.");
  const id = setupTokenId || me.vaultTokenId.slice("pending:".length);
  const token = await createVaultPaymentToken(id);
  await db.update(members).set({ vaultTokenId: token.id, vaultCustomerId: token.customerId ?? me.vaultCustomerId }).where(eq(members.id, me.id));
  const payees = (await listPayees(me.circleId)).filter((p) => me.vaultConsent?.payeeIds.includes(p.id));
  await audit(me.circleId, `member:${me.id}`, "vault_saved", { tokenId: token.id, simulated: isSimulatedId(token.id) });
  await alert(
    me.circleId,
    "info",
    `${me.name} saved their PayPal for repeat bills`,
    `Tend may pay ${payees.map((p) => p.name).join(", ")} up to ${formatMoney(me.vaultConsent?.maxPerPaymentMinor ?? 0)} a time from ${me.name}'s own PayPal, inside the circle's rules.`,
  );
  return token;
}

export async function revokeVault(memberId: string) {
  const db = await getDb();
  const me = await getMember(memberId);
  if (!me) throw new VaultError("Not found.");
  if (me.vaultTokenId && !me.vaultTokenId.startsWith("pending:")) await deleteVaultPaymentToken(me.vaultTokenId).catch(() => undefined);
  await db.update(members).set({ vaultTokenId: null, vaultConsent: null }).where(eq(members.id, me.id));
  await audit(me.circleId, `member:${me.id}`, "vault_revoked", {});
}
