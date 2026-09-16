import type { FastMCP } from "fastmcp";
import { EventEmitter } from "events";

export interface ToolMetadata {
  name: string;
  description: string;
  category: "filesystem" | "search" | "system" | "git" | "general";
  readOnly: boolean;
  callCount: number;
}

export interface ToolLogEntry {
  id: string;
  timestamp: string;
  tool: string;
  status: "running" | "success" | "blocked" | "error";
  args?: Record<string, unknown>;
  resultSummary?: string;
  error?: string;
  durationMs?: number;
}

// Initial state: all tools enabled by default
export const toolStates: Record<string, boolean> = {
  list_directory: true,
  read_file: true,
  write_file: true,
  replace_in_file: true,
  create_file: true,
  delete_file: true,
  rename_file: true,
  execute_command: true,
  grep_search: true,
  search_files_by_name: true,
  get_file_info: true,
  insert_at_line: true,
  git_diff: true,
};

// Tool metadata catalogue
export const toolMetadata: Record<string, ToolMetadata> = {
  list_directory: {
    name: "list_directory",
    description: "List all files and folders in a directory within the workspace.",
    category: "filesystem",
    readOnly: true,
    callCount: 0,
  },
  read_file: {
    name: "read_file",
    description: "Read the contents of a file with optional line slicing.",
    category: "filesystem",
    readOnly: true,
    callCount: 0,
  },
  write_file: {
    name: "write_file",
    description: "Create a new file or completely overwrite an existing one.",
    category: "filesystem",
    readOnly: false,
    callCount: 0,
  },
  replace_in_file: {
    name: "replace_in_file",
    description: "Replace a specific snippet of text in a file.",
    category: "filesystem",
    readOnly: false,
    callCount: 0,
  },
  create_file: {
    name: "create_file",
    description: "Create a new file safely without overwriting existing files.",
    category: "filesystem",
    readOnly: false,
    callCount: 0,
  },
  delete_file: {
    name: "delete_file",
    description: "Delete a specific file from the workspace.",
    category: "filesystem",
    readOnly: false,
    callCount: 0,
  },
  rename_file: {
    name: "rename_file",
    description: "Rename a file or move it to a different directory.",
    category: "filesystem",
    readOnly: false,
    callCount: 0,
  },
  execute_command: {
    name: "execute_command",
    description: "Execute a shell command in the terminal workspace.",
    category: "system",
    readOnly: false,
    callCount: 0,
  },
  grep_search: {
    name: "grep_search",
    description: "Search for regex or text pattern in files across workspace.",
    category: "search",
    readOnly: true,
    callCount: 0,
  },
  search_files_by_name: {
    name: "search_files_by_name",
    description: "Quickly find file paths by filename or extension.",
    category: "search",
    readOnly: true,
    callCount: 0,
  },
  get_file_info: {
    name: "get_file_info",
    description: "Get metadata about a file (size, line count, modified date).",
    category: "filesystem",
    readOnly: true,
    callCount: 0,
  },
  insert_at_line: {
    name: "insert_at_line",
    description: "Insert new text exactly at a specific line number.",
    category: "filesystem",
    readOnly: false,
    callCount: 0,
  },
  git_diff: {
    name: "git_diff",
    description: "View uncommitted git changes in the repository.",
    category: "git",
    readOnly: true,
    callCount: 0,
  },
};

// In-memory log buffer (maximum 100 entries)
const MAX_LOGS = 100;
export const toolLogs: ToolLogEntry[] = [];

// Event emitter for live SSE streaming
export const controlCenterEvents = new EventEmitter();
controlCenterEvents.setMaxListeners(50);

// Global statistics
export const toolStats = {
  totalCalls: 0,
  successfulCalls: 0,
  blockedCalls: 0,
  failedCalls: 0,
  activeCalls: 0,
  startTime: new Date().toISOString(),
};

function addLogEntry(entry: ToolLogEntry) {
  toolLogs.unshift(entry);
  if (toolLogs.length > MAX_LOGS) {
    toolLogs.pop();
  }
  controlCenterEvents.emit("log", entry);
}

function summarizeResult(result: unknown): string {
  if (typeof result === "string") {
    return result.length > 200 ? result.slice(0, 200) + "..." : result;
  }
  if (result === undefined || result === null) {
    return "";
  }
  try {
    const json = JSON.stringify(result);
    return json.length > 200 ? json.slice(0, 200) + "..." : json;
  } catch {
    return String(result);
  }
}

/**
 * Intercepts FastMCP addTool to enforce tool state (enabled/disabled)
 * and provide real-time logging and statistics.
 */
export function setupToolControl(server: FastMCP): void {
  const originalAddTool = server.addTool.bind(server);

  server.addTool = function (toolDef: any) {
    const toolName = toolDef.name;

    // Ensure tool has an initial state
    if (toolStates[toolName] === undefined) {
      toolStates[toolName] = true;
    }

    // Ensure metadata entry exists
    if (!toolMetadata[toolName]) {
      toolMetadata[toolName] = {
        name: toolName,
        description: toolDef.description || "",
        category: "general",
        readOnly: false,
        callCount: 0,
      };
    }

    const originalExecute = toolDef.execute;

    toolDef.execute = async function (args: any, context: any) {
      const logId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const startTime = Date.now();

      // Check if tool is currently enabled
      if (toolStates[toolName] === false) {
        toolStats.totalCalls++;
        toolStats.blockedCalls++;

        const blockedEntry: ToolLogEntry = {
          id: logId,
          timestamp: new Date().toLocaleTimeString(),
          tool: toolName,
          status: "blocked",
          args,
          error: "Disabled by user policy in Control Center",
        };
        addLogEntry(blockedEntry);

        // Required AI response: prompt user for permission
        return `Error: The tool '${toolName}' has been disabled by the user in the Control Center. Please ask the user for permission to enable this tool before proceeding.`;
      }

      // Tool is enabled: execute with live tracking
      toolStats.totalCalls++;
      toolStats.activeCalls++;
      if (toolMetadata[toolName]) {
        toolMetadata[toolName]!.callCount++;
      }

      const runningEntry: ToolLogEntry = {
        id: logId,
        timestamp: new Date().toLocaleTimeString(),
        tool: toolName,
        status: "running",
        args,
      };
      addLogEntry(runningEntry);

      try {
        const result = await originalExecute(args, context);
        const durationMs = Date.now() - startTime;
        toolStats.activeCalls = Math.max(0, toolStats.activeCalls - 1);
        toolStats.successfulCalls++;

        const successEntry: ToolLogEntry = {
          id: logId,
          timestamp: new Date().toLocaleTimeString(),
          tool: toolName,
          status: "success",
          args,
          resultSummary: summarizeResult(result),
          durationMs,
        };
        addLogEntry(successEntry);

        return result;
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        toolStats.activeCalls = Math.max(0, toolStats.activeCalls - 1);
        toolStats.failedCalls++;

        const errorEntry: ToolLogEntry = {
          id: logId,
          timestamp: new Date().toLocaleTimeString(),
          tool: toolName,
          status: "error",
          args,
          error: err?.message || String(err),
          durationMs,
        };
        addLogEntry(errorEntry);

        throw err;
      }
    };

    return originalAddTool(toolDef);
  };
}

/**
 * Helper to toggle an individual tool
 */
export function setToolState(toolName: string, enabled: boolean): boolean {
  if (toolStates[toolName] === undefined) {
    return false;
  }
  toolStates[toolName] = enabled;
  controlCenterEvents.emit("stateChange", { tool: toolName, enabled });
  return true;
}

/**
 * Helper to batch set tool states or apply presets
 */
export function setAllToolStates(enabled: boolean): void {
  for (const tool of Object.keys(toolStates)) {
    toolStates[tool] = enabled;
  }
  controlCenterEvents.emit("stateChange", { all: true, enabled });
}

/**
 * Safe Mode preset: Keep read-only / inspect tools, disable write & execution tools
 */
export function applySafeMode(): void {
  for (const [name, meta] of Object.entries(toolMetadata)) {
    toolStates[name] = meta.readOnly;
  }
  controlCenterEvents.emit("stateChange", { preset: "safeMode", toolStates });
}
