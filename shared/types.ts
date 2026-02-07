// Shared types between server and mobile client

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
  // Optional: enable thinking tokens (for extended thinking)
  maxThinkingTokens?: number;
}

export interface ApprovalMessage {
  type: 'approval';
  requestId: string;
  decision: 'allow' | 'deny';
  reason?: string;
  answers?: Record<string, string>;  // For AskUserQuestion - map question index to selected option label
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

export interface DeleteSessionRequest {
  type: 'delete_session';
  sessionId: string;
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
  | DeleteSessionRequest;

// ============================================
// Server → Mobile Messages
// ============================================

export interface StreamMessage {
  type: 'stream';
  text: string;
  sessionId: string;
}

export interface ToolStartMessage {
  type: 'tool_start';
  sessionId: string;
  tool: string;
  input: unknown;
  toolUseId: string;
}

export interface ToolInputMessage {
  type: 'tool_input';
  sessionId: string;
  tool: string;
  toolUseId: string;
  input: unknown;
}

export interface ToolCompleteMessage {
  type: 'tool_complete';
  sessionId: string;
  tool: string;
  toolUseId: string;
  result: unknown;
  success: boolean;
}

export interface ApprovalRequestMessage {
  type: 'approval_request';
  requestId: string;
  sessionId: string;
  tool: string;
  input: unknown;
  description?: string;
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
}

export interface ThinkingMessage {
  type: 'thinking';
  sessionId: string;
  text: string;
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
}

export interface SessionDeletedMessage {
  type: 'session_deleted';
  sessionId: string;
}

export interface SessionSavedMessage {
  type: 'session_saved';
  sessionId: string;
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
  | SessionDeletedMessage
  | SessionSavedMessage
  | FileReadResultMessage
  | FileWriteResultMessage
  | AskUserQuestionMessage
  | ContentBlockMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage
  | TaskListMessage;

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
