# CLAUDE-SESSION.md

Session interface and code conventions for the Maestro codebase. For the main guide, see [[CLAUDE.md]].

## Session Interface

Key fields on the Session object (abbreviated - see `src/renderer/types/index.ts` for full definition):

```typescript
interface Session {
  // Identity
  id: string;
  name: string;
  groupId?: string;             // Session grouping
  toolType: ToolType;           // 'claude-code' | 'codex' | 'opencode' | 'terminal'
  state: SessionState;          // 'idle' | 'busy' | 'error' | 'connecting'
  inputMode: 'ai' | 'terminal'; // Which process receives input
  bookmarked?: boolean;         // Pinned to top

  // Paths
  cwd: string;                  // Current working directory (can change via cd)
  projectRoot: string;          // Initial directory (never changes, used for session storage)
  fullPath: string;             // Full resolved path

  // Processes
  aiPid: number;                // AI process ID
  port: number;                 // Web server communication port

  // Multi-Tab Support
  aiTabs: AITab[];              // Multiple conversation tabs
  activeTabId: string;          // Currently active tab
  closedTabHistory: ClosedTab[]; // Undo stack for closed tabs

  // Logs (per-tab)
  shellLogs: LogEntry[];        // Terminal output history

  // Execution Queue
  executionQueue: QueuedItem[]; // Sequential execution queue

  // Usage & Stats
  usageStats?: UsageStats;      // Token usage and cost
  contextUsage: number;         // Context window usage percentage
  workLog: WorkLogItem[];       // Work tracking

  // Git Integration
  isGitRepo: boolean;           // Git features enabled
  changedFiles: FileArtifact[]; // Git change tracking
  gitBranches?: string[];       // Branch cache for completion
  gitTags?: string[];           // Tag cache for completion

  // File Explorer
  fileTree: any[];              // File tree structure
  fileExplorerExpanded: string[]; // Expanded folder paths
  fileExplorerScrollPos: number; // Scroll position

  // Web/Live Sessions
  isLive: boolean;              // Accessible via web interface
  liveUrl?: string;             // Live session URL

  // Auto Run
  autoRunFolderPath?: string;   // Auto Run document folder
  autoRunSelectedFile?: string; // Selected document
  autoRunMode?: 'edit' | 'preview'; // Current mode

  // Command History
  aiCommandHistory?: string[];  // AI input history
  shellCommandHistory?: string[]; // Terminal input history

  // Error Handling
  agentError?: AgentError;        // Current agent error (auth, tokens, rate limit, etc.)
  agentErrorPaused?: boolean;     // Input blocked while error modal shown
}

interface AITab {
  id: string;
  name: string;
  logs: LogEntry[];             // Tab-specific conversation history
  agentSessionId?: string;      // Agent session for this tab
  scrollTop?: number;
  draftInput?: string;
}
```

---

## Code Conventions

### TypeScript
- Strict mode enabled
- Interface definitions for all data structures
- Types exported via `preload.ts` for renderer

### React Components
- Functional components with hooks
- Tailwind for layout, inline styles for theme colors
- `tabIndex={-1}` + `outline-none` for programmatic focus

### Commit Messages
```
feat: new feature
fix: bug fix
docs: documentation
refactor: code refactoring
```

**IMPORTANT**: Do NOT create a `CHANGELOG.md` file. This project does not use changelogs - all change documentation goes in commit messages and PR descriptions only.
