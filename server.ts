#!/usr/bin/env node
import { FastMCP } from "fastmcp";
import { PORT, AUTH_TOKEN, WORKSPACE_DIR } from "./config.js";
import { setupToolControl } from "./toolControl.js";
import { registerControlCenter } from "./controlCenter.js";
import { registerAllTools } from "./tools/index.js";

// ==========================================
// SERVER INITIALIZATION
// ==========================================
const server = new FastMCP({
  name: "Remote-Coder-Filesystem",
  version: "1.0.0",
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
  // If no token was provided at startup, authentication is disabled
  if (!AUTH_TOKEN) {
    await next();
    return;
  }

  // Allow the Control Center HTML view to load so it can present the unlock modal
  if (c.req.path === "/control-center" || c.req.path === "/control-center/") {
    await next();
    return;
  }

  // For Control Center APIs, support both Authorization header and ?token query param
  if (c.req.path.startsWith("/control-center/api/")) {
    const authHeader = c.req.header("Authorization");
    const queryToken = c.req.query("token");
    if (authHeader === `Bearer ${AUTH_TOKEN}` || queryToken === AUTH_TOKEN) {
      await next();
      return;
    }
    return c.json({ error: "Unauthorized: Invalid or missing API key." }, 401);
  }

  // Default authentication for all other endpoints (e.g., /mcp)
  const authHeader = c.req.header("Authorization");
  if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
    return c.text("Unauthorized: Invalid or missing API key.", 401);
  }
  await next();
});

// ==========================================
// CONTROL CENTER & TOOLS REGISTRATION
// ==========================================
registerControlCenter(app);
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
console.log(`🎛️  Control Center available at: http://localhost:${PORT}/control-center`);