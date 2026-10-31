import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildTendMcp } from "@/lib/mcp/server";
import { paypalMode } from "@/lib/paypal/rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tend's MCP server over Streamable HTTP (stateless: a fresh server per request).
 *
 *   claude mcp add --transport http tend https://<your-tend>/api/mcp
 *
 * Open in demo and sandbox mode, where every dollar is pretend, so judges can
 * connect. Set TEND_MCP_TOKEN to require a bearer token; live PayPal requires one.
 */
async function handle(req: Request): Promise<Response> {
  const token = process.env.TEND_MCP_TOKEN;
  if (token ? req.headers.get("authorization") !== `Bearer ${token}` : paypalMode() === "live") {
    return Response.json(
      { error: token ? "Send TEND_MCP_TOKEN as a bearer token." : "Set TEND_MCP_TOKEN before opening the MCP server on live PayPal." },
      { status: 401 },
    );
  }
  const server = buildTendMcp();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
