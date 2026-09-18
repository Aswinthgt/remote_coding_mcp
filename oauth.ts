import type { Hono } from "hono";
import { ENABLE_OAUTH } from "./config.js";
import {
  getClientId,
  getClientSecret,
  verifyClientCredentials,
  getAuthToken,
} from "./auth.js";

/**
 * Checks if a given URL path is an OAuth 2.0 endpoint that should bypass Bearer auth.
 * Only returns true when OAuth is actually enabled, so open servers are never treated as OAuth servers.
 */
export function isOAuthRoute(path: string): boolean {
  if (!ENABLE_OAUTH) return false;
  return (
    path === "/oauth/token" ||
    path === "/oauth/token/" ||
    path === "/token" ||
    path === "/oauth/authorize" ||
    path === "/.well-known/oauth-authorization-server"
  );
}

/**
 * Handles OAuth 2.0 token requests (supporting JSON, form-urlencoded, and Basic Auth).
 */
const handleOAuthToken = async (c: any) => {
  if (!ENABLE_OAUTH) {
    return c.json(
      {
        error: "unsupported_grant_type",
        error_description: "OAuth 2.0 is not enabled on this server. Run with --enable-oauth.",
      },
      400
    );
  }

  let clientId: string | undefined;
  let clientSecret: string | undefined;

  // 1. Check HTTP Basic Auth (Authorization: Basic base64(id:secret))
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf-8");
      const colonIndex = decoded.indexOf(":");
      if (colonIndex !== -1) {
        clientId = decoded.slice(0, colonIndex);
        clientSecret = decoded.slice(colonIndex + 1);
      }
    } catch {
      // Fall back to body parsing
    }
  }

  // 2. Fallback to request body (application/x-www-form-urlencoded or application/json)
  if (!clientId || !clientSecret) {
    try {
      const contentType = c.req.header("Content-Type") || "";
      if (contentType.includes("application/json")) {
        const json = await c.req.json();
        clientId = json.client_id;
        clientSecret = json.client_secret;
      } else {
        const body = await c.req.parseBody();
        clientId = body.client_id as string;
        clientSecret = body.client_secret as string;
      }
    } catch {
      // Ignore parse failure
    }
  }

  if (!clientId || !clientSecret || !verifyClientCredentials(clientId, clientSecret)) {
    return c.json(
      {
        error: "invalid_client",
        error_description: "Invalid client ID or client secret.",
      },
      401
    );
  }

  const token = getAuthToken();
  return c.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: 3600,
  });
};

/**
 * Registers OAuth 2.0 routes on the Hono application.
 * When OAuth is disabled, discovery + authorize endpoints return 404 so MCP clients
 * don't attempt auto-registration on plain open servers.
 */
export function registerOAuth(app: Hono): void {
  // Token endpoints
  app.post("/oauth/token", handleOAuthToken);
  app.post("/token", handleOAuthToken);

  // Authorization endpoint (supports authorization code flow redirects)
  app.get("/oauth/authorize", (c) => {
    if (!ENABLE_OAUTH) {
      return c.json({ error: "not_found" }, 404);
    }

    const redirectUri = c.req.query("redirect_uri");
    const state = c.req.query("state") || "";
    const clientId = c.req.query("client_id");

    if (clientId && clientId !== getClientId()) {
      return c.text("Invalid client_id.", 400);
    }

    if (redirectUri) {
      const url = new URL(redirectUri);
      url.searchParams.set("code", "mcp_code_" + Date.now());
      if (state) {
        url.searchParams.set("state", state);
      }
      return c.redirect(url.toString());
    }

    return c.text("OAuth authorization approved.");
  });

  // RFC 8414 OAuth Authorization Server Metadata
  // Returns 404 when OAuth is disabled so MCP clients don't attempt auto-registration.
  app.get("/.well-known/oauth-authorization-server", (c) => {
    if (!ENABLE_OAUTH) {
      return c.json({ error: "not_found" }, 404);
    }

    const origin = new URL(c.req.url).origin;
    return c.json({
      issuer: origin,
      token_endpoint: `${origin}/oauth/token`,
      authorization_endpoint: `${origin}/oauth/authorize`,
      response_types_supported: ["code", "token"],
      grant_types_supported: ["client_credentials", "authorization_code"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    });
  });
}
