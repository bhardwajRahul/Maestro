---
title: SSH Remote Execution
description: Run AI agents on remote hosts via SSH for access to powerful machines or specialized tools.
icon: server
---

Run AI agents on remote machines via SSH instead of locally. This enables you to leverage powerful remote servers, access tools not installed on your local machine, or work with projects that must run in specific environments.

## Overview

SSH Remote Execution wraps agent commands in SSH, executing them on a configured remote host while streaming output back to Maestro. Your local Maestro instance remains the control center, but the AI agent runs remotely.

**Use cases:**
- Run agents on a powerful cloud VM with more CPU/RAM
- Access tools or SDKs installed only on specific servers
- Work with codebases that require particular OS or architecture
- Execute agents in secure/isolated environments

## Configuring SSH Remotes

### Adding a Remote Host

1. Open **Settings** (`Cmd+,` / `Ctrl+,`)
2. Scroll to the **SSH Remote Hosts** section under Remote Execution
3. Click **Add SSH Remote**
4. Configure the connection:

| Field | Description |
|-------|-------------|
| **Name** | Display name for this remote (e.g., "Dev Server", "GPU Box") |
| **Host** | Hostname or IP address |
| **Port** | SSH port (default: 22) |
| **Username** | SSH username for authentication |
| **Private Key Path** | Path to your SSH private key (e.g., `~/.ssh/id_rsa`) |
| **Remote Working Directory** | Optional default working directory on the remote host |
| **Environment Variables** | Optional key-value pairs to set on the remote |
| **Enabled** | Toggle to temporarily disable without deleting |

5. Click **Test Connection** to verify connectivity
6. Click **Save** to store the configuration

### Connection Testing

Before saving, you can test your SSH configuration:

- **Basic test**: Verifies SSH connectivity and authentication
- **Agent test**: Checks if the AI agent command is available on the remote host

A successful test shows the remote hostname. Failed tests display specific error messages to help diagnose issues.

### Setting a Global Default

Click the checkmark icon next to any remote to set it as the **global default**. When set:
- All agents use this remote by default
- Individual agents can override this setting
- The default badge appears next to the remote name

Click the checkmark again to clear the default and return to local execution.

## Per-Agent Configuration

Each agent can have its own SSH remote setting, overriding the global default.

### Configuring an Agent

1. Open the agent's configuration panel (gear icon in session header, or via Settings → Agents)
2. Find the **SSH Remote** dropdown
3. Select an option:

| Option | Behavior |
|--------|----------|
| **Use Global Default** | Follows the global setting (shows which remote if one is set) |
| **Force Local Execution** | Always runs locally, ignoring any global default |
| **[Specific Remote]** | Always uses this remote, regardless of global setting |

### Resolution Order

When spawning an agent, Maestro resolves which SSH remote to use:

1. **Per-agent explicit remote** → Uses that specific remote
2. **Per-agent "Force Local"** → Runs locally (ignores global)
3. **Per-agent "Use Global Default"** → Falls through to global setting
4. **Global default set** → Uses the global default remote
5. **No global default** → Runs locally

## Status Visibility

When a session is running via SSH remote:
- The session displays the remote host name in the status area
- Connection state reflects SSH connectivity
- Errors are detected and displayed with SSH-specific context

## Troubleshooting

### Authentication Errors

| Error | Solution |
|-------|----------|
| "Permission denied (publickey)" | Ensure your SSH key is added to the remote's `~/.ssh/authorized_keys` |
| "Host key verification failed" | Add the host to known_hosts: `ssh-keyscan hostname >> ~/.ssh/known_hosts` |
| "Enter passphrase for key" | Use a key without a passphrase, or add it to ssh-agent: `ssh-add ~/.ssh/your_key` |

### Connection Errors

| Error | Solution |
|-------|----------|
| "Connection refused" | Verify SSH server is running on the remote host |
| "Connection timed out" | Check network connectivity and firewall rules |
| "Could not resolve hostname" | Verify the hostname/IP is correct |
| "No route to host" | Check network path to the remote host |

### Agent Errors

| Error | Solution |
|-------|----------|
| "Command not found" | Install the AI agent on the remote host |
| "Agent binary not found" | Ensure the agent is in the remote's PATH |

### Tips

- **Use SSH config**: Add hosts to `~/.ssh/config` for simpler configuration
- **Key management**: Use `ssh-agent` to avoid passphrase prompts
- **Keep-alive**: Configure `ServerAliveInterval` in SSH config for long sessions
- **Test manually first**: Verify `ssh user@host 'claude --version'` works before configuring in Maestro

## Security Considerations

- SSH keys should have appropriate permissions (`chmod 600`)
- Use dedicated keys for Maestro if desired
- Remote working directories should have appropriate access controls
- Environment variables may contain sensitive data; they're passed via SSH command line

## Limitations

- PTY (pseudo-terminal) features are not available over SSH
- Some interactive agent features may behave differently
- Network latency affects perceived responsiveness
- The remote host must have the agent CLI installed and configured
