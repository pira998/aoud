# Claude Mobile Bridge

Control your local Claude Code sessions from your mobile phone.

## Overview

Claude Mobile Bridge enables you to interact with Claude Code running on your computer directly from your mobile device. Send prompts, review code changes, and approve tool executions - all from your phone's browser.

## Features

- **Real-time Streaming**: See Claude's responses as they're generated
- **Mobile Diff Viewer**: Review code changes with syntax highlighting
- **Tool Approval**: Approve or reject file edits and bash commands from your phone
- **Secure Connection**: WebSocket with authentication token
- **Auto Tunneling**: Built-in ngrok/localtunnel support with QR codes
- **Session Persistence**: Resume conversations across sessions
- **Task Tracking**: Monitor Claude's progress on multi-step tasks

## Quick Start

### Prerequisites

- Node.js 18 or higher
- [Claude Code CLI](https://claude.com/code) installed and configured
- Active Anthropic API key

### Installation

```bash
npm install -g claude-mobile-bridge
```

### Start the Bridge

```bash
npx claude-bridge start
```

This will:
1. Generate a secure authentication token (saved to `.env`)
2. Start the bridge server
3. Create a tunnel with a public URL
4. Display a QR code

### Connect from Mobile

1. Scan the QR code with your phone camera
2. Open the link in your mobile browser
3. Start chatting with Claude!

## Usage

### Basic Commands

```bash
# Start with automatic tunneling
npx claude-bridge start

# Start on a specific port
npx claude-bridge start --port 3001

# Use specific project directory
npx claude-bridge start --project /path/to/project

# Use ngrok for tunneling (requires token)
npx claude-bridge start --tunnel --ngrok-token YOUR_TOKEN

# Show connection info
npx claude-bridge info

# Manage configuration
npx claude-bridge config --show
npx claude-bridge config --reset-token
```

### Configuration

Set environment variables in `.env`:

```env
BRIDGE_AUTH_TOKEN=your-generated-token
ANTHROPIC_API_KEY=your-api-key
PORT=3001
```

## How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Mobile    │ WebSocket│Bridge Server │  SDK    │ Claude Code │
│   Browser   ├────────>│              ├────────>│   Session   │
│             │         │              │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
```

1. Mobile sends prompts via WebSocket to the bridge server
2. Bridge server uses Claude Agent SDK to execute in local project context
3. Server streams responses, tool usage, and approval requests back to mobile
4. Mobile displays diffs and allows accepting/rejecting operations

## Documentation

- [Development Guide](docs/DEVELOPMENT.md) - Contributing and development setup
- [Architecture](docs/ARCHITECTURE.md) - System design and components
- [Security](docs/SECURITY.md) - Security considerations
- [Contributing](CONTRIBUTING.md) - How to contribute

## Troubleshooting

### Connection Issues

- Ensure firewall allows connections on the specified port
- Check that the auth token matches between server and client
- Verify your Anthropic API key is valid

### Build Issues

```bash
# Clean build
rm -rf node_modules server/node_modules mobile/node_modules
npm install
npm run build
```

## Requirements

- **Node.js**: 18.0.0 or higher
- **Claude Code**: Latest version
- **Network**: Local network access or tunnel service

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- Report issues: [GitHub Issues](https://github.com/YOUR_USERNAME/claude-mobile-bridge/issues)
- Documentation: [docs/](docs/)

## Acknowledgments

Built with:
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)
- React + TypeScript + Vite
- Express + WebSocket
