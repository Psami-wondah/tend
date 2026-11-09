import { desc, eq } from "drizzle-orm";
import { generateObject } from "ai";
import { getDb, schema } from "./db/client";
import { activeMandate, alert, audit, getCircle, getMember } from "./circle";
import { applyProposal, describeRulesForModel, diffMandates, RuleProposalSchema, validateMandate, type RuleChange } from "./mandate/edit";
import { parseRuleRequestOffline } from "./agent/offline";
import { aiConfigured, model } from "./agent/model";
import { isFamily } from "./people";
import type { Mandate } from "./mandate/types";
import { releaseHolds } from "./agent/approvals";

const { mandates, members } = schema;

export class RulesError extends Error {}

/**
 * Save a new mandate version. Rules are never edited in place: each save is
 * a new version with who changed what, so the family can see and undo it.
 */
export async function saveMandate(memberId: string, next: Mandate) {
  const db = await getDb();
  const circle = await getCircle();
  const member = await getMember(memberId);
  if (!member || member.circleId !== circle.id || !isFamily(member)) throw new RulesError("Only people in the circle can change the rules.");
  const problems = validateMandate(next);
  if (problems.length) throw new RulesError(problems.join(" "));
  const current = await activeMandate(circle.id);
  const changes = diffMandates(current, next, circle.currency);
  if (!changes.length) throw new RulesError("Nothing changed.");
  const version = current.version + 1;
  await db.insert(mandates).values({ circleId: circle.id, version, rules: { ...next, version }, createdBy: member.id });
  await audit(circle.id, `member:${member.id}`, "mandate_changed", {
    from: current.version,
    to: version,
    changes: changes.map((c) => ({ label: c.label, before: c.before, after: c.after, display: c.display, loosens: c.loosens })),
  });
  const loosened = changes.filter((c) => c.loosens);
  await alert(
    circle.id,
    loosened.length ? "action" : "info",
    `${member.name} changed the rules`,
    changes.map((c) => `${c.label}: ${c.display}`).join(" · ") + (loosened.length ? ". This lets Tend pay more without asking." : "."),
  );
  // A looser rule might let a held payment through.
  await releaseHolds(circle.id);
  return { version, changes };
}

export async function mandateHistory(circleId: string) {
  const db = await getDb();
  const rows = await db
    .select({ m: mandates, name: members.name })
    .from(mandates)
    .leftJoin(members, eq(members.id, mandates.createdBy))
    .where(eq(mandates.circleId, circleId))
    .orderBy(desc(mandates.version));
  const circle = await getCircle();
  return rows.map((r, i) => {
    const prev = rows[i + 1]?.m.rules;
    const changes: RuleChange[] = prev ? diffMandates(prev, r.m.rules, circle.currency) : [];
    return { version: r.m.version, by: r.name ?? "Tend", at: r.m.createdAt, changes, rules: r.m.rules };
  });
}

export async function revertTo(memberId: string, version: number) {
  const history = await mandateHistory((await getCircle()).id);
  const target = history.find((h) => h.version === version);
  if (!target) throw new RulesError("That version doesn't exist.");
  return saveMandate(memberId, target.rules);
}

/**
 * "Let pharmacy auto-pay up to $80" → a proposed diff. The model only
 * proposes; nothing changes until a family member presses Save.
 */
export async function proposeRuleChange(text: string) {
  const circle = await getCircle();
  const current = await activeMandate(circle.id);
  let proposal;
  let viaAi = false;
  if (aiConfigured()) {
    const { object } = await generateObject({
      model: model(),
      schema: RuleProposalSchema,
      system: `You translate a family member's request into changes to their care pot's spending rules.
Only change rules they clearly asked about. Money values are in dollars (80 means $80).
"Auto-pay limit" means Tend pays without asking at or below it; 0 means always ask.
Refuse (understood: false) anything that isn't about these rules, and never unblock gift cards.`,
      prompt: `Current rules (path | meaning | unit | current value):\n${describeRulesForModel(current)}\n\nRequest: """${text.slice(0, 500)}"""`,
    });
    proposal = object;
    viaAi = true;
  } else {
    proposal = parseRuleRequestOffline(text);
  }
  const applied = applyProposal(current, proposal, circle.currency);
  return {
    understood: proposal.understood && applied.changes.length > 0,
    reply: proposal.reply,
    changes: applied.changes,
    next: applied.mandate,
    rejected: applied.rejected,
    problems: applied.problems,
    viaAi,
  };
}
