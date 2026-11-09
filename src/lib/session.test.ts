import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Sign-in: a session or invite only counts if Tend signed it, and a request
 * can only act as the person signed in on that device.
 */

const jar: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined) }),
}));

process.env.TEND_SESSION_SECRET = "test-secret-for-sessions";
const { inviteToken, readInvite, readSession, sessionFor, SESSION_COOKIE } = await import("./session");
const { body } = await import("./http");

const post = (data: unknown) => new Request("http://localhost/api/x", { method: "POST", body: JSON.stringify(data) });
const Input = z.object({ memberId: z.string(), note: z.string().optional() });

describe("sessions and invite links", () => {
  it("reads back what it signed", async () => {
    expect(await readSession(await sessionFor("demo-priya"))).toBe("demo-priya");
    expect(await readInvite(await inviteToken("demo-walter"))).toBe("demo-walter");
  });

  it("refuses a bare id, an edited id, a broken signature, and an invite used as a session", async () => {
    const s = await sessionFor("demo-priya");
    expect(await readSession("demo-priya")).toBeNull();
    expect(await readSession(s.replace("demo-priya", "demo-dolores"))).toBeNull();
    expect(await readSession(`${s.slice(0, -1)}${s.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(await readSession(await inviteToken("demo-priya"))).toBeNull();
    expect(await readInvite(s)).toBeNull();
    expect(await readSession(undefined)).toBeNull();
  });
});

describe("acting as someone", () => {
  beforeAll(async () => {
    jar[SESSION_COOKIE] = await sessionFor("demo-priya");
  });

  it("lets the signed-in person act", async () => {
    const [data, err] = await body(post({ memberId: "demo-priya" }), Input);
    expect(err).toBeNull();
    expect(data?.memberId).toBe("demo-priya");
  });

  it("stops a request that names someone else", async () => {
    const [, err] = await body(post({ memberId: "demo-dolores" }), Input);
    expect(err?.status).toBe(403);
  });

  it("asks for sign-in when nobody is signed in", async () => {
    delete jar[SESSION_COOKIE];
    const [, err] = await body(post({ memberId: "demo-priya" }), Input);
    expect(err?.status).toBe(401);
    // Signing in is the one request that names someone before there's a session.
    const [ok] = await body(post({ memberId: "demo-priya" }), Input, { signIn: true });
    expect(ok?.memberId).toBe("demo-priya");
  });
});
