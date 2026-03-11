# Architecture

This document describes the system architecture of Claude Mobile Bridge.

## System Overview

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Mobile    │         │Bridge Server │         │ Claude Code │
│   Browser   │  WS     │              │  SDK    │   Session   │
│   (PWA)     ├────────>│  WebSocket   ├────────>│             │
│             │         │   + REST     │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
                               │
                        ┌──────▼──────┐
                        │   Storage   │
                        │  Projects   │
                        │  Sessions   │
                        └─────────────┘
```

## Components

### 1. Mobile PWA Client

**Technology**: React 18 + TypeScript + Vite + Tailwind CSS

**Features**:
- Progressive Web App (installable)
- Real-time WebSocket connection
- Syntax-highlighted diff viewer
- Tool approval interface
- Session history and task tracking

**Main Components**:
- `App.tsx`: Connection management, message routing
- `UnifiedTerminalView.tsx`: Chat interface with streaming
- `ApprovalPanel.tsx`: Code diff viewer
- `ProjectSelector.tsx`: Project management
- `SessionList.tsx`: Session history
- `TaskList.tsx`: Task progress display

### 2. Bridge Server

**Technology**: Node.js + Express + WebSocket + TypeScript

**Responsibilities**:
- WebSocket server for real-time communication
- Session lifecycle management
- Tool approval coordination
- Project registry persistence
- Authentication

**Key Modules**:

- `index.ts`: Main server, WebSocket handling, message routing
- `claude-session.ts`: Claude Agent SDK integration, streaming
- `project-registry.ts`: Project storage
- `session-storage.ts`: Session persistence
- `session-recorder.ts`: Recording/playback
- `tls-manager.ts`: TLS support

### 3. Shared Types

**File**: `shared/types.ts`

All WebSocket messages are strongly typed with discriminated unions:
- Client → Server: PromptMessage, ApprovalMessage, etc.
- Server → Client: StreamMessage, ToolStartMessage, DiffMessage, etc.

### 4. CLI Tool

**File**: `bin/cli.js`

Features:
- Project initialization
- Automatic tunneling (ngrok/localtunnel)
- QR code generation
- Configuration management
- TLS certificate setup

## Data Flow

### Prompt Execution Flow

```
1. Mobile → PromptMessage → Server
2. Server → ClaudeSession.executePrompt()
3. Claude Agent SDK executes prompt
4. Server → StreamMessage → Mobile (real-time)
5. Claude calls tool (e.g., Edit)
6. Server intercepts via canUseTool
7. Server → ApprovalRequestMessage + DiffMessage → Mobile
8. User approves/denies on mobile
9. Mobile → ApprovalMessage → Server
10. Tool executes if approved
11. Server → ToolCompleteMessage → Mobile
12. Server → ResultMessage → Mobile (final)
```

### Session Lifecycle

```
Initialize → Ready → Executing → Completed → Ready
```

- Sessions persist across prompts
- One session per project path
- State includes: approvals, questions, task agents

### Tool Approval Mechanism

Promise-based callback system:

1. Tool call intercepted: `canUseTool(tool, args)`
2. Create approval promise, store in `pendingApprovals`
3. Send request to mobile with diff
4. Block execution until promise resolves
5. User approves/denies
6. Resolve promise
7. Tool executes or cancels

## Storage

### Project Registry

**Location**: `~/.claude-mobile-bridge/projects.json`

```json
{
  "projects": [{
    "id": "uuid",
    "name": "Project Name",
    "path": "/path/to/project",
    "lastUsed": "timestamp",
    "createdAt": "timestamp"
  }]
}
```

### Session Storage

**Location**: `~/.claude-mobile-bridge/sessions/`

One JSON file per session with messages, tool calls, metadata.

### Configuration

**Location**: `~/.claude-mobile-bridge/config.json`

Stores auth token, default port, ngrok token.

## Security Architecture

### Authentication
- Token-based (auto-generated if not provided)
- Required by default
- Stored in `.env` file
- Transmitted in WebSocket URL

### Authorization
- Tool approval for write operations
- Project isolation
- File system access limited to project path

### Transport Security
- WebSocket (ws:// or wss://)
- Optional TLS with self-signed certs
- Tunnel services provide HTTPS by default

## Error Handling

### Server Errors
- WebSocket connection failures: retry with backoff
- Claude SDK errors: forwarded as ErrorMessage
- Tool failures: displayed in mobile UI
- Session crashes: cleanup and notify mobile

### Mobile Errors
- Connection loss: auto-reconnect
- Parse errors: user-friendly message
- Approval timeouts: show notice, allow retry

## Performance

### Streaming
- Text streamed in real-time
- Large diffs sent incrementally
- Tool results streamed as available

### Memory Management
- Old sessions garbage collected
- Large messages compressed
- WebSocket frame size limits

### Network Efficiency
- JSON message format (compact)
- Delta updates for UI
- Heartbeat/ping-pong for dead connection detection

## Monitoring

### Server Logs
- `[ClaudeSession]`: Lifecycle events
- `[Approval]`: Tool approvals
- `[Question]`: User questions
- `[DEBUG]`: Detailed debugging

### Metrics
- Connection count
- Session count
- Message throughput
- Approval latency

## Deployment

### Local Development
```
Developer Machine:
├── Bridge Server (localhost:3001)
├── Claude Code Session
└── Mobile Browser (same network)
```

### Remote Access (Tunnel)
```
Developer Machine:
├── Bridge Server (localhost:3001)
│   └── Tunnel Client
│
Internet:
└── Tunnel Service → Public HTTPS
    └── Mobile Browser (anywhere)
```

## Technology Choices

### Why WebSocket?
- Real-time bidirectional communication
- Low latency for streaming
- Native browser support
- Persistent connection

### Why Monorepo?
- Shared types
- Single install/build
- Version synchronization
- Simpler deployment

### Why PWA?
- No app store needed
- Installable on mobile
- Cross-platform (iOS/Android)
- Easy updates

## Future Considerations

- Multi-user support
- Database backend (PostgreSQL)
- Redis for session caching
- GraphQL subscriptions
- Electron desktop app
