import type { FastMCP } from "fastmcp";
import { registerListDirectoryTool } from "./list_directory.js";
import { registerReadFileTool } from "./read_file.js";
import { registerWriteFileTool } from "./write_file.js";
import { registerReplaceInFileTool } from "./replace_in_file.js";
import { registerCreateFileTool } from "./create_file.js";
import { registerDeleteFileTool } from "./delete_file.js";
import { registerRenameFileTool } from "./rename_file.js";
import { registerExecuteCommandTool } from "./execute_command.js";
import { registerGrepSearchTool } from "./grep_search.js";
import { registerSearchFilesByNameTool } from "./search_files_by_name.js";
import { registerGetFileInfoTool } from "./get_file_info.js";
import { registerInsertAtLineTool } from "./insert_at_line.js";
import { registerGitDiffTool } from "./git_diff.js";

export function registerAllTools(server: FastMCP) {
  registerListDirectoryTool(server);
  registerReadFileTool(server);
  registerWriteFileTool(server);
  registerReplaceInFileTool(server);
  registerCreateFileTool(server);
  registerDeleteFileTool(server);
  registerRenameFileTool(server);
  registerExecuteCommandTool(server);
  registerGrepSearchTool(server);
  registerSearchFilesByNameTool(server);
  registerGetFileInfoTool(server);
  registerInsertAtLineTool(server);
  registerGitDiffTool(server);
}

export {
  registerListDirectoryTool,
  registerReadFileTool,
  registerWriteFileTool,
  registerReplaceInFileTool,
  registerCreateFileTool,
  registerDeleteFileTool,
  registerRenameFileTool,
  registerExecuteCommandTool,
  registerGrepSearchTool,
  registerSearchFilesByNameTool,
  registerGetFileInfoTool,
  registerInsertAtLineTool,
  registerGitDiffTool,
};
