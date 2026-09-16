import type { Hono } from "hono";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PORT, WORKSPACE_DIR, AUTH_TOKEN } from "./config.js";
import {
  toolStates,
  toolMetadata,
  toolLogs,
  toolStats,
  controlCenterEvents,
  setToolState,
  setAllToolStates,
  applySafeMode,
} from "./toolControl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedPackageVersion: string | null = null;

/**
 * Reads the version field dynamically from package.json
 */
async function getPackageVersion(): Promise<string> {
  if (cachedPackageVersion) return cachedPackageVersion;
  const possiblePaths = [
    path.join(__dirname, "package.json"),
    path.join(__dirname, "..", "package.json"),
    path.join(process.cwd(), "package.json"),
  ];

  for (const candidate of possiblePaths) {
    try {
      const content = await fs.readFile(candidate, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.version) {
        cachedPackageVersion = pkg.version;
        return pkg.version;
      }
    } catch {
      // Continue checking other candidate paths
    }
  }

  return "0.0.1";
}

/**
 * Finds and loads the control-center.html file looking across common runtime locations.
 */
async function loadControlCenterHtml(): Promise<string> {
  const possiblePaths = [
    path.join(__dirname, "views", "control-center.html"),
    path.join(__dirname, "..", "views", "control-center.html"),
    path.join(process.cwd(), "views", "control-center.html"),
    path.join(process.cwd(), "dist", "views", "control-center.html"),
  ];

  for (const candidate of possiblePaths) {
    try {
      const content = await fs.readFile(candidate, "utf-8");
      return content;
    } catch {
      // Continue looking in other paths
    }
  }

  throw new Error("Unable to locate views/control-center.html in any expected path.");
}

/**
 * Registers all Control Center web routes and APIs on the Hono application.
 */
export function registerControlCenter(app: Hono): void {
  // 1. Serve Control Center Terminal Web Page with dynamic version
  app.get("/control-center", async (c) => {
    try {
      let html = await loadControlCenterHtml();
      const version = await getPackageVersion();
      html = html.replace(/__VERSION__/g, version);
      return c.html(html);
    } catch (err: any) {
      return c.text(`Control Center Error: ${err.message}`, 500);
    }
  });

  // 2. Fetch full status and state
  app.get("/control-center/api/status", async (c) => {
    const combinedTools: Record<string, any> = {};
    const version = await getPackageVersion();

    for (const [name, meta] of Object.entries(toolMetadata)) {
      combinedTools[name] = {
        ...meta,
        enabled: toolStates[name] ?? true,
      };
    }

    return c.json({
      tools: combinedTools,
      stats: toolStats,
      logs: toolLogs,
      config: {
        port: PORT,
        workspace: WORKSPACE_DIR,
        hasAuth: Boolean(AUTH_TOKEN),
        version,
      },
    });
  });

  // 3. Toggle individual tool state
  app.post("/control-center/api/toggle", async (c) => {
    try {
      const body = await c.req.json();
      const { tool, enabled } = body;

      if (!tool || typeof enabled !== "boolean") {
        return c.json({ error: "Missing or invalid 'tool' or 'enabled' parameters." }, 400);
      }

      const success = setToolState(tool, enabled);
      if (!success) {
        return c.json({ error: `Tool '${tool}' not found.` }, 404);
      }

      return c.json({ success: true, tool, enabled });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // 4. Batch toggle or apply presets
  app.post("/control-center/api/toggle-all", async (c) => {
    try {
      const body = await c.req.json();
      const { preset, enabled } = body;

      if (preset === "safe-mode") {
        applySafeMode();
      } else if (preset === "all-off" || enabled === false) {
        setAllToolStates(false);
      } else {
        setAllToolStates(true);
      }

      return c.json({ success: true, toolStates });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // 5. Server-Sent Events (SSE) Stream for real-time live logs and tool state
  app.get("/control-center/api/events", (c) => {
    let timer: NodeJS.Timeout | undefined;
    let listener: ((event: any) => void) | undefined;
    let stateListener: ((event: any) => void) | undefined;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        listener = (event: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // Connection closed
          }
        };

        stateListener = (event: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "stateChange", ...event })}\n\n`));
          } catch {
            // Connection closed
          }
        };

        controlCenterEvents.on("log", listener);
        controlCenterEvents.on("stateChange", stateListener);

        // Keep-alive heartbeat every 15 seconds
        timer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            if (timer) clearInterval(timer);
          }
        }, 15000);
      },
      cancel() {
        if (timer) clearInterval(timer);
        if (listener) controlCenterEvents.off("log", listener);
        if (stateListener) controlCenterEvents.off("stateChange", stateListener);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  });
}
