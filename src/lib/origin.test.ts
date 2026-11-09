import { afterEach, describe, expect, it } from "vitest";
import { configuredOrigin, originOf } from "./origin";

/** Links and redirects use Tend's public address, never the server's localhost. */

const saved = { app: process.env.APP_URL, render: process.env.RENDER_EXTERNAL_URL };
afterEach(() => {
  process.env.APP_URL = saved.app;
  process.env.RENDER_EXTERNAL_URL = saved.render;
  if (saved.app === undefined) delete process.env.APP_URL;
  if (saved.render === undefined) delete process.env.RENDER_EXTERNAL_URL;
});

const req = (headers: Record<string, string>) => new Request("http://localhost:10000/join/walter", { headers });

describe("public origin", () => {
  it("uses Render's address when APP_URL is missing or left over from a laptop", () => {
    delete process.env.APP_URL;
    process.env.RENDER_EXTERNAL_URL = "https://tend.onrender.com";
    expect(configuredOrigin()).toBe("https://tend.onrender.com");
    process.env.APP_URL = "http://localhost:3001";
    expect(configuredOrigin()).toBe("https://tend.onrender.com");
  });

  it("keeps an APP_URL that was set on purpose", () => {
    process.env.APP_URL = "https://tend.example.org/";
    process.env.RENDER_EXTERNAL_URL = "https://tend.onrender.com";
    expect(configuredOrigin()).toBe("https://tend.example.org");
  });

  it("falls back to the forwarded host behind a proxy, not the server's own URL", () => {
    delete process.env.APP_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    expect(originOf(req({ host: "abc.trycloudflare.com", "x-forwarded-proto": "https" }))).toBe("https://abc.trycloudflare.com");
    expect(originOf(req({ host: "localhost:3001" }))).toBe("http://localhost:3001");
  });
});
