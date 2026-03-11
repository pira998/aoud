# Security

This document outlines security considerations and best practices for Aoud.

## Security Model

Aoud is designed for **single-user, trusted network environments**. The bridge server runs on your local machine and connects to your mobile device to control Claude Code sessions.

### Threat Model

- **Primary Use Case**: Developer controlling their own local environment from their mobile phone
- **Trust Boundary**: Connection between your server and your mobile device
- **Risk Level**: MODERATE (with recommended mitigations)

## Security Features

### 1. Authentication

**Token-Based Authentication**:
- Required by default (auto-generated on first start)
- 256-bit cryptographically secure random tokens
- Stored in `.env` file with restricted permissions
- Included in WebSocket connection URL

**Best Practices**:
- Never share your auth token
- Regenerate tokens periodically: `npx aoud config --reset-token`
- Use different tokens for different deployments
- Don't commit `.env` files to version control

### 2. Tool Approval Flow

**Write Operations Require Approval**:
- Edit, Write, Bash, NotebookEdit tools require explicit mobile approval
- Diff viewer shows exact changes before approval
- Auto-approve only safe read operations (Read, Glob, Grep, WebSearch, Task)

**User Control**:
- Review all code changes before accepting
- Reject suspicious or unintended operations
- Track tool usage in session logs

### 3. Project Isolation

- Each session operates within its project directory
- File paths resolved relative to project root
- Claude Code enforces file system boundaries

## Security Considerations

### 1. Network Security

#### Local Network (Default)
- Server binds to `0.0.0.0` (accessible on local network)
- Anyone on your network can connect with the auth token
- **Mitigation**: Use strong auth tokens, trusted networks only

#### Public Tunnel (ngrok/localtunnel)
- Creates a public HTTPS URL to your local server
- Anyone on the internet can attempt to connect
- **Mitigations**:
  - Always use auth tokens when tunneling
  - Use ngrok auth headers if available
  - Limit tunnel session duration
  - Monitor connection logs

### 2. Transport Security

#### TLS/HTTPS Support
- Optional TLS mode: `npx aoud start --tls`
- Generates self-signed certificates for HTTPS/WSS
- Tunneling services (ngrok/localtunnel) provide HTTPS automatically

**Recommendations**:
- Use TLS when connecting over untrusted networks
- Accept self-signed certificate warnings (expected for local dev)
- For production: Use proper certificates (Let's Encrypt)

### 3. Token Storage

#### Current Implementation
- Tokens stored in plaintext in `.env` file
- Config file: `~/.aoud/config.json`
- File permissions default to user's umask

**Best Practices**:
- Ensure `.env` is in `.gitignore`
- Check file permissions: `ls -la .env` (should be `-rw-------`)
- On shared systems: `chmod 600 .env`
- Use environment variables instead of files in production

### 4. Code Execution Risks

#### Bash Tool
- Allows executing arbitrary shell commands
- **Always requires approval** (not auto-approved)
- **Risk**: Could execute malicious commands if approved carelessly

**Best Practices**:
- Review bash commands carefully before approval
- Understand what each command does
- Reject commands that seem suspicious
- Use Claude Code's built-in safety features

#### File System Access
- Edit/Write tools can modify any file in project directory
- Diff viewer shows changes before applying
- Write tool blocked for existing files (forces Edit with diff)

**Best Practices**:
- Review diffs completely before approving
- Watch for unintended changes to critical files (.git, package.json, etc.)
- Maintain version control backups

## Known Limitations

### Authentication
- ❌ No rate limiting on failed auth attempts
- ❌ No account lockout mechanism
- ❌ No failed login logging with IP tracking
- ⚠️ Tokens stored in plaintext (no encryption)

### Network
- ❌ No IP whitelisting
- ❌ No connection count limits
- ⚠️ TLS is optional (not enforced)

### Session Security
- ⚠️ Sessions persist in memory (lost on restart)
- ⚠️ No automatic session timeout
- ⚠️ No re-authentication required for long sessions

## Recommended Security Practices

### For Local Development (Trusted Network)

```bash
# Use default settings
npx aoud start

# Auth token generated automatically
# Connect only from your mobile device
# Review all tool approvals carefully
```

### For Remote Access (Public Tunnel)

```bash
# Generate strong token first
export AOUD_AUTH_TOKEN=$(openssl rand -hex 32)

# Start with TLS
npx aoud start --tunnel --tls

# Monitor logs for suspicious connections
# Terminate tunnel when not in use
```

### For Production Deployment (Future)

- Use proper TLS certificates (Let's Encrypt)
- Implement rate limiting
- Add IP whitelisting
- Enable audit logging
- Use environment-based config (not files)
- Run behind reverse proxy (nginx)
- Set up monitoring and alerts

## Reporting Security Vulnerabilities

If you discover a security vulnerability in Aoud:

**DO NOT open a public GitHub issue.**

Instead, please use [GitHub Security Advisories](https://github.com/pira998/aoud/security/advisories) to report vulnerabilities privately.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)

We take security seriously and will respond promptly to legitimate reports.

## Security Checklist

Before deploying Aoud:

- [ ] Strong auth token generated (not default/simple)
- [ ] `.env` file permissions restricted (`chmod 600`)
- [ ] `.env` file in `.gitignore`
- [ ] TLS enabled if using public tunnel
- [ ] Connection logs monitored
- [ ] Tool approvals reviewed carefully
- [ ] Latest version installed
- [ ] Tunnel terminated when not in use

## Future Security Improvements

Planned enhancements:
- Rate limiting on authentication attempts
- IP whitelisting configuration
- Encrypted token storage
- Session timeouts with re-authentication
- Audit logging for all tool executions
- Two-factor authentication option
- OAuth support for enterprise deployments

## Compliance

### Data Privacy
- No data is sent to external services (except Claude API)
- Session data stored locally on your machine
- Projects and code never leave your control (except via Claude API for AI processing)

### API Key Security
- Anthropic API key required for Claude Code
- API key stored in Claude Code's config (not bridge server)
- Bridge server never accesses or logs API keys

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [WebSocket Security Best Practices](https://owasp.org/www-community/controls/WebSockets)
- [Anthropic API Security](https://docs.anthropic.com/en/api/security)

## Version History

- **v1.0.0**: Initial security documentation
  - Token-based authentication
  - Tool approval flow
  - Basic TLS support
