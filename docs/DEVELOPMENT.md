# Development Guide

This guide provides detailed information for developers working on Claude Mobile Bridge.

## Project Overview

Claude Mobile Bridge enables controlling local VS Code Claude Code sessions from a mobile phone. It consists of:
- **Bridge Server** (Node.js/TypeScript): WebSocket server using `@anthropic-ai/claude-agent-sdk` to interact with Claude Code programmatically
- **Mobile PWA** (React/TypeScript): Progressive Web App client for mobile browsers with diff viewer, approval panels, and real-time streaming
- **Shared Types**: TypeScript type definitions for client-server communication

## Architecture

The bridge server sits between your mobile device and Claude Code:
1. Mobile sends prompts via WebSocket to bridge server
2. Bridge server uses Claude Agent SDK to execute prompts in local project context
3. Server streams responses, tool usage, and approval requests back to mobile in real-time
4. Mobile displays diffs and allows accepting/rejecting file edits, bash commands, etc.

Key architectural patterns:
- **Session Management**: Each project context is a `ClaudeSession` with its own state, pending approvals, and task agents
- **Tool Approval Flow**: Write operations (Edit, Write, Bash) are intercepted via `canUseTool` callback and require mobile approval
- **Real-time Streaming**: Uses `includePartialMessages: true` in SDK to forward text chunks to mobile
- **Project Registry**: Persistent storage of projects in `~/.claude-mobile-bridge/projects.json`
- **Message-based Protocol**: All client-server communication uses typed messages defined in `shared/types.ts`

## Development Commands

### Install Dependencies
```bash
npm install  # Root workspace install
```

### Development (Server)
```bash
# Start server with hot reload
npm run dev
# or
cd server && npm run dev
```

### Development (Mobile)
```bash
# Start mobile PWA dev server (Vite)
npm run dev:mobile
# or
cd mobile && npm run dev
```

### Build
```bash
# Build both server and mobile
npm run build

# Build individually
npm run build:server
npm run build:mobile
```

### Running Built Server
```bash
npm start
# or
node server/dist/index.js
```

### CLI Tool
```bash
# Start with automatic tunneling and QR code
npx claude-bridge start

# Start with custom options
npx claude-bridge start --port 3001 --project /path/to/project --tunnel --ngrok-token YOUR_TOKEN

# Show connection info
npx claude-bridge info

# Manage configuration
npx claude-bridge config --show
npx claude-bridge config --reset-token
```

## Key Files and Their Roles

### Server Core
- `server/src/index.ts`: WebSocket server, message routing, session lifecycle
- `server/src/claude-session.ts`: Manages Claude Agent SDK interactions, tool approval flow, streaming, and callbacks
- `server/src/project-registry.ts`: Persistent project management (`~/.claude-mobile-bridge/projects.json`)
- `server/src/session-storage.ts`: Persistent session storage with JSON format
- `server/src/session-recorder.ts`: Session recording and playback functionality
- `server/src/tls-manager.ts`: TLS certificate generation and management
- `server/src/types.ts`: Server-side types (PendingApproval, ApprovalResult, etc.)

### Mobile Core
- `mobile/src/App.tsx`: Main app component, WebSocket connection management, message dispatching
- `mobile/src/components/UnifiedTerminalView.tsx`: Primary UI - chat view, streaming output, tool execution display
- `mobile/src/components/ApprovalPanel.tsx`: Diff viewer and approval UI for Edit/Write/Bash tools
- `mobile/src/components/ProjectSelector.tsx`: Project management UI
- `mobile/src/components/SessionList.tsx`: Session history and management
- `mobile/src/components/TaskList.tsx`: Task tracking display
- `mobile/src/hooks/useWebSocket.ts`: WebSocket connection hook

### Shared
- `shared/types.ts`: All message types for client-server communication (70+ message types)

### CLI
- `bin/cli.js`: Commander-based CLI for starting server with tunneling, QR codes, TLS, etc.

## Message Flow Examples

### Prompt Execution
1. Mobile → `PromptMessage` → Server
2. Server creates/reuses `ClaudeSession` and calls `executePrompt()`
3. Server → `StreamMessage` → Mobile (real-time text streaming)
4. Server → `ToolStartMessage` → Mobile (when tool is called)
5. If write tool: Server → `ApprovalRequestMessage` → Mobile
6. If Edit: Server → `DiffMessage` → Mobile (shows diff in approval panel)
7. Mobile → `ApprovalMessage` (allow/deny) → Server
8. Server → `ToolCompleteMessage` → Mobile
9. Server → `ResultMessage` → Mobile (final result with cost/duration/tokens)

### Session Management
- Sessions map to project paths (one session per project)
- Session state includes: status, pendingApprovals, pendingQuestions, activeTaskAgents
- Sessions persist across multiple prompts (conversation continuity via `claudeSessionId`)

### Tool Approval Logic
- Auto-approve: Read, Glob, Grep, WebSearch, WebFetch, Task
- Require approval: Edit, Write, Bash, NotebookEdit
- Special handling: Write blocks if file exists (must use Edit instead)
- Approval flow uses Promise-based callbacks stored in `pendingApprovals` Map

## Permission Modes

The bridge supports three permission modes (set via `setPermissionMode()`):
- `default`: Standard approval flow (write ops require approval)
- `plan`: Planning mode - typically auto-approves more tools
- `acceptEdits`: Auto-accept edits mode

Mobile can change mode via `SetModeMessage`.

## Environment Variables

### Server
- `PORT`: Server port (default: 3001)
- `BRIDGE_AUTH_TOKEN`: Authentication token (auto-generated if not provided)
- `ANTHROPIC_API_KEY`: Your Anthropic API key (required)
- `ANTHROPIC_BASE_URL`: Custom API endpoint (for LiteLLM proxy support)
- `ANTHROPIC_MODEL`: Custom model selection

## Testing Connection

1. Start server: `npm run dev`
2. Check health: `curl http://localhost:3001/health`
3. Get connection info: `curl http://localhost:3001/connection-info`
4. Connect mobile to `ws://<your-ip>:3001`

## Debugging Tips

- Server logs include `[ClaudeSession]`, `[Approval]`, `[Question]`, `[DEBUG]` prefixes for filtering
- WebSocket messages are logged in `handleClientMessage()`
- Tool approval flow has extensive logging in `handleToolApproval()` and `handleApproval()`
- Mobile dev tools show WebSocket frames in Network tab
- Use `console.log` to inspect message structures - all messages are JSON

## Common Development Patterns

### Adding a New Server Message Type
1. Define message interface in `shared/types.ts`
2. Add to `ServerMessage` union type
3. Add callback to `SessionCallbacks` interface in `claude-session.ts`
4. Implement callback in session constructor in `index.ts` (broadcast the message)
5. Handle in mobile's `useWebSocket` or message handler

### Adding a New Client Message Type
1. Define message interface in `shared/types.ts`
2. Add to `ClientMessage` union type
3. Add case in `handleClientMessage()` in `server/src/index.ts`
4. Send from mobile via WebSocket

### Modifying Tool Approval Behavior
- Edit `handleToolApproval()` in `claude-session.ts`
- Add tool name to `autoApproveTools` array for auto-approval
- Customize diff generation for new tools (see Edit/Write examples)

## Workspace Structure

This is a npm workspace monorepo:
- Root `package.json` defines workspaces: `["server", "mobile"]`
- Shared types in `shared/` are imported directly (not a workspace)
- Build outputs: `server/dist/`, `mobile/dist/`
- Server uses ESM modules (`"type": "module"` in package.json)

## TypeScript Configuration

- Server: `module: "NodeNext"`, `moduleResolution: "NodeNext"` for ESM
- Mobile: Vite with `module: "ESNext"`, `jsx: "react-jsx"`
- Both use strict mode
- Import shared types: `import type { ... } from '../../shared/types.js'`

## Performance Considerations

- WebSocket connections are kept alive with heartbeat/ping-pong
- Large diffs are sent in chunks to avoid memory issues
- Session state is managed in memory with periodic cleanup
- Tool approvals timeout after a configurable period

## Security Best Practices

- Always use auth tokens in production
- Enable TLS for public-facing deployments
- Review tool approval requests carefully
- Keep dependencies updated
- Don't commit `.env` files or tokens to version control
