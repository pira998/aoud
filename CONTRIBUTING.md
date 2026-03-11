# Contributing to Aoud

Thank you for your interest in contributing to Aoud!

## Development Setup

### Prerequisites
- Node.js 18+
- npm
- Claude Code CLI installed
- Git

### Initial Setup

1. Fork and clone:
```bash
git clone https://github.com/pira998/aoud.git
cd aoud
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env`:
```env
ANTHROPIC_API_KEY=your-api-key
AOUD_AUTH_TOKEN=your-token
PORT=3001
```

4. Build:
```bash
npm run build
```

5. Start dev server:
```bash
npm run dev
```

## Project Structure

```
aoud/
├── server/          # Aoud server (Node.js + WebSocket)
├── mobile/          # PWA client (React + TypeScript)
├── shared/          # Shared TypeScript types
├── bin/             # CLI tool
└── docs/            # Documentation
```

## Development Workflow

### Running in Development

**Server**:
```bash
npm run dev
```

**Mobile**:
```bash
npm run dev:mobile
```

### Building

```bash
npm run build          # Build all
npm run build:server   # Server only
npm run build:mobile   # Mobile only
```

### Testing

Before submitting a PR:
1. Build without errors
2. Test CLI: `npx @piraveen98/aoud-code start` or `aoud start` if installed globally
3. Verify mobile connection
4. Test tool approval flow
5. Check TypeScript: `npx tsc --noEmit`

## Code Style

- Indentation: 2 spaces
- Semicolons: Not required
- Quotes: Single quotes
- Line length: ~100 chars

### Naming Conventions

- Files: kebab-case
- Components: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE

## Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Code refactoring

## Pull Request Process

1. Create branch from `main`
2. Make changes following style guide
3. Test thoroughly
4. Update documentation if needed
5. Write clear commit messages
6. Submit PR with description

### PR Requirements

- Builds successfully
- No TypeScript errors
- Works as described
- Documentation updated

## Reporting Bugs

### Before Submitting

1. Check existing issues
2. Verify latest version
3. Try to reproduce

### Bug Report Template

```markdown
**Description**
Clear description

**Steps to Reproduce**
1. Start server...
2. Connect from mobile...
3. See error...

**Expected Behavior**
What should happen

**Actual Behavior**
What happens

**Environment**
- OS: macOS 14.0
- Node.js: 18.17.0
- Claude Code: 0.5.0
- Mobile Browser: Safari iOS 17

**Additional Context**
Any other information
```

## Feature Requests

We welcome feature requests! Please:
1. Check existing issues first
2. Describe the feature clearly
3. Explain the use case
4. Consider implementation

## Security Issues

**DO NOT open public issues for security vulnerabilities.**

Please use [GitHub Security Advisories](https://github.com/pira998/aoud/security/advisories) to report vulnerabilities privately.

## License

By contributing, you agree your contributions will be licensed under MIT License.

## Questions?

Open a discussion or issue for questions about contributing!
