import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { ClaudeSession } from './claude-session.js';
import { projectRegistry } from './project-registry.js';
import type {
  ClientMessage,
  ServerMessage,
  SessionInfo,
  ActiveSession,
} from './types.js';
import type { PermissionMode } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = parseInt(process.env.PORT || '3001');
const SILENT_MODE = process.env.BRIDGE_SILENT === 'true';

// Auto-generate auth token if not provided (required by default)
let AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN;
if (!AUTH_TOKEN) {
  AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
  if (!SILENT_MODE) {
    console.log('\n🔐 Authentication token was not found. Generated new secure token:');
    console.log(`   ${AUTH_TOKEN}`);
    console.log('\n💡 To persist this token, add it to your .env file:');
    console.log(`   BRIDGE_AUTH_TOKEN=${AUTH_TOKEN}\n`);
  }
}

// Active sessions map
const sessions = new Map<string, ClaudeSession>();

// Connected clients
const clients = new Set<WebSocket>();

// Express app for health checks
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    sessions: sessions.size,
    clients: clients.size,
  });
});

// Get local IP for mobile connection
app.get('/connection-info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  res.json({
    wsUrl: `ws://${addresses[0] || 'localhost'}:${PORT}`,
    addresses,
    port: PORT,
  });
});

// ============================================
// Project Management REST API
// ============================================

// List all projects
app.get('/projects', (_req, res) => {
  res.json({
    projects: projectRegistry.list(),
    activeProjectId: projectRegistry.getActiveProjectId(),
  });
});

// Add a new project
app.post('/projects', (req, res) => {
  const { path: projectPath, name } = req.body;
  if (!projectPath) {
    return res.status(400).json({ error: 'path is required' });
  }
  const project = projectRegistry.add(projectPath, name);
  res.json({ project });
});

// Remove a project
app.delete('/projects/:id', (req, res) => {
  const success = projectRegistry.remove(req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

// Set active project
app.post('/projects/:id/activate', (req, res) => {
  const project = projectRegistry.setActive(req.params.id);
  if (project) {
    res.json({ project });
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

// ============================================
// Serve Mobile PWA (if built)
// ============================================

// Look for mobile dist in multiple locations
const possibleMobilePaths = [
  path.resolve(__dirname, '../../../mobile/dist'),      // Development: server/src -> mobile/dist
  path.resolve(__dirname, '../../mobile/dist'),         // Built: server/dist/server/src -> mobile/dist
  path.resolve(__dirname, '../../../../mobile/dist'),   // Alternative structure
];

let mobileDistPath: string | null = null;
for (const p of possibleMobilePaths) {
  if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
    mobileDistPath = p;
    break;
  }
}

if (mobileDistPath) {
  if (!SILENT_MODE) {
    console.log(`Serving mobile PWA from: ${mobileDistPath}`);
  }
  // Serve static files
  app.use(express.static(mobileDistPath));
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/health') ||
        req.path.startsWith('/connection-info') ||
        req.path.startsWith('/projects')) {
      return next();
    }
    res.sendFile(path.join(mobileDistPath!, 'index.html'));
  });
} else {
  if (!SILENT_MODE) {
    console.log('Mobile PWA not found. Run "npm run build:mobile" to build it.');
    console.log('You can still use the mobile dev server: cd mobile && npm run dev');
  }
}

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Broadcast to all connected clients
function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Send to specific client
function sendToClient(client: WebSocket, message: ServerMessage): void {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

// Get session info for listing
function getSessionInfo(): SessionInfo[] {
  return Array.from(sessions.values()).map((session) => ({
    id: session.id,
    projectPath: session.projectPath,
    projectName: session.projectPath.split('/').pop() || 'Unknown',
    status: session.status,
    lastActivity: session.lastActivity.toISOString(),
    pendingApprovals: session.pendingApprovals.size,
    pendingQuestions: session.pendingQuestions.size,
    messageCount: session.messageCount,
    activeTaskAgents: session.activeTaskAgents.size,
  }));
}

// Handle WebSocket connections
wss.on('connection', (ws: WebSocket) => {
  if (!SILENT_MODE) {
    console.log('Client connected');
  }
  clients.add(ws);

  // Send connection status
  sendToClient(ws, {
    type: 'connection_status',
    status: 'connected',
    message: 'Connected to Claude Code Bridge',
  });

  // Send current sessions
  sendToClient(ws, {
    type: 'session_list',
    sessions: getSessionInfo(),
  });

  // Send current projects
  sendToClient(ws, {
    type: 'project_list',
    projects: projectRegistry.list(),
    activeProjectId: projectRegistry.getActiveProjectId(),
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      await handleClientMessage(ws, message);
    } catch (error) {
      console.error('Error handling message:', error);
      sendToClient(ws, {
        type: 'connection_status',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  ws.on('close', () => {
    if (!SILENT_MODE) {
      console.log('Client disconnected');
    }
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Handle messages from mobile client
async function handleClientMessage(
  client: WebSocket,
  message: ClientMessage
): Promise<void> {
  switch (message.type) {
    case 'connect':
      // Required authentication (token auto-generated if not provided)
      if (!message.authToken) {
        sendToClient(client, {
          type: 'connection_status',
          status: 'error',
          message: 'Authentication token is required',
        });
        return;
      }
      if (message.authToken !== AUTH_TOKEN) {
        sendToClient(client, {
          type: 'connection_status',
          status: 'error',
          message: 'Invalid authentication token',
        });
        return;
      }
      sendToClient(client, {
        type: 'connection_status',
        status: 'authenticated',
      });
      break;

    case 'prompt':
      await handlePrompt(client, message.text, message.sessionId, message.projectPath, {
        permissionMode: message.permissionMode,
        maxThinkingTokens: message.maxThinkingTokens,
      });
      break;

    case 'set_mode':
      handleSetMode(message.sessionId, message.mode);
      break;

    case 'exit_plan_mode':
      handleExitPlanMode(message.sessionId);
      break;

    case 'approval':
      console.log(`[WebSocket] Received approval message:`, JSON.stringify(message));
      handleApproval(message.requestId, message.decision, message.reason, message.answers);
      break;

    case 'interrupt':
      handleInterrupt(message.sessionId);
      break;

    case 'list_sessions':
      sendToClient(client, {
        type: 'session_list',
        sessions: getSessionInfo(),
      });
      break;

    // Project management
    case 'list_projects':
      sendToClient(client, {
        type: 'project_list',
        projects: projectRegistry.list(),
        activeProjectId: projectRegistry.getActiveProjectId(),
      });
      break;

    case 'add_project':
      const addedProject = projectRegistry.add(message.path, message.name);
      broadcast({
        type: 'project_added',
        project: addedProject,
      });
      break;

    case 'remove_project':
      const removed = projectRegistry.remove(message.projectId);
      if (removed) {
        broadcast({
          type: 'project_removed',
          projectId: message.projectId,
        });
      }
      break;

    case 'select_project':
      const selectedProject = projectRegistry.setActive(message.projectId);
      if (selectedProject) {
        broadcast({
          type: 'project_selected',
          projectId: message.projectId,
          project: selectedProject,
        });
      }
      break;

    case 'answer_question':
      handleAnswerQuestion(
        message.sessionId,
        message.requestId,
        message.answers,
        message.action,
        message.customInput
      );
      break;
  }
}

// Handle answer to user question from mobile
function handleAnswerQuestion(
  sessionId: string,
  requestId: string,
  answers: Record<string, string | string[]>,
  action?: string,
  customInput?: string
): void {
  console.log(`[Question] Received answer: requestId=${requestId}, sessionId=${sessionId}`);

  const session = sessions.get(sessionId);
  if (session) {
    const resolved = session.resolveQuestion(requestId, answers, action, customInput);
    if (resolved) {
      console.log(`[Question] Resolved question ${requestId}`);
    } else {
      console.warn(`[Question] No pending question found for ${requestId}`);
    }
  } else {
    // Try to find session with this pending question
    for (const s of sessions.values()) {
      if (s.pendingQuestions.has(requestId)) {
        s.resolveQuestion(requestId, answers, action, customInput);
        console.log(`[Question] Found and resolved in session ${s.id}`);
        return;
      }
    }
    console.warn(`[Question] No session found for question ${requestId}`);
  }
}

// Handle set mode request
function handleSetMode(sessionId: string, mode: PermissionMode): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.setPermissionMode(mode);
    console.log(`[Session] Mode changed to ${mode} for session ${sessionId}`);
  }
}

// Handle exit plan mode request
function handleExitPlanMode(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.setPermissionMode('default');
    console.log(`[Session] Exited plan mode for session ${sessionId}`);
  }
}

// Handle new prompt from mobile
async function handlePrompt(
  _client: WebSocket,
  prompt: string,
  sessionId?: string,
  projectPath?: string,
  options?: { permissionMode?: PermissionMode; maxThinkingTokens?: number }
): Promise<void> {
  // Get or create session
  let session: ClaudeSession;

  if (sessionId && sessions.has(sessionId)) {
    session = sessions.get(sessionId)!;
  } else {
    // Create new session
    const newSessionId = sessionId || uuidv4();
    // Use provided path, or active project path, or current working directory
    const activeProject = projectRegistry.getActiveProject();
    const cwd = projectPath || activeProject?.path || process.cwd();

    session = new ClaudeSession(newSessionId, cwd, {
      onStream: (text) => {
        broadcast({
          type: 'stream',
          text,
          sessionId: newSessionId,
        });
      },
      onThinking: (text) => {
        broadcast({
          type: 'thinking',
          text,
          sessionId: newSessionId,
        });
      },
      onToolStart: (tool, input, toolUseId) => {
        broadcast({
          type: 'tool_start',
          sessionId: newSessionId,
          tool,
          input,
          toolUseId,
        });
      },
      onToolInput: (tool, toolUseId, input) => {
        broadcast({
          type: 'tool_input',
          sessionId: newSessionId,
          tool,
          toolUseId,
          input,
        });
      },
      onToolComplete: (tool, toolUseId, result, success) => {
        broadcast({
          type: 'tool_complete',
          sessionId: newSessionId,
          tool,
          toolUseId,
          result,
          success,
        });
      },
      onApprovalRequest: (requestId, tool, input, description) => {
        broadcast({
          type: 'approval_request',
          requestId,
          sessionId: newSessionId,
          tool,
          input,
          description,
        });
      },
      onDiff: (requestId, file, oldContent, newContent, additions, deletions) => {
        broadcast({
          type: 'diff',
          sessionId: newSessionId,
          requestId,
          file,
          oldContent,
          newContent,
          additions,
          deletions,
        });
      },
      onStatusChange: (status) => {
        broadcast({
          type: 'session',
          sessionId: newSessionId,
          status,
          projectPath: cwd,
        });
      },
      onResult: (result, totalCost, duration, toolUses, tokens) => {
        broadcast({
          type: 'result',
          sessionId: newSessionId,
          result,
          totalCost,
          duration,
          toolUses,
          tokens,
        });
      },
      onError: (error) => {
        broadcast({
          type: 'session',
          sessionId: newSessionId,
          status: 'error',
          error,
        });
      },
      onModeChanged: (mode) => {
        broadcast({
          type: 'mode_changed',
          sessionId: newSessionId,
          mode,
        });
      },
      // New callbacks for enhanced UI
      onTaskAgentStart: (agentId, agentType, description) => {
        broadcast({
          type: 'task_agent_start',
          sessionId: newSessionId,
          agentId,
          agentType,
          description,
        });
      },
      onTaskAgentProgress: (agentId, toolUses, tokens, status) => {
        broadcast({
          type: 'task_agent_progress',
          sessionId: newSessionId,
          agentId,
          toolUses,
          tokens,
          status,
        });
      },
      onTaskAgentComplete: (agentId, agentType, description, toolUses, tokens, durationMs, success) => {
        broadcast({
          type: 'task_agent_complete',
          sessionId: newSessionId,
          agentId,
          agentType,
          description,
          toolUses,
          tokens,
          durationMs,
          success,
        });
      },
      onFileReadResult: (toolUseId, filePath, fileName, linesRead) => {
        broadcast({
          type: 'file_read_result',
          sessionId: newSessionId,
          toolUseId,
          filePath,
          fileName,
          linesRead,
        });
      },
      onFileWriteResult: (toolUseId, filePath, fileName, linesWritten, contentPreview, totalLines, isUpdate, label) => {
        broadcast({
          type: 'file_write_result',
          sessionId: newSessionId,
          toolUseId,
          filePath,
          fileName,
          linesWritten,
          contentPreview,
          totalLines,
          isUpdate,
          label,
        });
      },
      onAskUserQuestion: (requestId, questions, planFile, actions) => {
        broadcast({
          type: 'ask_user_question',
          sessionId: newSessionId,
          requestId,
          questions,
          planFile,
          actions,
        });
      },
      onContentBlock: (blockId, blockType, content, previewLines, totalLines, title, language, filePath) => {
        broadcast({
          type: 'content_block',
          sessionId: newSessionId,
          blockId,
          blockType,
          content,
          previewLines,
          totalLines,
          title,
          language,
          filePath,
        });
      },
      onTaskCreated: (task) => {
        broadcast({
          type: 'task_created',
          sessionId: newSessionId,
          task,
        });
      },
      onTaskUpdated: (taskId, status, subject, description, activeForm) => {
        broadcast({
          type: 'task_updated',
          sessionId: newSessionId,
          taskId,
          status,
          subject,
          description,
          activeForm,
        });
      },
      onTaskList: (tasks) => {
        broadcast({
          type: 'task_list',
          sessionId: newSessionId,
          tasks,
        });
      },
    });

    sessions.set(newSessionId, session);

    broadcast({
      type: 'session',
      sessionId: newSessionId,
      status: 'started',
      projectPath: cwd,
    });
  }

  // Execute the prompt with options
  await session.executePrompt(prompt, options);
}

// Handle approval decision from mobile
function handleApproval(
  requestId: string,
  decision: 'allow' | 'deny',
  reason?: string,
  answers?: Record<string, string>
): void {
  console.log(`[Approval] Received: requestId=${requestId}, decision=${decision}`);
  console.log(`[Approval] Active sessions: ${sessions.size}`);

  // Find the session with this pending approval
  for (const session of sessions.values()) {
    console.log(`[Approval] Checking session ${session.id}, pending approvals: ${session.pendingApprovals.size}`);
    const pending = session.pendingApprovals.get(requestId);
    if (pending) {
      console.log(`[Approval] Found pending approval for tool: ${pending.toolName}`);

      // For AskUserQuestion, update the input with answers
      let updatedInput = pending.input;
      if (pending.toolName === 'AskUserQuestion' && answers) {
        console.log(`[Approval] Adding answers to AskUserQuestion:`, answers);
        updatedInput = {
          ...(pending.input as Record<string, unknown>),
          answers,
        };
      }

      pending.resolve({
        behavior: decision,
        message: reason,
        updatedInput: updatedInput as Record<string, unknown>,
      });
      session.pendingApprovals.delete(requestId);
      console.log(`[Approval] Resolved and deleted. Remaining: ${session.pendingApprovals.size}`);
      return;
    }
  }
  console.warn(`[Approval] No pending approval found for requestId: ${requestId}`);
}

// Handle interrupt request
function handleInterrupt(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.interrupt();
    broadcast({
      type: 'session',
      sessionId,
      status: 'complete',
    });
  }
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  if (!SILENT_MODE) {
    const authTokenDisplay = AUTH_TOKEN.length > 40
      ? AUTH_TOKEN.substring(0, 40) + '...'
      : AUTH_TOKEN;

    console.log(`
╔════════════════════════════════════════════════════════════╗
║         Claude Code Mobile Bridge Server                   ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Server running on port ${PORT}                             ║
║                                                            ║
║  🔐 Authentication Token (required):                        ║
║     ${authTokenDisplay.padEnd(43)}║
║                                                            ║
║  To connect from mobile:                                   ║
║  1. Find your laptop's IP address                          ║
║  2. Open http://<your-ip>:${PORT}/connection-info           ║
║  3. Use the WebSocket URL with auth token                  ║
║                                                            ║
║  Health check: http://localhost:${PORT}/health              ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');

  // Interrupt all sessions
  for (const session of sessions.values()) {
    session.interrupt();
  }

  // Close all WebSocket connections
  for (const client of clients) {
    client.close();
  }

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
