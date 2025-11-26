// Type definitions for Maestro renderer

export type ToolType = 'claude' | 'aider' | 'opencode' | 'terminal';
export type SessionState = 'idle' | 'busy' | 'waiting_input' | 'connecting' | 'error';
export type FileChangeType = 'modified' | 'added' | 'deleted';
export type RightPanelTab = 'files' | 'history' | 'scratchpad';
export type ScratchPadMode = 'raw' | 'preview' | 'wysiwyg';
export type ThemeId = 'dracula' | 'monokai' | 'github-light' | 'solarized-light' | 'nord' | 'tokyo-night' | 'one-light' | 'gruvbox-light' | 'catppuccin-mocha' | 'gruvbox-dark' | 'catppuccin-latte' | 'ayu-light';
export type FocusArea = 'sidebar' | 'main' | 'right';
export type LLMProvider = 'openrouter' | 'anthropic' | 'ollama';

export interface Theme {
  id: ThemeId;
  name: string;
  mode: 'light' | 'dark';
  colors: {
    bgMain: string;
    bgSidebar: string;
    bgActivity: string;
    border: string;
    textMain: string;
    textDim: string;
    accent: string;
    accentDim: string;
    accentText: string;
    success: string;
    warning: string;
    error: string;
  };
}

export interface Shortcut {
  id: string;
  label: string;
  keys: string[];
}

export interface FileArtifact {
  path: string;
  type: FileChangeType;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  source: 'stdout' | 'stderr' | 'system' | 'user';
  text: string;
  interactive?: boolean;
  options?: string[];
  images?: string[];
}

export interface WorkLogItem {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  relatedFiles?: number;
}

// History entry types for the History panel
export type HistoryEntryType = 'AUTO' | 'USER';

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  timestamp: number;
  summary: string;
  fullResponse?: string; // Complete agent response for expansion
  claudeSessionId?: string; // For clicking to jump to session
  projectPath: string; // For per-project filtering
  sessionId?: string; // Maestro session ID for isolation (interactive sessions exclude batch entries)
}

// Batch processing state
export interface BatchRunState {
  isRunning: boolean;
  isStopping: boolean; // Waiting for current task to finish before stopping
  totalTasks: number;
  completedTasks: number;
  currentTaskIndex: number;
  scratchpadPath?: string; // Path to temp file
  originalContent: string; // Original scratchpad content for sync back
  customPrompt?: string; // User's custom prompt if modified
  sessionIds: string[]; // Claude session IDs from each iteration
}

// Usage statistics from Claude Code CLI
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalCostUsd: number;
  contextWindow: number; // e.g., 200000 for Claude
}

export interface Session {
  id: string;
  groupId?: string;
  name: string;
  toolType: ToolType;
  state: SessionState;
  cwd: string;
  fullPath: string;
  aiLogs: LogEntry[];
  shellLogs: LogEntry[];
  workLog: WorkLogItem[];
  scratchPadContent: string;
  contextUsage: number;
  // Usage statistics from AI responses
  usageStats?: UsageStats;
  inputMode: 'terminal' | 'ai';
  // Dual-process PIDs: each session has both AI and terminal processes
  aiPid: number;
  terminalPid: number;
  port: number;
  tunnelActive: boolean;
  tunnelUrl?: string;
  changedFiles: FileArtifact[];
  isGitRepo: boolean;
  // File Explorer per-session state
  fileTree: any[];
  fileExplorerExpanded: string[];
  fileExplorerScrollPos: number;
  fileTreeError?: string;
  // Shell state tracking
  shellCwd?: string;
  // Command history (separate for each mode)
  aiCommandHistory?: string[];
  shellCommandHistory?: string[];
  // Scratchpad state tracking
  scratchPadCursorPosition?: number;
  scratchPadEditScrollPos?: number;
  scratchPadPreviewScrollPos?: number;
  scratchPadMode?: 'edit' | 'preview';
  // Claude Code session ID for conversation continuity
  claudeSessionId?: string;
  // Pending jump path for /jump command (relative path within file tree)
  pendingJumpPath?: string;
  // Custom status message for the thinking indicator (e.g., "Agent is synopsizing...")
  statusMessage?: string;
  // Timestamp when agent started processing (for elapsed time display)
  thinkingStartTime?: number;
  // Message queue for AI mode - messages sent while busy are queued here
  messageQueue: LogEntry[];
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  collapsed: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  available: boolean;
  path?: string;
}

// Process spawning configuration
export interface ProcessConfig {
  sessionId: string;
  toolType: string;
  cwd: string;
  command: string;
  args: string[];
  prompt?: string; // For batch mode agents like Claude (passed as CLI argument)
  shell?: string; // Shell to use for terminal sessions (e.g., 'zsh', 'bash', 'fish')
}

// Directory entry from fs:readDir
export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

// Shell information from shells:detect
export interface ShellInfo {
  id: string;
  name: string;
  available: boolean;
  path?: string;
}
