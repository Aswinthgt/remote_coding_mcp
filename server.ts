#!/usr/bin/env node
import { FastMCP } from "fastmcp";
import { PORT, ENABLE_AUTH, ENABLE_OAUTH, OAUTH_BASE_URL, OAUTH_REDIRECT_URI, WORKSPACE_DIR } from "./config.js";
import {
  initializeAuth,
  verifyAuthToken,
  getAuthToken,
  extractToken,
} from "./auth.js";
import { setupToolControl } from "./toolControl.js";
import { registerControlCenter } from "./controlCenter.js";
import { registerOAuth, isOAuthRoute, verifyOAuthAccessToken } from "./oauth.js";
import { initializeStartupClient } from "./service/oauth.js";
import { registerAllTools } from "./tools/index.js";

// ==========================================
// INITIALIZE AUTHENTICATION IF ENABLED
// ==========================================
if (ENABLE_AUTH) {
  await initializeAuth();
}

// Generate one server-owned OAuth client when OAuth is enabled. This client
// is registered in the same in-memory registry used by /oauth/register.
const startupOAuthClient = ENABLE_OAUTH && OAUTH_BASE_URL
  ? initializeStartupClient(OAUTH_REDIRECT_URI!)
  : null;

// Build FastMCP options — only attach `authenticate` when auth is enabled.
// Without this, some MCP clients detect the handler and attempt OAuth discovery even in open mode.
const mcpAuthHandler = ENABLE_AUTH
  ? async (request: any) => {
      const authHeader =
        request.headers?.["authorization"] ||
        (typeof request.headers?.get === "function" ? request.headers.get("authorization") : undefined);
      const url = new URL(request.url || "", "http://localhost");
      const queryToken = url.searchParams.get("token");

      const token = extractToken(authHeader, queryToken);
      const validJwt = token ? await verifyAuthToken(token) : false;
      const validOAuth = token ? verifyOAuthAccessToken(token) : false;

      if (!token || (!validJwt && !validOAuth)) {
        const headers: Record<string, string> = {};
        if (ENABLE_OAUTH && OAUTH_BASE_URL) {
          headers["WWW-Authenticate"] =
            `Bearer resource_metadata="${OAUTH_BASE_URL}/.well-known/oauth-protected-resource"`;
        }

        throw new Response("Unauthorized: Invalid or missing authentication token.", {
          status: 401,
          statusText: "Unauthorized",
          headers,
        });
      }

      return { token };
    }
  : undefined;

const server = new FastMCP({
  name: "Remote-Coder-Filesystem",
  version: "1.0.0",
  ...(mcpAuthHandler ? { authenticate: mcpAuthHandler } : {}),
});

// ==========================================
// TOOL CONTROL INTERCEPTION
// ==========================================
setupToolControl(server);

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
const app = server.getApp();

app.use("*", async (c, next) => {
  // If authentication is disabled, bypass
  if (!ENABLE_AUTH) {
    await next();
    return;
  }

  // Allow the Control Center HTML view to load so it can present the unlock modal
  if (c.req.path === "/control-center" || c.req.path === "/control-center/") {
    await next();
    return;
  }

  // Allow OAuth 2.0 discovery, token, and authorize endpoints to bypass Bearer check
  if (isOAuthRoute(c.req.path)) {
    await next();
    return;
  }

  const token = extractToken(c.req.header("Authorization"), c.req.query("token"));
  const isControlCenterApi = c.req.path.startsWith("/control-center/api/");

  if (!token) {
    const error = "Unauthorized: Missing authentication token.";

    if (isControlCenterApi) {
      return c.json({ error }, 401);
    }

    if (ENABLE_OAUTH && OAUTH_BASE_URL) {
      c.header(
        "WWW-Authenticate",
        `Bearer resource_metadata="${OAUTH_BASE_URL}/.well-known/oauth-protected-resource"`
      );
    }

    return c.text(error, 401);
  }

  const validJwt = await verifyAuthToken(token);
  const validOAuth = !validJwt && ENABLE_OAUTH
    ? verifyOAuthAccessToken(token)
    : false;

  if (!validJwt && !validOAuth) {
    const error = "Unauthorized: Invalid or expired authentication token.";

    if (isControlCenterApi) {
      return c.json({ error }, 401);
    }

    if (ENABLE_OAUTH && OAUTH_BASE_URL) {
      c.header(
        "WWW-Authenticate",
        `Bearer resource_metadata="${OAUTH_BASE_URL}/.well-known/oauth-protected-resource"`
      );
    }

    return c.text(error, 401);
  }

  await next();
});

// ==========================================
// CONTROL CENTER, OAUTH & TOOLS REGISTRATION
// ==========================================
registerControlCenter(app);
registerOAuth(app);
registerAllTools(server);

// ==========================================
// START SERVER
// ==========================================
server.start({
  transportType: "httpStream",
  httpStream: {
    port: PORT,
  },
});

console.log(`🚀 Remote Coder MCP Server running on port ${PORT}`);
console.log(`🔒 Workspace locked to: ${WORKSPACE_DIR}`);

const token = getAuthToken();

if (ENABLE_OAUTH && token) {
  console.log(`\n================================================================================`);
  console.log(`🔐 OAUTH 2.1 & AUTHENTICATION ENABLED`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`🌐 OAuth Base URL:`);
  console.log(OAUTH_BASE_URL);
  console.log(``);
  console.log(`🔑 Pre-registered OAuth Client ID:`);
  console.log(startupOAuthClient?.clientId ?? "");
  console.log(``);
  console.log(`🔐 Pre-registered OAuth Client Secret:`);
  console.log(startupOAuthClient?.clientSecret ?? "");
  console.log(``);
  console.log(`↩️  Registered Redirect URI:`);
  console.log(OAUTH_REDIRECT_URI);
  console.log(``);
  console.log(`🌐 OAuth Authorization Endpoint:`);
  console.log(`${OAUTH_BASE_URL}/oauth/authorize`);
  console.log(``);
  console.log(`🌐 OAuth Token Endpoint:`);
  console.log(`${OAUTH_BASE_URL}/oauth/token`);
  console.log(``);
  console.log(`🔑 Direct JWT Access Token:`);
  console.log(token);
  console.log(``);
  console.log(`🎛️  Control Center (One-Click Access):`);
  console.log(`http://localhost:${PORT}/control-center?token=${token}`);
  console.log(``);
  console.log(`🔌 MCP Server URL:`);
  console.log(`http://localhost:${PORT}/mcp`);
  console.log(``);
  console.log(`🤖 OAuth clients register through:`);
  console.log(`${OAUTH_BASE_URL}/oauth/register`);
  console.log(``);
  console.log(`• Token URL: ${OAUTH_BASE_URL}/oauth/token`);
  console.log(`================================================================================\n`);
} else if (ENABLE_AUTH && token) {
  console.log(`\n================================================================================`);
  console.log(`🔐 AUTHENTICATION ENABLED`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`🔑 JWT Access Token:`);
  console.log(token);
  console.log(``);
  console.log(`🎛️  Control Center (One-Click Access):`);
  console.log(`http://localhost:${PORT}/control-center?token=${token}`);
  console.log(``);
  console.log(`🔌 MCP Server URL:`);
  console.log(`http://localhost:${PORT}/mcp`);
  console.log(``);
  console.log(`🤖 For MCP Clients (Claude, Cursor, AI Studio), provide:`);
  console.log(`URL:    http://localhost:${PORT}/mcp`);
  console.log(`Header: Authorization: Bearer ${token}`);
  console.log(`================================================================================\n`);
} else {
  console.log(`🔌 MCP Server URL: http://localhost:${PORT}/mcp`);
  console.log(`🎛️  Control Center available at: http://localhost:${PORT}/control-center`);
  console.log(`🔓 Authentication: DISABLED (Pass --enable-auth for JWT, or --enable-oauth for OAuth 2.1)`);
}