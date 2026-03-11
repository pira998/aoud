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
import { spawn, ChildProcess } from 'child_process';
import { ClaudeSession } from './claude-session.js';
import { discoverProjects, getActiveProjectId, setActiveProjectId as saveActiveProjectId, findProjectByPath } from './project-discovery.js';
import { instanceRegistry } from './instance-registry.js';
import { ProcessMonitor } from './process-monitor.js';
import { SessionStorage, normalizeProjectPath } from './session-storage.js';
import type {
  ClientMessage,
  ServerMessage,
  SessionInfo,
  ActiveSession,
} from './types.js';
import type { PermissionMode } from '../../shared/types.js';
import { log } from './logger.js';
import { handleTicketMessage } from './ticket-handler.js';
import { getAvailableModels, getModelConfig } from './models/model-registry.js';
import { searchFiles, readFileForPreview, getRecentFiles } from './file-search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = parseInt(process.env.PORT || '3001');
const SILENT_MODE = process.env.AOUD_SILENT === 'true';
const INSTANCE_ID = process.env.AOUD_INSTANCE_ID;
const SESSION_ROOT = process.env.AOUD_SESSION_ROOT || path.join(os.homedir(), 'Downloads');

/**
 * Calculate cost based on model and usage with support for 1M context tiered pricing
 */
function calculateCost(model: string | undefined, usage: any): number {
  const modelConfig = getModelConfig(model);

  // Fallback to legacy calculation if model not found in registry
  if (!modelConfig) {
    return calculateLegacyCost(usage, model);
  }

  const { pricing } = modelConfig;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const totalTokens = inputTokens + outputTokens;

  let cost = 0;

  // Tiered pricing for 1M context models (2x input, 1.5x output for tokens >200K)
  if (modelConfig.contextWindow === 1000000 && totalTokens > 200000) {
    // Split tokens into under/over 200K buckets
    const inputUnder200k = Math.min(inputTokens, 200000);
    const inputOver200k = Math.max(0, inputTokens - 200000);
    const outputUnder200k = Math.min(outputTokens, 200000);
    const outputOver200k = Math.max(0, outputTokens - 200000);

    // Calculate cost for each tier
    cost += inputUnder200k * pricing.input;
    cost += inputOver200k * (pricing.inputOver200k || pricing.input * 2);
    cost += outputUnder200k * pricing.output;
    cost += outputOver200k * (pricing.outputOver200k || pricing.output * 1.5);
  } else {
    // Standard pricing for 200K context models
    cost += inputTokens * pricing.input;
    cost += outputTokens * pricing.output;
  }

  // Cache pricing (same rate regardless of context tier)
  cost += (usage.cache_creation_input_tokens || 0) * pricing.cacheWrite;
  cost += (usage.cache_read_input_tokens || 0) * pricing.cacheRead;

  return cost;
}

/**
 * Legacy cost calculation for backward compatibility
 */
function calculateLegacyCost(usage: any, model?: string): number {
  // Default to Sonnet 4.5 pricing
  let inputRate = 0.000003;         // $3/Mtok
  let outputRate = 0.000015;        // $15/Mtok
  let cacheWriteRate = 0.00000375;  // $3.75/Mtok (25% more)
  let cacheReadRate = 0.0000003;    // $0.30/Mtok (90% less)

  // Determine rates based on model string matching
  if (model) {
    if (model.includes('opus')) {
      inputRate = 0.000005;         // $5/Mtok
      outputRate = 0.000025;        // $25/Mtok
      cacheWriteRate = 0.00000625;  // $6.25/Mtok (25% more)
      cacheReadRate = 0.0000005;    // $0.50/Mtok (90% less)
    } else if (model.includes('haiku')) {
      inputRate = 0.000001;         // $1/Mtok
      outputRate = 0.000005;        // $5/Mtok
      cacheWriteRate = 0.00000125;  // $1.25/Mtok (25% more)
      cacheReadRate = 0.0000001;    // $0.10/Mtok (90% less)
    }
    // sonnet is default
  }

  return (
    (usage.input_tokens || 0) * inputRate +
    (usage.output_tokens || 0) * outputRate +
    (usage.cache_creation_input_tokens || 0) * cacheWriteRate +
    (usage.cache_read_input_tokens || 0) * cacheReadRate
  );
}

// Types for parsing JSONL session content blocks
interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | unknown[];
  is_error?: boolean;
}

interface ParsedToolCall {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'running' | 'done' | 'error';
  elapsedMs?: number;
}

/**
 * Parse assistant message content blocks and extract tool information
 */
function parseAssistantContent(contentBlocks: ContentBlock[]): {
  content: ContentBlock[];
  toolCalls: Record<string, ParsedToolCall>;
} {
  const toolCalls: Record<string, ParsedToolCall> = {};
  const processedContent: ContentBlock[] = [];

  // First pass: identify all tool_use blocks
  for (const block of contentBlocks) {
    if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls[block.id] = {
        id: block.id,
        toolName: block.name,
        input: block.input || {},
        status: 'running',
      };
      processedContent.push(block);
    } else if (block.type === 'text' || block.type === 'thinking') {
      processedContent.push(block);
    }
  }

  // Second pass: match tool_result blocks to tool_use
  for (const block of contentBlocks) {
    if (block.type === 'tool_result' && block.tool_use_id) {
      const toolCall = toolCalls[block.tool_use_id];
      if (toolCall) {
        // Convert result content to string
        let outputString = '';
        if (typeof block.content === 'string') {
          outputString = block.content;
        } else if (Array.isArray(block.content)) {
          // Tool results can be arrays with text objects
          for (const item of block.content) {
            if (typeof item === 'object' && item !== null && 'text' in item) {
              outputString += (item as any).text;
            }
          }
        }

        toolCall.output = outputString;
        toolCall.status = block.is_error ? 'error' : 'done';
      }
    }
  }

  // Mark tools without results as completed with empty output
  for (const toolCall of Object.values(toolCalls)) {
    if (toolCall.status === 'running') {
      toolCall.status = 'done';
      toolCall.output = toolCall.output || '';
    }
  }

  return { content: processedContent, toolCalls };
}

/**
 * Parse a session JSONL file and extract messages and tool calls
 * Reusable by both handleLoadSession and handleResumeSession
 */
async function parseSessionFile(sessionPath: string): Promise<{
  messages: Array<{role: string; content: ContentBlock[]; timestamp: number; model?: string}>;
  toolCalls: Record<string, ParsedToolCall>;
  stats: {
    totalTokens: number;
    totalCost: number;
    totalToolUses: number;
  };
}> {
  if (!fs.existsSync(sessionPath)) {
    throw new Error('Session file not found');
  }

  // Read and parse JSONL file
  const content = fs.readFileSync(sessionPath, 'utf-8');
  const lines = content.trim().split('\n').filter(l => l.trim());

  // Calculate stats
  let totalTokens = 0;
  let totalCost = 0;

  // Convert to messages format
  const messages: Array<{role: string; content: ContentBlock[]; timestamp: number; model?: string}> = [];
  const allToolCalls: Record<string, ParsedToolCall> = {};

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Skip file history snapshots
      if (entry.type === 'file-history-snapshot') {
        continue;
      }

      // Calculate token usage
      if (entry.message?.usage) {
        const usage = entry.message.usage;
        totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
        totalCost += calculateCost(entry.message.model, usage);
      }

      if (entry.type === 'user') {
        // User messages can be string or array
        let content = entry.message?.content || '';

        // Handle array format (with tool_result blocks)
        if (Array.isArray(content)) {
          // Process tool_result blocks first to populate outputs
          for (const block of content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const toolCall = allToolCalls[block.tool_use_id];
              if (toolCall) {
                // Convert result content to string
                let outputString = '';
                if (typeof block.content === 'string') {
                  outputString = block.content;
                } else if (Array.isArray(block.content)) {
                  for (const item of block.content) {
                    if (typeof item === 'object' && item !== null && 'text' in item) {
                      outputString += (item as any).text;
                    }
                  }
                }

                toolCall.output = outputString;
                toolCall.status = block.is_error ? 'error' : 'done';
              }
            }
          }

          // Extract text blocks
          const textBlocks = content.filter((block: any) => block.type === 'text');
          if (textBlocks.length > 0) {
            messages.push({
              role: 'user',
              content: textBlocks,
              timestamp: new Date(entry.timestamp).getTime(),
            });
          }
          // If no text blocks, skip (this is just tool results)
        } else if (content && content.trim() !== '') {
          // String content
          messages.push({
            role: 'user',
            content: [{ type: 'text', text: content }] as ContentBlock[],
            timestamp: new Date(entry.timestamp).getTime(),
          });
        }
      } else if (entry.type === 'assistant') {
        // Parse assistant content blocks
        if (entry.message?.content && Array.isArray(entry.message.content)) {
          const { content, toolCalls } = parseAssistantContent(
            entry.message.content as ContentBlock[]
          );

          // Merge tool calls into global record
          Object.assign(allToolCalls, toolCalls);

          messages.push({
            role: 'assistant',
            content: content,
            timestamp: new Date(entry.timestamp).getTime(),
            model: entry.message.model,
          });
        }
      }
    } catch (error) {
      log.warn('ParseSession', 'Skipping malformed line:', error);
      continue;
    }
  }

  // Count total completed tool uses
  const totalToolUses = Object.values(allToolCalls).filter(
    tc => tc.status === 'done' || tc.status === 'error'
  ).length;

  return {
    messages,
    toolCalls: allToolCalls,
    stats: {
      totalTokens,
      totalCost,
      totalToolUses,
    },
  };
}

// Auth token: only require auth if AOUD_AUTH_TOKEN is explicitly set
const AUTH_TOKEN = process.env.AOUD_AUTH_TOKEN || null;
const AUTH_REQUIRED = !!AUTH_TOKEN;
if (!AUTH_REQUIRED && !SILENT_MODE) {
  log.info('Auth', 'No AOUD_AUTH_TOKEN set — authentication disabled. Set AOUD_AUTH_TOKEN to enable.');
}

// Active sessions map
const sessions = new Map<string, ClaudeSession>();

// Track the currently active session (the one the user is interacting with)
let activeSessionId: string | null = null;

// Store the pending model to apply when a new session is created
// (handles case where user selects model before sending first prompt)
let pendingModel: string | null = null;

// Connected clients
const clients = new Set<WebSocket>();

// Session storage for persistence
const sessionStorage = new SessionStorage();

// Direct terminal processes (bypassing Claude SDK)
const terminalProcesses = new Map<string, {
  process: ChildProcess;
  sessionId: string;
  command: string;
  startTime: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}>();
const MAX_TERMINAL_PROCESSES_PER_SESSION = 3;
const TERMINAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Express app for health checks
const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  // Update instance health if this is a registered instance
  if (INSTANCE_ID) {
    instanceRegistry.updateHealth(INSTANCE_ID);
  }

  res.json({
    status: 'ok',
    instanceId: INSTANCE_ID,
    sessions: sessions.size,
    clients: clients.size,
    port: PORT,
    uptime: process.uptime(),
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
    authRequired: AUTH_REQUIRED,
  });
});

// ============================================
// Instance Management REST API
// ============================================

// Get current instance info
app.get('/instance-info', (req, res) => {
  if (!INSTANCE_ID) {
    return res.status(500).json({ error: 'Instance ID not configured' });
  }

  const instance = instanceRegistry.get(INSTANCE_ID);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found in registry' });
  }

  res.json(instance);
});

// List all running instances
app.get('/instances', (req, res) => {
  const instances = instanceRegistry.list();
  res.json({ instances });
});

// ============================================
// Project Management REST API (discovers from ~/.claude/projects/)
// ============================================

// List all projects (discovered from Claude Code SDK data)
app.get('/projects', (_req, res) => {
  res.json({
    projects: discoverProjects(),
    activeProjectId: getActiveProjectId(),
  });
});

// Set active project
app.post('/projects/:id/activate', (req, res) => {
  const projects = discoverProjects();
  const project = projects.find(p => p.id === req.params.id);
  if (project) {
    saveActiveProjectId(req.params.id);
    res.json({ project });
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

// Browse directory (for folder picker)
app.post('/api/browse', (req, res) => {
  const { path: dirPath } = req.body;
  const targetPath = dirPath || os.homedir();

  try {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(d => ({ name: d.name, isDirectory: true }));

    const parentPath = path.dirname(resolved) !== resolved ? path.dirname(resolved) : null;

    res.json({ path: resolved, parentPath, entries });
  } catch (error) {
    res.status(500).json({ error: 'Cannot read directory' });
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
    log.success('Server', `Serving mobile PWA from: ${mobileDistPath}`);
  }
  // Serve static files
  app.use(express.static(mobileDistPath));
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/health') ||
        req.path.startsWith('/connection-info') ||
        req.path.startsWith('/projects') ||
        req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(mobileDistPath!, 'index.html'));
  });
} else {
  if (!SILENT_MODE) {
    log.warn('Server', 'Mobile PWA not found. Run "npm run build:mobile" to build it.');
    log.info('Server', 'You can still use the mobile dev server: cd mobile && npm run dev');
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
    log.success('WebSocket', 'Client connected');
  }
  clients.add(ws);

  // Send connection status
  sendToClient(ws, {
    type: 'connection_status',
    status: 'connected',
    message: 'Connected to Aoud',
  });

  // Send current sessions
  sendToClient(ws, {
    type: 'session_list',
    sessions: getSessionInfo(),
  });

  // Send current projects (discovered from ~/.claude/projects/)
  sendToClient(ws, {
    type: 'project_list',
    projects: discoverProjects(),
    activeProjectId: getActiveProjectId(),
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      await handleClientMessage(ws, message);
    } catch (error) {
      log.error('WebSocket', 'Error handling message:', error);
      sendToClient(ws, {
        type: 'connection_status',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  ws.on('close', () => {
    if (!SILENT_MODE) {
      log.info('WebSocket', 'Client disconnected');
    }
    clients.delete(ws);

    // Kill orphaned terminal processes when client disconnects
    for (const [cmdId, entry] of terminalProcesses.entries()) {
      try {
        entry.process.kill('SIGTERM');
        if (entry.timeoutId) clearTimeout(entry.timeoutId);
        terminalProcesses.delete(cmdId);
        log.info('Terminal', `Cleaned up orphaned process: ${cmdId}`);
      } catch { /* process already exited */ }
    }
  });

  ws.on('error', (error) => {
    log.error('WebSocket', 'WebSocket error:', error);
    clients.delete(ws);
  });
});

// Handle messages from mobile client
async function handleClientMessage(
  client: WebSocket,
  message: ClientMessage
): Promise<void> {
  // Try ticket handler first (for ticket_* message types)
  if ((message as any).type?.startsWith('ticket_')) {
    const activeProject = (() => {
      const id = getActiveProjectId();
      return id ? discoverProjects().find(p => p.id === id) : undefined;
    })();
    const projectDir = activeProject?.path || process.cwd();

    const handled = await handleTicketMessage(
      client,
      message,
      projectDir,
      (msg) => broadcast(msg as any)
    );
    if (handled) return;
  }

  switch (message.type) {
    case 'connect':
      if (AUTH_REQUIRED) {
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
      }
      sendToClient(client, {
        type: 'connection_status',
        status: 'authenticated',
      });
      break;

    case 'prompt':
      await handlePrompt(client, message.text, message.sessionId, message.projectPath, {
        permissionMode: message.permissionMode,
        model: message.model,
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
      log.info('WebSocket', 'Received approval message:', JSON.stringify(message));
      handleApproval(client, message.requestId, message.decision, message.reason, message.answers, message.followUpPrompt);
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

    // Project management (discovered from ~/.claude/projects/)
    case 'list_projects':
      sendToClient(client, {
        type: 'project_list',
        projects: discoverProjects(),
        activeProjectId: getActiveProjectId(),
      });
      break;

    case 'select_project': {
      const allProjects = discoverProjects();
      const selectedProject = allProjects.find(p => p.id === message.projectId);
      if (selectedProject) {
        saveActiveProjectId(message.projectId);
        broadcast({
          type: 'project_selected',
          projectId: message.projectId,
          project: selectedProject,
        });
      }
      break;
    }

    case 'browse_directory': {
      const targetPath = message.path || os.homedir();
      try {
        const resolved = path.resolve(targetPath);
        if (!fs.existsSync(resolved)) {
          sendToClient(client, {
            type: 'browse_directory',
            path: targetPath,
            parentPath: null,
            entries: [],
          });
          break;
        }
        const entries = fs.readdirSync(resolved, { withFileTypes: true })
          .filter(d => d.isDirectory() && !d.name.startsWith('.'))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(d => ({ name: d.name, isDirectory: true }));
        const parentPath = path.dirname(resolved) !== resolved ? path.dirname(resolved) : null;
        sendToClient(client, {
          type: 'browse_directory',
          path: resolved,
          parentPath,
          entries,
        });
      } catch {
        sendToClient(client, {
          type: 'browse_directory',
          path: targetPath,
          parentPath: null,
          entries: [],
        });
      }
      break;
    }

    case 'file_search': {
      try {
        const activeProject = (() => { const id = getActiveProjectId(); return id ? discoverProjects().find(p => p.id === id) : undefined; })();
        const searchPath = message.projectPath || activeProject?.path || process.cwd();

        // If query is empty, return recent files
        if (!message.query || message.query.trim() === '') {
          const result = getRecentFiles(searchPath, 20);
          sendToClient(client, {
            type: 'file_search_result',
            query: message.query,
            entries: result.entries,
            totalCount: result.totalCount,
            truncated: false,
          });
        } else {
          const result = searchFiles(searchPath, message.query, {
            includeFiles: message.includeFiles,
            includeDirs: message.includeDirs,
          });
          sendToClient(client, {
            type: 'file_search_result',
            query: message.query,
            entries: result.entries,
            totalCount: result.totalCount,
            truncated: result.truncated,
          });
        }
      } catch (err: any) {
        sendToClient(client, {
          type: 'file_search_result',
          query: message.query,
          entries: [],
          totalCount: 0,
          truncated: false,
        });
      }
      break;
    }

    case 'file_preview': {
      try {
        const preview = readFileForPreview(message.filePath);
        sendToClient(client, {
          type: 'file_preview_result',
          filePath: message.filePath,
          fileName: path.basename(message.filePath),
          content: preview.content,
          encoding: preview.encoding,
          mimeType: preview.mimeType,
          size: preview.size,
          language: preview.language,
        });
      } catch (err: any) {
        sendToClient(client, {
          type: 'file_preview_error',
          filePath: message.filePath,
          error: err.message || 'Failed to read file',
        });
      }
      break;
    }

    case 'file_save': {
      try {
        const resolvedPath = path.resolve(message.filePath);
        fs.writeFileSync(resolvedPath, message.content, 'utf8');
        sendToClient(client, {
          type: 'file_save_result',
          filePath: message.filePath,
          success: true,
        });
      } catch (err: any) {
        sendToClient(client, {
          type: 'file_save_result',
          filePath: message.filePath,
          success: false,
          error: err.message || 'Failed to save file',
        });
      }
      break;
    }

    case 'list_session_folders': {
      try {
        const rootDir = path.resolve(SESSION_ROOT);
        if (!fs.existsSync(rootDir)) {
          fs.mkdirSync(rootDir, { recursive: true });
        }

        // 1. List folders in SESSION_ROOT (manual session folders)
        const sessionRootEntries = fs.readdirSync(rootDir, { withFileTypes: true })
          .filter(d => d.isDirectory() && !d.name.startsWith('.'))
          .map(d => {
            const folderPath = path.join(rootDir, d.name);
            const stats = fs.statSync(folderPath);
            return {
              name: d.name,
              path: folderPath,
              createdAt: stats.birthtime.toISOString(),
              modifiedAt: stats.mtime.toISOString(),
            };
          });

        // 2. Add all discovered projects from ~/.claude/projects/ (with decoded real paths)
        const discoveredProjects = discoverProjects();
        const projectEntries = discoveredProjects
          .filter(project => fs.existsSync(project.path)) // Only include projects that exist on disk
          .map(project => {
            try {
              const stats = fs.statSync(project.path);
              return {
                name: project.name,
                path: project.path,
                createdAt: stats.birthtime.toISOString(),
                modifiedAt: new Date(project.lastAccessed).toISOString(),
              };
            } catch {
              return null;
            }
          })
          .filter(entry => entry !== null) as Array<{
            name: string;
            path: string;
            createdAt: string;
            modifiedAt: string;
          }>;

        // 3. Combine and deduplicate (prefer session root entries if paths overlap)
        const allEntries = [...sessionRootEntries];
        const existingPaths = new Set(sessionRootEntries.map(e => e.path));
        for (const projectEntry of projectEntries) {
          if (!existingPaths.has(projectEntry.path)) {
            allEntries.push(projectEntry);
            existingPaths.add(projectEntry.path);
          }
        }

        // Sort by most recently modified
        allEntries.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

        // Optional search filtering
        const search = (message as any).search?.toLowerCase();
        const filtered = search
          ? allEntries.filter(e => e.name.toLowerCase().includes(search) || e.path.toLowerCase().includes(search))
          : allEntries;

        sendToClient(client, {
          type: 'session_folder_list',
          basePath: rootDir,
          folders: filtered,
        } as any);
      } catch (error) {
        log.error('SessionFolders', 'Error listing session folders:', error);
        sendToClient(client, {
          type: 'session_folder_list',
          basePath: SESSION_ROOT,
          folders: [],
        } as any);
      }
      break;
    }

    case 'create_session_folder': {
      const folderName = (message as any).folderName?.trim();
      if (!folderName || folderName.includes('/') || folderName.includes('..') || folderName.startsWith('.')) {
        sendToClient(client, {
          type: 'session_folder_created',
          success: false,
          error: 'Invalid folder name',
        } as any);
        break;
      }

      const rootDir = path.resolve(SESSION_ROOT);
      const newFolderPath = path.join(rootDir, folderName);

      // Security: ensure resolved path stays within SESSION_ROOT
      if (!newFolderPath.startsWith(rootDir)) {
        sendToClient(client, {
          type: 'session_folder_created',
          success: false,
          error: 'Invalid path',
        } as any);
        break;
      }

      try {
        if (fs.existsSync(newFolderPath)) {
          sendToClient(client, {
            type: 'session_folder_created',
            success: false,
            error: 'Folder already exists',
          } as any);
          break;
        }
        fs.mkdirSync(newFolderPath, { recursive: true });
        sendToClient(client, {
          type: 'session_folder_created',
          success: true,
          folderPath: newFolderPath,
          folderName: folderName,
        } as any);
      } catch {
        sendToClient(client, {
          type: 'session_folder_created',
          success: false,
          error: 'Failed to create folder',
        } as any);
      }
      break;
    }

    case 'answer_question':
      handleAnswerQuestion(
        message.sessionId,
        message.requestId,
        message.answers,
        message.action,
        message.customInput
      );
      break;

    case 'list_slash_commands':
      await handleListSlashCommands(client, message.sessionId);
      break;

    case 'execute_slash_command':
      await handleExecuteSlashCommand(
        client,
        message.sessionId,
        message.command,
        message.args
      );
      break;

    case 'set_model':
      handleSetModel(message.sessionId, message.model);
      break;

    case 'list_models':
      await handleListModels(client);
      break;

    case 'list_saved_sessions':
      await handleListSavedSessions(client, message.projectId);
      break;

    case 'load_session':
      await handleLoadSession(client, message.sessionId);
      break;

    case 'resume_session':
      await handleResumeSession(client, message.sessionId);
      break;

    case 'close_session':
      handleCloseSession(message.sessionId);
      break;

    case 'get_project_memory':
      await handleGetProjectMemory(client, message.projectPath);
      break;

    case 'terminal_command':
      handleTerminalCommand(client, message.command, message.sessionId, message.cwd);
      break;

    case 'terminal_interrupt':
      handleTerminalInterrupt(message.commandId, message.sessionId);
      break;
  }
}

// ============================================
// Direct Terminal Command Execution
// ============================================

function handleTerminalCommand(
  client: WebSocket,
  command: string,
  sessionId: string,
  cwd?: string
): void {
  // Check concurrent process limit
  let sessionProcessCount = 0;
  for (const entry of terminalProcesses.values()) {
    if (entry.sessionId === sessionId) sessionProcessCount++;
  }
  if (sessionProcessCount >= MAX_TERMINAL_PROCESSES_PER_SESSION) {
    sendToClient(client, {
      type: 'terminal_exit',
      commandId: 'limit-exceeded',
      sessionId,
      exitCode: 1,
      signal: null,
      durationMs: 0,
    } as any);
    log.warn('Terminal', `Rejected: max ${MAX_TERMINAL_PROCESSES_PER_SESSION} concurrent processes per session`);
    return;
  }

  const commandId = uuidv4();

  // Resolve working directory: explicit cwd → session projectPath → active project → process.cwd()
  let resolvedCwd = cwd;
  if (!resolvedCwd) {
    const session = sessions.get(sessionId);
    if (session) {
      resolvedCwd = session.projectPath;
    }
  }
  if (!resolvedCwd) {
    resolvedCwd = process.cwd();
  }

  // Verify cwd exists
  if (!fs.existsSync(resolvedCwd)) {
    resolvedCwd = process.cwd();
  }

  log.info('Terminal', `Executing command: "${command}" in ${resolvedCwd} (commandId: ${commandId})`);

  // Broadcast terminal_start
  broadcast({
    type: 'terminal_start',
    commandId,
    sessionId,
    command,
    cwd: resolvedCwd,
  } as any);

  const startTime = Date.now();

  // Spawn the process using bash login shell to source user's profile
  const childProc = spawn('bash', ['-l', '-c', command], {
    cwd: resolvedCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1',         // Force color for npm, yarn, chalk, etc.
      CLICOLOR_FORCE: '1',      // Force color for macOS tools (ls, grep, etc.)
      CLICOLOR: '1',            // Enable color output
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Set timeout
  const timeoutId = setTimeout(() => {
    log.warn('Terminal', `Command timed out after ${TERMINAL_TIMEOUT_MS / 1000}s: ${commandId}`);
    try {
      childProc.kill('SIGTERM');
      setTimeout(() => {
        try { childProc.kill('SIGKILL'); } catch { /* already exited */ }
      }, 3000);
    } catch { /* already exited */ }
  }, TERMINAL_TIMEOUT_MS);

  // Store process reference
  terminalProcesses.set(commandId, {
    process: childProc,
    sessionId,
    command,
    startTime,
    timeoutId,
  });

  // Stream stdout
  childProc.stdout?.on('data', (data: Buffer) => {
    broadcast({
      type: 'terminal_output',
      commandId,
      sessionId,
      data: data.toString(),
      stream: 'stdout',
    } as any);
  });

  // Stream stderr
  childProc.stderr?.on('data', (data: Buffer) => {
    broadcast({
      type: 'terminal_output',
      commandId,
      sessionId,
      data: data.toString(),
      stream: 'stderr',
    } as any);
  });

  // Handle exit
  childProc.on('close', (exitCode, signal) => {
    const durationMs = Date.now() - startTime;
    clearTimeout(timeoutId);
    terminalProcesses.delete(commandId);

    log.success('Terminal', `Command completed: exitCode=${exitCode}, signal=${signal}, duration=${durationMs}ms`);

    broadcast({
      type: 'terminal_exit',
      commandId,
      sessionId,
      exitCode,
      signal: signal || null,
      durationMs,
    } as any);
  });

  // Handle error (e.g., command not found)
  childProc.on('error', (err) => {
    const durationMs = Date.now() - startTime;
    clearTimeout(timeoutId);
    terminalProcesses.delete(commandId);

    log.error('Terminal', 'Command error:', err.message);

    broadcast({
      type: 'terminal_output',
      commandId,
      sessionId,
      data: `Error: ${err.message}\n`,
      stream: 'stderr',
    } as any);

    broadcast({
      type: 'terminal_exit',
      commandId,
      sessionId,
      exitCode: 1,
      signal: null,
      durationMs,
    } as any);
  });
}

function handleTerminalInterrupt(commandId: string, sessionId: string): void {
  const entry = terminalProcesses.get(commandId);
  if (!entry) {
    log.warn('Terminal', `Interrupt: process not found for commandId=${commandId}`);
    return;
  }

  log.info('Terminal', `Interrupting command: ${commandId}`);

  try {
    entry.process.kill('SIGINT');

    // If still running after 3s, force kill
    setTimeout(() => {
      if (terminalProcesses.has(commandId)) {
        try {
          entry.process.kill('SIGKILL');
          log.warn('Terminal', `Force killed process: ${commandId}`);
        } catch { /* already exited */ }
      }
    }, 3000);
  } catch (err) {
    log.error('Terminal', 'Failed to interrupt:', err);
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
  log.info('Question', `Received answer: requestId=${requestId}, sessionId=${sessionId}`);

  const session = sessions.get(sessionId);
  if (session) {
    const resolved = session.resolveQuestion(requestId, answers, action, customInput);
    if (resolved) {
      log.success('Question', `Resolved question ${requestId}`);
    } else {
      log.warn('Question', `No pending question found for ${requestId}`);
    }
  } else {
    // Try to find session with this pending question
    for (const s of sessions.values()) {
      if (s.pendingQuestions.has(requestId)) {
        s.resolveQuestion(requestId, answers, action, customInput);
        log.success('Question', `Found and resolved in session ${s.id}`);
        return;
      }
    }
    log.warn('Question', `No session found for question ${requestId}`);
  }
}

// Handle set mode request
function handleSetMode(sessionId: string, mode: PermissionMode): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.setPermissionMode(mode);
    log.info('Session', `Mode changed to ${mode} for session ${sessionId}`);
  }
}

// Handle list slash commands request
async function handleListSlashCommands(client: WebSocket, sessionId?: string): Promise<void> {
  // Get dynamic commands from SDK
  let sdkCommands: Array<{name: string; description: string; argumentHint: string}> = [];
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      sdkCommands = await session.getSupportedSlashCommands();
    }
  }

  // Bridge-specific commands (handled by the bridge server)
  const bridgeCommands = [
    { name: 'clear', description: 'Clear terminal (bridge)', argumentHint: '' },
    { name: 'help', description: 'Show all commands (bridge)', argumentHint: 'command' },
    { name: 'status', description: 'Session status (bridge)', argumentHint: '' },
    { name: 'context', description: 'Show context usage (bridge)', argumentHint: '' },
    { name: 'cost', description: 'Cost breakdown (bridge)', argumentHint: '' },
    { name: 'debug', description: 'Debug session (bridge)', argumentHint: 'issue' },
    { name: 'skills', description: 'List SDK commands (bridge)', argumentHint: '' },
  ];

  // Combine bridge commands with actual SDK commands (discovered dynamically)
  sendToClient(client, {
    type: 'slash_command_list',
    commands: [...bridgeCommands, ...sdkCommands],
  });
}

// Handle execute slash command
async function handleExecuteSlashCommand(
  client: WebSocket,
  sessionId: string,
  command: string,
  args?: string
): Promise<void> {
  log.info('SlashCommand', `Executing: ${command} ${args || ''}`);

  const session = sessions.get(sessionId);
  if (!session) {
    sendToClient(client, {
      type: 'slash_command_result',
      sessionId,
      command,
      success: false,
      output: 'No active session',
    });
    return;
  }

  try {
    // Built-in commands
    if (command === 'help') {
      const sdkCommands = await session.getSupportedSlashCommands();
      const sdkCount = sdkCommands.length;

      const helpText = `📖 Aoud Help

🔧 Bridge Commands (handled by bridge server):
  /help              Show this help
  /status            Show session status
  /context           Show context usage
  /cost              Show cost & statistics
  /debug [issue]     Debug current session
  /skills            List all SDK commands
  /clear             Clear terminal (client-side)

🤖 SDK Commands (handled by Claude Agent SDK):
  ${sdkCount > 0 ? `Found ${sdkCount} SDK command(s) - use /skills to see them` : 'No SDK commands loaded yet'}

  Common SDK commands include:
  /commit [msg]      Create git commit
  /plan              Enter planning mode
  /compact           Compress conversation history
  /clear             Clear conversation (SDK version)
  /review-pr <pr>    Review a pull request
  /remember [text]   Save information for future

💡 SDK commands are discovered dynamically when the session starts.
   Type /skills to see the actual list of available SDK commands.

🎨 For model selection, use the UI dropdown`;

      sendToClient(client, {
        type: 'slash_command_result',
        sessionId,
        command,
        success: true,
        output: helpText,
        category: 'builtin',
      });
      return;
    }

    if (command === 'status') {
      const status = `Session: ${session.id}
Status: ${session.status}
Pending approvals: ${session.pendingApprovals.size}
Pending questions: ${session.pendingQuestions.size}`;

      sendToClient(client, {
        type: 'slash_command_result',
        sessionId,
        command,
        success: true,
        output: status,
        category: 'builtin',
      });
      return;
    }

    if (command === 'context') {
      const contextInfo = `📊 Context Usage

Session: ${session.id}
Model: ${session.model}
Project: ${session.projectPath}

Activity:
  Messages: ${session.messageCount}
  Task Agents: ${session.activeTaskAgents.size}
  Pending Approvals: ${session.pendingApprovals.size}
  Pending Questions: ${session.pendingQuestions.size}

💡 Token Usage Bar (at bottom of screen):
   • Shows real-time token usage and API costs
   • Input tokens, output tokens, cache usage
   • Total session cost in USD
   • Click to expand for detailed breakdown

📱 The Token Usage Bar updates automatically as you chat
   and displays cumulative statistics for your entire session.`;

      sendToClient(client, {
        type: 'slash_command_result',
        sessionId,
        command,
        success: true,
        output: contextInfo,
        category: 'builtin',
      });
      return;
    }

    if (command === 'cost') {
      const stats = {
        messageCount: session.messageCount,
        lastActivity: session.lastActivity.toLocaleString(),
        projectPath: session.projectPath,
        permissionMode: session.permissionMode,
      };

      const output = `💰 Session Cost & Statistics

Messages: ${stats.messageCount}
Last Activity: ${stats.lastActivity}
Project: ${stats.projectPath}
Mode: ${stats.permissionMode}

Note: Token usage and cost tracking are displayed in the
Token Usage Bar at the bottom of the screen. This shows
cumulative statistics across the entire session.`;

      sendToClient(client, {
        type: 'slash_command_result',
        sessionId,
        command,
        success: true,
        output: output,
        category: 'builtin',
      });
      return;
    }

    if (command === 'debug') {
      const debugInfo = `🔍 Debug Information

Session ID: ${session.id}
Status: ${session.status}
Project: ${session.projectPath}
Model: ${session.model}
Permission Mode: ${session.permissionMode}

Activity:
  Messages: ${session.messageCount}
  Last Active: ${session.lastActivity.toLocaleString()}

State:
  Task Agents: ${session.activeTaskAgents.size}
  Pending Approvals: ${session.pendingApprovals.size}
  Pending Questions: ${session.pendingQuestions.size}

${args ? `\nAnalyzing: ${args}` : ''}`;

      sendToClient(client, {
        type: 'slash_command_result',
        sessionId,
        command,
        success: true,
        output: debugInfo,
        category: 'builtin',
      });
      return;
    }

    if (command === 'skills') {
      const sdkCommands = await session.getSupportedSlashCommands();

      let output = '🛠️  Available SDK Commands\n\n';
      if (sdkCommands.length === 0) {
        output += 'No SDK commands discovered yet.\n';
        output += 'SDK commands are loaded when the session initializes.\n\n';
        output += 'Try sending a prompt first, then run /skills again.';
      } else {
        output += `Found ${sdkCommands.length} SDK command(s):\n\n`;
        sdkCommands.forEach(cmd => {
          const desc = cmd.description ? ` - ${cmd.description}` : '';
          const hint = cmd.argumentHint ? ` ${cmd.argumentHint}` : '';
          output += `  /${cmd.name}${hint}${desc}\n`;
        });
        output += '\n📝 Bridge commands: /help, /status, /cost, /debug, /clear\n';
        output += '💡 SDK commands are discovered dynamically from Claude Agent SDK';
      }

      sendToClient(client, {
        type: 'slash_command_result',
        sessionId,
        command,
        success: true,
        output: output,
        category: 'builtin',
      });
      return;
    }

    // For SDK commands like /commit, /review-pr, etc., we would execute via Claude Agent SDK
    // For now, send as a regular prompt
    await handlePrompt(client, `/${command}${args ? ' ' + args : ''}`, sessionId, undefined, {});

  } catch (error) {
    log.error('SlashCommand', `Error executing ${command}:`, error);
    sendToClient(client, {
      type: 'slash_command_result',
      sessionId,
      command,
      success: false,
      output: error instanceof Error ? error.message : 'Command execution failed',
    });
  }
}

// Handle set model
function handleSetModel(sessionId: string, model: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    // Track this as the active session
    activeSessionId = sessionId;

    session.setModel(model);

    // Broadcast the selected model (use alias if available, otherwise ID)
    // This ensures the UI can match the correct variant (200K vs 1M)
    const selectedModel = session.modelAlias || session.model;
    log.info('Session', `Model changed to ${selectedModel} (id: ${session.model}, betaTag: ${session.modelBetaTag || 'none'}) for session ${sessionId}`);

    broadcast({
      type: 'model_changed',
      sessionId,
      model: selectedModel,
    });
  } else {
    // Session doesn't exist yet — store the model so it's applied when created
    pendingModel = model;
    log.info('Session', `No session ${sessionId} yet, storing pending model: ${model}`);

    // Still broadcast the change so UI reflects the selection immediately
    broadcast({
      type: 'model_changed',
      sessionId,
      model,
    });
  }
}

// Handle list models - fetch from model registry
async function handleListModels(client: WebSocket): Promise<void> {
  try {
    const modelConfigs = await getAvailableModels();

    // Map ModelConfig to simplified ModelInfo for mobile client
    const models = modelConfigs.map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      contextWindow: m.contextWindow,
      category: m.category,
      alias: m.alias,
    }));

    // Get current model from the ACTIVE session (the one user is interacting with)
    // Use alias if available (to distinguish 200K vs 1M variants), otherwise use ID
    let currentModel = 'claude-sonnet-4-5-20250929';

    if (activeSessionId && sessions.has(activeSessionId)) {
      const activeSession = sessions.get(activeSessionId)!;
      currentModel = activeSession.modelAlias || activeSession.model;
      log.debug('ModelList', `Returning active session model: ${currentModel} (id: ${activeSession.model}, betaTag: ${activeSession.modelBetaTag || 'none'})`);
    } else if (sessions.size > 0) {
      // Fallback: if no active session tracked, use the most recently used session
      const mostRecentSession = Array.from(sessions.values()).sort((a, b) =>
        b.lastActivity.getTime() - a.lastActivity.getTime()
      )[0];
      currentModel = mostRecentSession.modelAlias || mostRecentSession.model;
      log.debug('ModelList', `No active session, using most recent: ${currentModel}`);
    }

    sendToClient(client, {
      type: 'model_list',
      models,
      currentModel,
    });
  } catch (error) {
    log.error('handleListModels', 'Error fetching models', error);
    // Send empty list on error (client will handle gracefully)
    sendToClient(client, {
      type: 'model_list',
      models: [],
      currentModel: 'claude-sonnet-4-5-20250929',
    });
  }
}

// Handle list saved sessions - Read from Claude Code's .claude/projects directory
async function handleListSavedSessions(client: WebSocket, projectId?: string): Promise<void> {
  try {
    const os = await import('os');
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');

    // Get current project path to find the right subdirectory
    const activeProject = (() => { const id = getActiveProjectId(); return id ? discoverProjects().find(p => p.id === id) : undefined; })();
    const projectPath = activeProject?.path || process.cwd();

    // Normalize project path the same way Claude Code does (replace / and _ with -)
    const encodedPath = normalizeProjectPath(projectPath);
    const projectSessionsDir = path.join(claudeDir, encodedPath);

    log.info('SessionList', 'Looking for sessions in:', projectSessionsDir);

    if (!fs.existsSync(projectSessionsDir)) {
      log.info('SessionList', 'No sessions directory found');
      sendToClient(client, {
        type: 'saved_session_list',
        sessions: [],
      });
      return;
    }

    // Read all .jsonl files
    const files = fs.readdirSync(projectSessionsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        sessionId: f.replace('.jsonl', ''),
        filePath: path.join(projectSessionsDir, f),
        stats: fs.statSync(path.join(projectSessionsDir, f)),
      }));

    // Parse each session to extract metadata
    const sessions = files.map(file => {
      try {
        const content = fs.readFileSync(file.filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l.trim());

        if (lines.length === 0) {
          return null;
        }

        // Parse first and last lines
        const firstLine = JSON.parse(lines[0]);
        const lastLine = JSON.parse(lines[lines.length - 1]);

        // Find first user message for title
        let firstUserMessage = '';
        for (const line of lines) {
          const msg = JSON.parse(line);
          if (msg.type === 'user' && msg.message?.content) {
            // Content can be a string or an array
            if (typeof msg.message.content === 'string') {
              firstUserMessage = msg.message.content.substring(0, 100);
            } else if (Array.isArray(msg.message.content)) {
              // Extract text from content blocks
              for (const block of msg.message.content) {
                if (block.type === 'text' && block.text) {
                  firstUserMessage = block.text.substring(0, 100);
                  break;
                }
              }
            }
            if (firstUserMessage) break;
          }
        }

        // Count messages and calculate stats
        let userMessages = 0;
        let totalTokens = 0;
        let totalCost = 0;

        for (const line of lines) {
          const msg = JSON.parse(line);
          if (msg.type === 'user') userMessages++;
          if (msg.message?.usage) {
            const usage = msg.message.usage;
            totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
            // Calculate cost based on the model used
            totalCost += calculateCost(msg.message.model, usage);
          }
        }

        return {
          sessionId: file.sessionId,
          projectId: encodedPath,
          projectPath: firstLine.cwd || projectPath,
          projectName: path.basename(firstLine.cwd || projectPath),
          createdAt: firstLine.timestamp,
          lastModified: lastLine.timestamp,
          status: 'completed' as const,
          stats: {
            totalPrompts: userMessages,
            totalMessages: lines.length,
            totalToolUses: 0,
            totalTokens,
            totalCost,
            duration: 0,
          },
          firstMessage: firstUserMessage || `Session ${file.sessionId.substring(0, 8)}`,
        };
      } catch (error) {
        log.error('SessionList', 'Error parsing session:', file.sessionId, error);
        return null;
      }
    }).filter(s => s !== null);

    // Sort by last modified (most recent first, invalid dates at bottom)
    sessions.sort((a, b) => {
      const timeA = new Date(a!.lastModified).getTime();
      const timeB = new Date(b!.lastModified).getTime();

      // Handle invalid dates - NaN values go to bottom
      if (isNaN(timeA) && isNaN(timeB)) return 0;
      if (isNaN(timeA)) return 1;  // a goes to bottom
      if (isNaN(timeB)) return -1; // b goes to bottom

      return timeB - timeA; // Most recent first
    });

    sendToClient(client, {
      type: 'saved_session_list',
      sessions,
    });
  } catch (error) {
    log.error('SessionList', 'Error listing sessions:', error);
    sendToClient(client, {
      type: 'saved_session_list',
      sessions: [],
    });
  }
}

// Handle get project memory - Read Claude Code memory files
async function handleGetProjectMemory(client: WebSocket, projectPath?: string): Promise<void> {
  try {
    const os = await import('os');
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');

    // Get project path
    const activeProject = (() => { const id = getActiveProjectId(); return id ? discoverProjects().find(p => p.id === id) : undefined; })();
    const resolvedProjectPath = projectPath || activeProject?.path || process.cwd();
    const projectName = path.basename(resolvedProjectPath);
    const encodedPath = normalizeProjectPath(resolvedProjectPath);
    const projectMemoryDir = path.join(claudeDir, encodedPath);

    const locations: Array<{
      type: 'managed_policy' | 'project' | 'project_rules' | 'user' | 'project_local' | 'auto';
      path: string;
      content: string;
      exists: boolean;
      lastModified?: string;
      lineCount?: number;
    }> = [];

    // 1. Managed Policy (organization-level)
    const managedPolicyPaths = process.platform === 'darwin'
      ? ['/Library/Application Support/ClaudeCode/CLAUDE.md']
      : process.platform === 'win32'
      ? ['C:\\Program Files\\ClaudeCode\\CLAUDE.md']
      : ['/etc/claude-code/CLAUDE.md'];

    for (const policyPath of managedPolicyPaths) {
      if (fs.existsSync(policyPath)) {
        const content = fs.readFileSync(policyPath, 'utf-8');
        const stats = fs.statSync(policyPath);
        locations.push({
          type: 'managed_policy',
          path: policyPath,
          content,
          exists: true,
          lastModified: stats.mtime.toISOString(),
          lineCount: content.split('\n').length,
        });
        break; // Only one managed policy location
      }
    }

    // 2. Project memory (project root CLAUDE.md or .claude/CLAUDE.md)
    const projectClaudePaths = [
      path.join(resolvedProjectPath, 'CLAUDE.md'),
      path.join(resolvedProjectPath, '.claude', 'CLAUDE.md'),
    ];

    for (const claudePath of projectClaudePaths) {
      if (fs.existsSync(claudePath)) {
        const content = fs.readFileSync(claudePath, 'utf-8');
        const stats = fs.statSync(claudePath);
        locations.push({
          type: 'project',
          path: claudePath,
          content,
          exists: true,
          lastModified: stats.mtime.toISOString(),
          lineCount: content.split('\n').length,
        });
        break;
      }
    }

    // 3. Project rules (.claude/rules/*.md)
    const rulesDir = path.join(resolvedProjectPath, '.claude', 'rules');
    if (fs.existsSync(rulesDir)) {
      const ruleFiles = fs.readdirSync(rulesDir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(rulesDir, f));

      for (const ruleFile of ruleFiles) {
        const content = fs.readFileSync(ruleFile, 'utf-8');
        const stats = fs.statSync(ruleFile);
        locations.push({
          type: 'project_rules',
          path: ruleFile,
          content,
          exists: true,
          lastModified: stats.mtime.toISOString(),
          lineCount: content.split('\n').length,
        });
      }
    }

    // 4. User memory (~/.claude/CLAUDE.md)
    const userClaudePath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    if (fs.existsSync(userClaudePath)) {
      const content = fs.readFileSync(userClaudePath, 'utf-8');
      const stats = fs.statSync(userClaudePath);
      locations.push({
        type: 'user',
        path: userClaudePath,
        content,
        exists: true,
        lastModified: stats.mtime.toISOString(),
        lineCount: content.split('\n').length,
      });
    }

    // 5. Project local memory (CLAUDE.local.md)
    const localClaudePath = path.join(resolvedProjectPath, 'CLAUDE.local.md');
    if (fs.existsSync(localClaudePath)) {
      const content = fs.readFileSync(localClaudePath, 'utf-8');
      const stats = fs.statSync(localClaudePath);
      locations.push({
        type: 'project_local',
        path: localClaudePath,
        content,
        exists: true,
        lastModified: stats.mtime.toISOString(),
        lineCount: content.split('\n').length,
      });
    }

    // 6. Auto memory (~/.claude/projects/<project>/memory/MEMORY.md)
    const autoMemoryPath = path.join(projectMemoryDir, 'memory', 'MEMORY.md');
    if (fs.existsSync(autoMemoryPath)) {
      const content = fs.readFileSync(autoMemoryPath, 'utf-8');
      const stats = fs.statSync(autoMemoryPath);
      // Only load first 200 lines as per Claude Code behavior
      const lines = content.split('\n');
      const truncatedContent = lines.slice(0, 200).join('\n');
      const isTruncated = lines.length > 200;

      locations.push({
        type: 'auto',
        path: autoMemoryPath,
        content: isTruncated ? truncatedContent + '\n\n[... truncated, only first 200 lines loaded ...]' : content,
        exists: true,
        lastModified: stats.mtime.toISOString(),
        lineCount: lines.length,
      });
    }

    // Send memory data to client
    sendToClient(client, {
      type: 'project_memory',
      projectPath: resolvedProjectPath,
      projectName,
      locations,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    log.error('GetMemory', 'Error retrieving project memory:', error);
    sendToClient(client, {
      type: 'connection_status',
      status: 'error',
      message: 'Failed to retrieve project memory',
    });
  }
}

// Handle load session - Read from Claude Code's .jsonl files
async function handleLoadSession(client: WebSocket, sessionId: string): Promise<void> {
  try {
    const os = await import('os');
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');

    // Get current project path
    const activeProject = (() => { const id = getActiveProjectId(); return id ? discoverProjects().find(p => p.id === id) : undefined; })();
    const projectPath = activeProject?.path || process.cwd();
    const encodedPath = normalizeProjectPath(projectPath);
    const sessionFile = path.join(claudeDir, encodedPath, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionFile)) {
      sendToClient(client, {
        type: 'connection_status',
        status: 'error',
        message: 'Session not found',
      });
      return;
    }

    // Use the reusable parser
    const { messages, toolCalls, stats } = await parseSessionFile(sessionFile);

    // Read first and last lines for metadata
    const content = fs.readFileSync(sessionFile, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    const firstLine = JSON.parse(lines[0]);
    const lastLine = JSON.parse(lines[lines.length - 1]);

    const session = {
      metadata: {
        sessionId,
        projectId: encodedPath,
        projectPath: firstLine.cwd || projectPath,
        projectName: path.basename(firstLine.cwd || projectPath),
        createdAt: firstLine.timestamp,
        lastModified: lastLine.timestamp,
        status: 'completed',
        claudeSessionId: sessionId,
        stats: {
          totalPrompts: messages.filter((m: any) => m.role === 'user').length,
          totalMessages: messages.length,
          totalToolUses: stats.totalToolUses,
          totalTokens: stats.totalTokens,
          totalCost: stats.totalCost,
          duration: 0,
        },
      },
      messages,
      toolCalls,
    };

    sendToClient(client, {
      type: 'session_loaded',
      sessionId,
      session,
    });
  } catch (error) {
    log.error('SessionLoad', 'Error loading session:', error);
    sendToClient(client, {
      type: 'connection_status',
      status: 'error',
      message: 'Failed to load session',
    });
  }
}

// Handle resume session - Continue from Claude Code session
async function handleResumeSession(client: WebSocket, sessionId: string): Promise<void> {
  try {
    const os = await import('os');
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');

    // Get current project path
    const activeProject = (() => { const id = getActiveProjectId(); return id ? discoverProjects().find(p => p.id === id) : undefined; })();
    const projectPath = activeProject?.path || process.cwd();
    const encodedPath = normalizeProjectPath(projectPath);
    const sessionFile = path.join(claudeDir, encodedPath, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionFile)) {
      sendToClient(client, {
        type: 'connection_status',
        status: 'error',
        message: 'Session not found',
      });
      return;
    }

    // Parse session file to get history and project info
    const { messages, toolCalls } = await parseSessionFile(sessionFile);

    const content = fs.readFileSync(sessionFile, 'utf-8');
    const firstLine = JSON.parse(content.trim().split('\n')[0]);
    const sessionProjectPath = firstLine.cwd || projectPath;
    const projectName = path.basename(sessionProjectPath);

    // Use the same session ID to continue the conversation
    const newSessionId = sessionId; // Keep same ID for continuity

    // Send session history to mobile FIRST (before creating session)
    sendToClient(client, {
      type: 'session_resume_history',
      sessionId: newSessionId,
      messages,
      toolCalls,
    });

    // Create new ClaudeSession (it will resume automatically with the sessionId)
    const session = new ClaudeSession(newSessionId, sessionProjectPath, {
      onStream: (text, agentId) => {
        const textString = typeof text === 'string' ? text : (text ? JSON.stringify(text) : '');
        broadcast({ type: 'stream', text: textString, sessionId: newSessionId, agentId });
      },
      onThinking: (text, agentId) => {
        broadcast({ type: 'thinking', text, sessionId: newSessionId, agentId });
      },
      onToolStart: (tool, input, toolUseId, agentId) => {
        broadcast({ type: 'tool_start', sessionId: newSessionId, tool, input, toolUseId, agentId });
      },
      onToolInput: (tool, toolUseId, input, agentId) => {
        broadcast({ type: 'tool_input', sessionId: newSessionId, tool, toolUseId, input, agentId });
      },
      onToolComplete: (tool, toolUseId, result, success, agentId) => {
        const resultString = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        broadcast({ type: 'tool_complete', sessionId: newSessionId, tool, toolUseId, result: resultString, success, agentId });
      },
      onApprovalRequest: (requestId, tool, input, description, diff) => {
        broadcast({ type: 'approval_request', requestId, sessionId: newSessionId, tool, input, description, diff });
      },
      onDiff: (requestId, file, oldContent, newContent, additions, deletions) => {
        broadcast({ type: 'diff', sessionId: newSessionId, requestId, file, oldContent, newContent, additions, deletions });
      },
      onStatusChange: (status) => {
        broadcast({ type: 'session', sessionId: newSessionId, status, projectPath });
        broadcast({ type: 'session_list', sessions: getSessionInfo() });
      },
      onResult: (result, totalCost, duration, toolUses, tokens, usage) => {
        broadcast({ type: 'result', sessionId: newSessionId, result, totalCost, duration, toolUses, tokens, usage });
      },
      onError: (error) => {
        broadcast({ type: 'session', sessionId: newSessionId, status: 'error', error });
      },
      onModeChanged: (mode) => {
        broadcast({ type: 'mode_changed', sessionId: newSessionId, mode });
      },
      onTaskAgentStart: (agentId, agentType, description) => {
        broadcast({ type: 'task_agent_start', sessionId: newSessionId, agentId, agentType, description });
      },
      onTaskAgentProgress: (agentId, toolUses, tokens, status) => {
        broadcast({ type: 'task_agent_progress', sessionId: newSessionId, agentId, toolUses, tokens, status });
      },
      onTaskAgentComplete: (agentId, agentType, description, toolUses, tokens, durationMs, success) => {
        broadcast({ type: 'task_agent_complete', sessionId: newSessionId, agentId, agentType, description, toolUses, tokens, durationMs, success });
      },
      onFileReadResult: (toolUseId, filePath, fileName, linesRead) => {
        broadcast({ type: 'file_read_result', sessionId: newSessionId, toolUseId, filePath, fileName, linesRead });
      },
      onFileWriteResult: (toolUseId, filePath, fileName, linesWritten, contentPreview, totalLines, isUpdate, label) => {
        broadcast({ type: 'file_write_result', sessionId: newSessionId, toolUseId, filePath, fileName, linesWritten, contentPreview, totalLines, isUpdate, label });
      },
      onAskUserQuestion: (requestId, questions, planFile, actions) => {
        broadcast({ type: 'ask_user_question', sessionId: newSessionId, requestId, questions, planFile, actions });
      },
      onContentBlock: (blockId, blockType, content, previewLines, totalLines, title, language, filePath) => {
        broadcast({ type: 'content_block', sessionId: newSessionId, blockId, blockType, content, previewLines, totalLines, title, language, filePath });
      },
      onTaskCreated: (task) => {
        broadcast({ type: 'task_created', sessionId: newSessionId, task });
      },
      onTaskUpdated: (taskId, status, subject, description, activeForm) => {
        broadcast({ type: 'task_updated', sessionId: newSessionId, taskId, status, subject, description, activeForm });
      },
      onTaskList: (tasks) => {
        broadcast({ type: 'task_list', sessionId: newSessionId, tasks });
      },
      onTicketChange: (ticketMessage) => {
        broadcast(ticketMessage as any);
      },
    }, sessionId); // Pass sessionId to resume SDK session

    sessions.set(newSessionId, session);

    // Broadcast updated session list so mobile tabs stay in sync
    broadcast({ type: 'session_list', sessions: getSessionInfo() });

    sendToClient(client, {
      type: 'session_resumed',
      sessionId,
      newSessionId,
      projectPath: sessionProjectPath,
      projectName,
    });
  } catch (error) {
    log.error('SessionResume', 'Error resuming session:', error);
    sendToClient(client, {
      type: 'connection_status',
      status: 'error',
      message: 'Failed to resume session',
    });
  }
}

// Handle close session request
function handleCloseSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    log.warn('CloseSession', `Session ${sessionId} not found`);
    return;
  }

  log.info('CloseSession', `Closing session ${sessionId}`);

  // Clean up the session
  try {
    // The session will auto-save via SDK, just remove from map
    sessions.delete(sessionId);

    // Broadcast updated session list
    broadcast({
      type: 'session_list',
      sessions: getSessionInfo(),
    });

    // Optionally notify clients that the session was closed
    broadcast({
      type: 'session_closed',
      sessionId,
    });
  } catch (error) {
    log.error('CloseSession', 'Error closing session:', error);
  }
}

// Handle exit plan mode request
function handleExitPlanMode(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.setPermissionMode('default');
    log.info('Session', `Exited plan mode for session ${sessionId}`);
  }
}

// Handle new prompt from mobile
async function handlePrompt(
  _client: WebSocket,
  prompt: string,
  sessionId?: string,
  projectPath?: string,
  options?: { permissionMode?: PermissionMode; model?: string; maxThinkingTokens?: number }
): Promise<void> {
  // Get or create session
  let session: ClaudeSession;

  if (sessionId && sessions.has(sessionId)) {
    session = sessions.get(sessionId)!;
  } else {
    // Create new session
    const newSessionId = sessionId || uuidv4();
    // Use provided path, or active project path, or current working directory
    const activeProject = (() => { const id = getActiveProjectId(); return id ? discoverProjects().find(p => p.id === id) : undefined; })();
    let cwd = projectPath || activeProject?.path || process.cwd();

    // Validate cwd exists — create it if needed, fallback to home dir
    if (!fs.existsSync(cwd)) {
      log.warn('Session', `Project path does not exist: ${cwd}, creating it...`);
      try {
        fs.mkdirSync(cwd, { recursive: true });
      } catch (mkdirErr) {
        log.error('Session', `Failed to create directory ${cwd}, falling back to home dir:`, mkdirErr);
        cwd = os.homedir();
      }
    }

    session = new ClaudeSession(newSessionId, cwd, {
      onStream: (text, agentId) => {
        // Ensure text is a string before broadcasting
        const textString = typeof text === 'string'
          ? text
          : (text ? JSON.stringify(text) : '');

        if (typeof text !== 'string') {
          log.error('Server', 'onStream received NON-STRING:', typeof text, text);
        }

        log.debug('Broadcast', typeof textString, '|', textString.substring(0, 50), agentId ? `| Agent: ${agentId}` : '');

        broadcast({
          type: 'stream',
          text: textString,
          sessionId: newSessionId,
          agentId,
        });
      },
      onThinking: (text, agentId) => {
        broadcast({
          type: 'thinking',
          text,
          sessionId: newSessionId,
          agentId,
        });
      },
      onToolStart: (tool, input, toolUseId, agentId) => {
        broadcast({
          type: 'tool_start',
          sessionId: newSessionId,
          tool,
          input,
          toolUseId,
          agentId,
        });
      },
      onToolInput: (tool, toolUseId, input, agentId) => {
        log.debug('Broadcast', 'Broadcasting tool_input:', { tool, toolUseId, agentId, hasAgentId: agentId !== undefined });
        broadcast({
          type: 'tool_input',
          sessionId: newSessionId,
          tool,
          toolUseId,
          input,
          agentId,
        });
      },
      onToolComplete: (tool, toolUseId, result, success, agentId) => {
        // Ensure result is always a string (defensive check)
        let resultString: string;
        if (typeof result === 'string') {
          resultString = result;
        } else if (result === null || result === undefined) {
          resultString = '';
        } else {
          // Should not happen if claude-session.ts is fixed, but safeguard anyway
          log.warn('Server', 'Tool result was not a string, converting:', typeof result);
          resultString = JSON.stringify(result, null, 2);
        }

        log.debug('Broadcast', 'Broadcasting tool_complete:', {
          tool,
          toolUseId,
          agentId,
          resultType: typeof resultString,
          resultLength: resultString.length,
          resultPreview: resultString.substring(0, 100),
          success,
        });

        broadcast({
          type: 'tool_complete',
          sessionId: newSessionId,
          tool,
          toolUseId,
          result: resultString,
          success,
          agentId,
        });
      },
      onApprovalRequest: (requestId, tool, input, description, diff) => {
        broadcast({
          type: 'approval_request',
          requestId,
          sessionId: newSessionId,
          tool,
          input,
          description,
          diff,
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
        broadcast({ type: 'session_list', sessions: getSessionInfo() });
      },
      onResult: (result, totalCost, duration, toolUses, tokens, usage) => {
        broadcast({
          type: 'result',
          sessionId: newSessionId,
          result,
          totalCost,
          duration,
          toolUses,
          tokens,
          usage,
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
      onTicketChange: (ticketMessage) => {
        broadcast(ticketMessage as any);
      },
    });

    sessions.set(newSessionId, session);

    // Apply any pending model that was set before the session existed
    if (pendingModel) {
      session.setModel(pendingModel);
      log.info('Session', `Applied pending model ${pendingModel} to new session ${newSessionId}`);
      pendingModel = null;
    }

    broadcast({
      type: 'session',
      sessionId: newSessionId,
      status: 'started',
      projectPath: cwd,
    });

    // Broadcast updated session list so mobile tabs stay in sync
    broadcast({
      type: 'session_list',
      sessions: getSessionInfo(),
    });
  }

  // Track this as the active session (user is interacting with it)
  activeSessionId = session.id;

  // Apply model if provided (from quick actions)
  if (options?.model) {
    session.setModel(options.model);
    pendingModel = null; // Clear pending since explicit model takes precedence
  }

  // Execute the prompt with options
  await session.executePrompt(prompt, options);
}

// Handle approval decision from mobile
// 4 cases:
//   1. Approve: allow the tool, continue flow
//   2. Reject: deny the tool AND interrupt the session to stop current flow
//   3. Approve with message: allow the tool, then send message as follow-up prompt
//   4. Reject with message: deny + interrupt, then send message as new prompt
function handleApproval(
  client: WebSocket,
  requestId: string,
  decision: 'allow' | 'deny',
  reason?: string,
  answers?: Record<string, string>,
  followUpPrompt?: boolean
): void {
  log.info('Approval', `Received: requestId=${requestId}, decision=${decision}, followUpPrompt=${!!followUpPrompt}, reason=${reason || '(none)'}`);
  log.info('Approval', `Active sessions: ${sessions.size}`);

  // Find the session with this pending approval
  for (const session of sessions.values()) {
    log.debug('Approval', `Checking session ${session.id}, pending approvals: ${session.pendingApprovals.size}`);
    const pending = session.pendingApprovals.get(requestId);
    if (pending) {
      log.info('Approval', `Found pending approval for tool: ${pending.toolName}`);

      // For AskUserQuestion, update the input with answers
      let updatedInput = pending.input;
      if (pending.toolName === 'AskUserQuestion' && answers) {
        log.info('Approval', 'Adding answers to AskUserQuestion:', answers);
        updatedInput = {
          ...(pending.input as Record<string, unknown>),
          answers,
        };
      }

      if (decision === 'deny') {
        // Reject: deny the tool and let the SDK handle the error naturally
        log.warn('Approval', `Rejecting tool ${pending.toolName} for session ${session.id}`);

        // Delete from map and resolve the approval
        session.pendingApprovals.delete(requestId);
        pending.resolve({
          behavior: 'deny',
          message: reason || 'Rejected by user',
          updatedInput: updatedInput as Record<string, unknown>,
        });

        // The SDK will send a tool_result with is_error=true after canUseTool returns deny
        // This will trigger onToolComplete callback which sends tool_complete to the UI
        // So we don't need to manually send tool_complete here

        // If reject with message: wait for the session to complete, then send the message
        if (followUpPrompt && reason) {
          log.info('Approval', `Reject with message: will send "${reason}" after SDK completes`);
          // Wait for the current execution to complete naturally
          const sessionId = session.id;
          const projectPath = session.projectPath;
          const waitForIdle = () => {
            if (session.status === 'idle') {
              log.info('Approval', `Session idle after rejection, sending follow-up: "${reason}"`);
              handlePrompt(client, reason, sessionId, projectPath);
            } else {
              // Check again in 200ms
              setTimeout(waitForIdle, 200);
            }
          };
          // Start checking after a brief delay
          setTimeout(waitForIdle, 500);
        }
      } else {
        // Allow: approve the tool
        pending.resolve({
          behavior: 'allow',
          message: reason,
          updatedInput: updatedInput as Record<string, unknown>,
        });
        session.pendingApprovals.delete(requestId);

        // If approve with message: send the message as a follow-up prompt after current execution completes
        if (followUpPrompt && reason) {
          log.info('Approval', `Approve with message: will send "${reason}" as follow-up prompt after current execution`);
          // Queue the follow-up prompt - it will execute after the current query completes
          const sessionId = session.id;
          const projectPath = session.projectPath;
          const waitForCompletion = () => {
            if (session.status === 'idle') {
              log.info('Approval', `Session idle, sending follow-up prompt: "${reason}"`);
              handlePrompt(client, reason, sessionId, projectPath);
            } else {
              // Check again in 500ms
              setTimeout(waitForCompletion, 500);
            }
          };
          // Start checking after a brief delay
          setTimeout(waitForCompletion, 1000);
        }
      }

      log.success('Approval', `Resolved and deleted. Remaining: ${session.pendingApprovals.size}`);
      return;
    }
  }
  log.warn('Approval', `No pending approval found for requestId: ${requestId}`);
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

// Initialize process monitor if this is a registered instance
let processMonitor: ProcessMonitor | null = null;
if (INSTANCE_ID) {
  processMonitor = new ProcessMonitor(INSTANCE_ID);
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  // Start process monitoring
  if (INSTANCE_ID && processMonitor) {
    instanceRegistry.updateHealth(INSTANCE_ID);
    processMonitor.start();
  }

  if (!SILENT_MODE) {
    const authLines = AUTH_REQUIRED && AUTH_TOKEN
      ? [
          '',
          '🔐 Authentication Token (required):',
          `   ${AUTH_TOKEN.length > 40 ? AUTH_TOKEN.substring(0, 40) + '...' : AUTH_TOKEN}`,
        ]
      : [
          '',
          '🔓 Authentication disabled (no AOUD_AUTH_TOKEN set)',
        ];

    log.banner([
      'Aoud Server',
      '',
      `Server running on port ${PORT}`,
      ...(INSTANCE_ID ? [`Instance ID: ${INSTANCE_ID.substring(0, 8)}...`] : []),
      ...authLines,
      '',
      'To connect from mobile:',
      '1. Find your laptop\'s IP address',
      `2. Open http://<your-ip>:${PORT}/connection-info`,
      ...(AUTH_REQUIRED ? ['3. Use the WebSocket URL with auth token'] : []),
      '',
      `Health check: http://localhost:${PORT}/health`,
    ]);
  }
});

// Periodic health check updates (every 30 seconds)
if (INSTANCE_ID) {
  setInterval(() => {
    instanceRegistry.updateHealth(INSTANCE_ID);
  }, 30000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  log.warn('Server', 'Shutting down...');

  // Interrupt all sessions
  for (const session of sessions.values()) {
    session.interrupt();
  }

  // Close all WebSocket connections
  for (const client of clients) {
    client.close();
  }

  server.close(() => {
    log.success('Server', 'Server closed');
    process.exit(0);
  });
});
