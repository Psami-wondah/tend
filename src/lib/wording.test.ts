import { describe, expect, it } from "vitest";
import { forCircle } from "./wording";

/** The circle reads what Tend wrote for the person, so "you" has to become them. */

describe("wording for the circle", () => {
  it("turns your into the person's name", () => {
    expect(forCircle("Your heart tablets from Saguaro Pharmacy.", "Walter")).toBe("Walter's heart tablets from Saguaro Pharmacy.");
    expect(forCircle("Someone saying they're your grandson and asking for gift cards.", "Mum")).toBe(
      "Someone saying they're Mum's grandson and asking for gift cards.",
    );
  });

  it("names them where they're the one being asked", () => {
    expect(forCircle("Someone is asking you for $650 in a way that looks like a scam.", "Walter")).toBe(
      "Someone is asking Walter for $650 in a way that looks like a scam.",
    );
    expect(forCircle("A roofer told you the job has to start today.", "Walter")).toBe("A roofer told Walter the job has to start today.");
  });

  it("leaves a you that starts a clause, and text with no you, alone", () => {
    expect(forCircle("The note says you owe $389 and to call a number.", "Walter")).toBe("The note says you owe $389 and to call a number.");
    expect(forCircle("PayPal never puts a support number in an invoice note.", "Walter")).toBe("PayPal never puts a support number in an invoice note.");
    expect(forCircle("If you did not authorize this, call the number.", "Walter")).toBe("If you did not authorize this, call the number.");
  });
});
