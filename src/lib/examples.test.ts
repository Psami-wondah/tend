import { afterEach, describe, expect, it } from "vitest";
import { examplesOn } from "./examples";

/** Made-up people belong on pretend money only. */

const saved = { env: process.env.PAYPAL_ENV, examples: process.env.TEND_EXAMPLES };
afterEach(() => {
  for (const [k, v] of [["PAYPAL_ENV", saved.env], ["TEND_EXAMPLES", saved.examples]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("the example circles switch", () => {
  it("is on for sandbox unless turned off", () => {
    delete process.env.PAYPAL_ENV;
    delete process.env.TEND_EXAMPLES;
    expect(examplesOn()).toBe(true);
    process.env.TEND_EXAMPLES = "0";
    expect(examplesOn()).toBe(false);
    process.env.TEND_EXAMPLES = "off";
    expect(examplesOn()).toBe(false);
  });

  it("is always off on live PayPal, even when asked for", () => {
    process.env.PAYPAL_ENV = "live";
    delete process.env.TEND_EXAMPLES;
    expect(examplesOn()).toBe(false);
    process.env.TEND_EXAMPLES = "1";
    expect(examplesOn()).toBe(false);
  });
});
