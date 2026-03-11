// Shared types between server and mobile client

import type { TicketClientMessage, TicketServerMessage } from './ticket-types.js';
export type { TicketClientMessage, TicketServerMessage };
export type { Ticket, TicketStatus, TicketType, TicketPriority, BlockedTicket, DepTreeNode } from './ticket-types.js';

// ============================================
// Common Types
// ============================================

export type PermissionMode = 'default' | 'plan' | 'acceptEdits';

// ============================================
// Bridge Instance Types
// ============================================

export interface BridgeInstance {
  instanceId: string;
  projectPath: string;
  projectName: string;
  port: number;
  pid: number;
  startedAt: string;
  lastHealthCheck: string;
  status: 'running' | 'stopped' | 'unhealthy';
  authToken: string;
  tunnelUrl?: string;
}

// ============================================
// Mobile → Server Messages
// ============================================

export interface PromptMessage {
  type: 'prompt';
  text: string;
  sessionId?: string;
  projectPath?: string;
  // Optional: override permission mode for this prompt
  permissionMode?: PermissionMode;
  // Optional: override model for this prompt
  model?: string;
  // Optional: enable thinking tokens (for extended thinking)
  maxThinkingTokens?: number;
}

export interface ApprovalMessage {
  type: 'approval';
  requestId: string;
  decision: 'allow' | 'deny';
  reason?: string;
  answers?: Record<string, string>;  // For AskUserQuestion - map question index to selected option label
  followUpPrompt?: boolean; // If true, 'reason' should be used as a follow-up prompt after the decision
}

export interface InterruptMessage {
  type: 'interrupt';
  sessionId: string;
}

export interface SessionListRequest {
  type: 'list_sessions';
}

export interface ConnectMessage {
  type: 'connect';
  authToken?: string;
}

export interface SetModeMessage {
  type: 'set_mode';
  sessionId: string;
  mode: 'default' | 'plan' | 'acceptEdits';
}

export interface ExitPlanModeMessage {
  type: 'exit_plan_mode';
  sessionId: string;
}

// Project management messages
export interface ProjectListRequest {
  type: 'list_projects';
}

export interface ProjectAddRequest {
  type: 'add_project';
  path: string;
  name?: string;
}

export interface ProjectRemoveRequest {
  type: 'remove_project';
  projectId: string;
}

export interface ProjectSelectRequest {
  type: 'select_project';
  projectId: string;
}

// Session persistence messages
export interface SavedSessionListRequest {
  type: 'list_saved_sessions';
  projectId?: string;
}

export interface LoadSessionRequest {
  type: 'load_session';
  sessionId: string;
}

export interface ResumeSessionRequest {
  type: 'resume_session';
  sessionId: string;
}

export interface CloseSessionRequest {
  type: 'close_session';
  sessionId: string;
}

export interface DeleteSessionRequest {
  type: 'delete_session';
  sessionId: string;
}

// Slash command messages
export interface ListSlashCommandsMessage {
  type: 'list_slash_commands';
  sessionId?: string;
}

export interface ExecuteSlashCommandMessage {
  type: 'execute_slash_command';
  sessionId: string;
  command: string;
  args?: string;
}

export interface SetModelMessage {
  type: 'set_model';
  sessionId: string;
  model: string;
}

export interface ListModelsMessage {
  type: 'list_models';
}

// Directory browsing messages
export interface BrowseDirectoryRequest {
  type: 'browse_directory';
  path?: string; // Optional, defaults to home directory
}

// Session folder management messages (restricted to AOUD_SESSION_ROOT)
export interface ListSessionFoldersRequest {
  type: 'list_session_folders';
  search?: string; // Optional search/filter string
}

export interface CreateSessionFolderRequest {
  type: 'create_session_folder';
  folderName: string;
}

// Memory management messages
export interface GetProjectMemoryRequest {
  type: 'get_project_memory';
  projectPath?: string; // Optional, defaults to active project
}

// Direct terminal command execution (bypasses Claude SDK)
export interface TerminalCommandMessage {
  type: 'terminal_command';
  command: string;
  sessionId: string;
  cwd?: string; // Optional working directory override
}

// Kill/cancel a running terminal command
export interface TerminalInterruptMessage {
  type: 'terminal_interrupt';
  commandId: string;
  sessionId: string;
}

// Spotlight file search request
export interface FileSearchRequest {
  type: 'file_search';
  query: string;
  projectPath?: string; // defaults to active project
  includeFiles?: boolean; // default true
  includeDirs?: boolean; // default true
}

// File preview request (read file content)
export interface FilePreviewRequest {
  type: 'file_preview';
  filePath: string;
}

// File save request (write edited content back)
export interface FileSaveRequest {
  type: 'file_save';
  filePath: string;
  content: string;
}

export type ClientMessage =
  | PromptMessage
  | ApprovalMessage
  | InterruptMessage
  | SessionListRequest
  | ConnectMessage
  | SetModeMessage
  | ExitPlanModeMessage
  | ProjectListRequest
  | ProjectAddRequest
  | ProjectRemoveRequest
  | ProjectSelectRequest
  | AnswerQuestionMessage
  | SavedSessionListRequest
  | LoadSessionRequest
  | ResumeSessionRequest
  | CloseSessionRequest
  | DeleteSessionRequest
  | ListSlashCommandsMessage
  | ExecuteSlashCommandMessage
  | SetModelMessage
  | ListModelsMessage
  | GetProjectMemoryRequest
  | BrowseDirectoryRequest
  | ListSessionFoldersRequest
  | CreateSessionFolderRequest
  | TerminalCommandMessage
  | TerminalInterruptMessage
  | FileSearchRequest
  | FilePreviewRequest
  | FileSaveRequest
  | TicketClientMessage;

// ============================================
// Server → Mobile Messages
// ============================================

export interface StreamMessage {
  type: 'stream';
  text: string;
  sessionId: string;
  agentId?: string; // If present, this message belongs to a Task agent
}

export interface ToolStartMessage {
  type: 'tool_start';
  sessionId: string;
  tool: string;
  input: unknown;
  toolUseId: string;
  agentId?: string; // If present, this tool belongs to a Task agent
}

export interface ToolInputMessage {
  type: 'tool_input';
  sessionId: string;
  tool: string;
  toolUseId: string;
  input: unknown;
  agentId?: string; // If present, this tool belongs to a Task agent
}

export interface ToolCompleteMessage {
  type: 'tool_complete';
  sessionId: string;
  tool: string;
  toolUseId: string;
  result: unknown;
  success: boolean;
  agentId?: string; // If present, this tool belongs to a Task agent
}

export interface ApprovalRequestMessage {
  type: 'approval_request';
  requestId: string;
  sessionId: string;
  tool: string;
  input: unknown;
  description?: string;
  diff?: {
    file: string;
    oldContent: string;
    newContent: string;
    additions: number;
    deletions: number;
  };
}

export interface DiffMessage {
  type: 'diff';
  sessionId: string;
  requestId: string;
  file: string;
  oldContent: string;
  newContent: string;
  additions: number;
  deletions: number;
}

export interface SessionMessage {
  type: 'session';
  sessionId: string;
  status: 'started' | 'active' | 'complete' | 'error';
  projectPath?: string;
  error?: string;
}

export interface SessionListMessage {
  type: 'session_list';
  sessions: SessionInfo[];
}

export interface ConnectionStatusMessage {
  type: 'connection_status';
  status: 'connected' | 'authenticated' | 'error';
  message?: string;
}

export interface ResultMessage {
  type: 'result';
  sessionId: string;
  result: string;
  totalCost?: number;
  duration?: number;
  toolUses?: number;
  tokens?: number;
  // Detailed token breakdown
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
}

export interface ThinkingMessage {
  type: 'thinking';
  sessionId: string;
  text: string;
  agentId?: string; // If present, this thinking belongs to a Task agent
}

export interface ModeChangedMessage {
  type: 'mode_changed';
  sessionId: string;
  mode: 'default' | 'plan' | 'acceptEdits';
}

// Project-related server messages
export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  lastAccessed: string;
  sessionCount?: number;
}

export interface ProjectListMessage {
  type: 'project_list';
  projects: ProjectInfo[];
  activeProjectId?: string;
}

export interface ProjectAddedMessage {
  type: 'project_added';
  project: ProjectInfo;
}

export interface ProjectRemovedMessage {
  type: 'project_removed';
  projectId: string;
}

export interface ProjectSelectedMessage {
  type: 'project_selected';
  projectId: string;
  project: ProjectInfo;
}

// Session persistence server messages
export interface SavedSessionMetadata {
  sessionId: string;
  projectId: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  lastModified: string;
  status: 'active' | 'completed' | 'interrupted' | 'error';
  stats: {
    totalPrompts: number;
    totalMessages: number;
    totalToolUses: number;
    totalTokens: number;
    totalCost: number;
    duration: number;
  };
  firstMessage?: string;
}

export interface SavedSessionListMessage {
  type: 'saved_session_list';
  sessions: SavedSessionMetadata[];
}

export interface SessionLoadedMessage {
  type: 'session_loaded';
  sessionId: string;
  session: any; // Full SavedSession data
}

export interface SessionResumedMessage {
  type: 'session_resumed';
  sessionId: string;
  newSessionId: string;
  projectPath: string;
  projectName: string;
}

export interface SessionClosedMessage {
  type: 'session_closed';
  sessionId: string;
}

export interface SessionResumeHistoryMessage {
  type: 'session_resume_history';
  sessionId: string;
  messages: Array<{role: string; content: any; timestamp: number; model?: string}>;
  toolCalls: Record<string, any>;
}

export interface SessionDeletedMessage {
  type: 'session_deleted';
  sessionId: string;
}

export interface SessionSavedMessage {
  type: 'session_saved';
  sessionId: string;
}

// Slash command server messages
export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;  // Use empty string if no hint
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;       // Context window size in tokens (e.g., 200000, 1000000)
  category?: string;            // Model category: 'standard' or '1m-context'
  alias?: string;               // Short alias for quick selection (e.g., 'sonnet', 'opus-1m')
}

export interface SlashCommandListMessage {
  type: 'slash_command_list';
  commands: SlashCommand[];
}

export interface SlashCommandResultMessage {
  type: 'slash_command_result';
  sessionId: string;
  command: string;
  success: boolean;
  output: string;
  category?: 'builtin' | 'sdk' | 'git' | 'config' | 'analysis';
}

export interface ModelListMessage {
  type: 'model_list';
  models: ModelInfo[];
  currentModel: string;
}

export interface ModelChangedMessage {
  type: 'model_changed';
  sessionId: string;
  model: string;
}

// Memory management server messages
export interface MemoryLocation {
  type: 'managed_policy' | 'project' | 'project_rules' | 'user' | 'project_local' | 'auto';
  path: string;
  content: string;
  exists: boolean;
  lastModified?: string;
  lineCount?: number;
}

export interface ProjectMemoryMessage {
  type: 'project_memory';
  projectPath: string;
  projectName: string;
  locations: MemoryLocation[];
  timestamp: string;
}

// Directory browsing server messages
export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
}

export interface BrowseDirectoryMessage {
  type: 'browse_directory';
  path: string;
  parentPath: string | null;
  entries: DirectoryEntry[];
}

// Session folder management server messages
export interface SessionFolderEntry {
  name: string;
  path: string;
  createdAt: string;
  modifiedAt: string;
}

export interface SessionFolderListMessage {
  type: 'session_folder_list';
  basePath: string;
  folders: SessionFolderEntry[];
}

export interface SessionFolderCreatedMessage {
  type: 'session_folder_created';
  success: boolean;
  folderPath?: string;
  folderName?: string;
  error?: string;
}

// Direct terminal execution server messages
export interface TerminalStartMessage {
  type: 'terminal_start';
  commandId: string;
  sessionId: string;
  command: string;
  cwd: string;
}

export interface TerminalOutputMessage {
  type: 'terminal_output';
  commandId: string;
  sessionId: string;
  data: string; // Raw output chunk (may contain ANSI codes)
  stream: 'stdout' | 'stderr';
}

export interface TerminalExitMessage {
  type: 'terminal_exit';
  commandId: string;
  sessionId: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
}

// ============================================
// Spotlight File Search & Preview Messages
// ============================================

export interface FileSearchEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  extension?: string;
  mtime?: number; // modification time (unix timestamp in ms)
}

export interface FileSearchResultMessage {
  type: 'file_search_result';
  query: string;
  entries: FileSearchEntry[];
  totalCount: number;
  truncated: boolean; // true if results were capped
}

export interface FilePreviewResultMessage {
  type: 'file_preview_result';
  filePath: string;
  fileName: string;
  content: string;
  encoding: 'utf8' | 'base64'; // base64 for images
  mimeType: string;
  size: number;
  language?: string; // detected language for syntax highlighting
}

export interface FilePreviewErrorMessage {
  type: 'file_preview_error';
  filePath: string;
  error: string;
}

export interface FileSaveResultMessage {
  type: 'file_save_result';
  filePath: string;
  success: boolean;
  error?: string;
}

export type ServerMessage =
  | StreamMessage
  | ToolStartMessage
  | ToolInputMessage
  | ToolCompleteMessage
  | ApprovalRequestMessage
  | DiffMessage
  | SessionMessage
  | SessionListMessage
  | ConnectionStatusMessage
  | ResultMessage
  | ThinkingMessage
  | ModeChangedMessage
  | ProjectListMessage
  | ProjectAddedMessage
  | ProjectRemovedMessage
  | ProjectSelectedMessage
  | TaskAgentStartMessage
  | TaskAgentProgressMessage
  | TaskAgentCompleteMessage
  | SavedSessionListMessage
  | SessionLoadedMessage
  | SessionResumedMessage
  | SessionClosedMessage
  | SessionResumeHistoryMessage
  | SessionDeletedMessage
  | SessionSavedMessage
  | FileReadResultMessage
  | FileWriteResultMessage
  | AskUserQuestionMessage
  | ContentBlockMessage
  | SlashCommandListMessage
  | SlashCommandResultMessage
  | ModelListMessage
  | ModelChangedMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage
  | TaskListMessage
  | ProjectMemoryMessage
  | BrowseDirectoryMessage
  | SessionFolderListMessage
  | SessionFolderCreatedMessage
  | TerminalStartMessage
  | TerminalOutputMessage
  | TerminalExitMessage
  | FileSearchResultMessage
  | FilePreviewResultMessage
  | FilePreviewErrorMessage
  | FileSaveResultMessage
  | TicketServerMessage;

// ============================================
// Session Info
// ============================================

export interface SessionInfo {
  id: string;
  projectPath: string;
  projectName: string;
  status: 'idle' | 'running' | 'waiting_approval' | 'waiting_question';
  lastActivity: string;
  pendingApprovals: number;
  pendingQuestions: number;
  messageCount: number;
  activeTaskAgents: number;
}

// ============================================
// Tool Input Types (for UI rendering)
// ============================================

export interface EditToolInput {
  file_path: string;
  old_string: string;
  new_string: string;
}

export interface WriteToolInput {
  file_path: string;
  content: string;
}

export interface BashToolInput {
  command: string;
  description?: string;
}

export interface ReadToolInput {
  file_path: string;
}

// ============================================
// Task Agent Messages (for Explore, Plan, etc.)
// ============================================

export interface TaskAgentStartMessage {
  type: 'task_agent_start';
  sessionId: string;
  agentId: string;
  agentType: string;  // 'Explore' | 'Plan' | 'Bash' | 'general-purpose' etc.
  description: string;  // "Explore dataset generation code"
}

export interface TaskAgentProgressMessage {
  type: 'task_agent_progress';
  sessionId: string;
  agentId: string;
  toolUses: number;
  tokens: number;
  status: 'running' | 'done';
}

export interface TaskAgentCompleteMessage {
  type: 'task_agent_complete';
  sessionId: string;
  agentId: string;
  agentType: string;
  description: string;
  toolUses: number;
  tokens: number;
  durationMs: number;
  success: boolean;
}

// ============================================
// File Operation Result Messages
// ============================================

export interface FileReadResultMessage {
  type: 'file_read_result';
  sessionId: string;
  toolUseId: string;
  filePath: string;
  fileName: string;
  linesRead: number;
}

export interface FileWriteResultMessage {
  type: 'file_write_result';
  sessionId: string;
  toolUseId: string;
  filePath: string;
  fileName: string;
  linesWritten: number;
  contentPreview?: string;  // First ~10 lines for preview
  totalLines: number;       // For "+N lines (expand)" indicator
  isUpdate: boolean;        // true if updating existing file
  label?: string;           // "Updated plan" or custom label
}

// ============================================
// User Question/Interview UI Messages
// ============================================

export interface QuestionOption {
  label: string;
  description: string;
  isRecommended?: boolean;
}

export interface Question {
  id: string;
  header: string;           // Short label for tab: "Priority"
  question: string;         // Full question text
  multiSelect: boolean;
  options: QuestionOption[];
}

export interface QuestionAction {
  id: string;
  label: string;  // "Chat about this" | "Skip interview and plan immediately"
}

export interface AskUserQuestionMessage {
  type: 'ask_user_question';
  sessionId: string;
  requestId: string;
  planFile?: string;        // Planning file path if in plan mode
  questions: Question[];
  actions?: QuestionAction[];
  currentQuestionIndex?: number;
}

// Client response to questions
export interface AnswerQuestionMessage {
  type: 'answer_question';
  requestId: string;
  sessionId: string;
  answers: Record<string, string | string[]>;  // questionId -> selected option(s)
  action?: string;  // "chat" | "skip" | custom action id
  customInput?: string;  // If user typed custom answer
}

// ============================================
// Content Block Messages (for expandable content)
// ============================================

export interface ContentBlockMessage {
  type: 'content_block';
  sessionId: string;
  blockId: string;
  blockType: 'markdown' | 'code' | 'file_content';
  title?: string;
  content: string;
  previewLines: number;     // Lines shown in preview
  totalLines: number;       // Total lines (for expand indicator)
  language?: string;        // For code blocks
  filePath?: string;        // For file content
}

// ============================================
// Task Management Messages
// ============================================

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;      // Present continuous form (e.g., "Running tests")
  timestamp: string;
}

export interface TaskCreatedMessage {
  type: 'task_created';
  sessionId: string;
  task: Task;
}

export interface TaskUpdatedMessage {
  type: 'task_updated';
  sessionId: string;
  taskId: string;
  status?: 'pending' | 'in_progress' | 'completed';
  subject?: string;
  description?: string;
  activeForm?: string;
}

export interface TaskListMessage {
  type: 'task_list';
  sessionId: string;
  tasks: Task[];
}
