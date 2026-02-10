/**
 * Tests for agentStore - Agent lifecycle orchestration store
 *
 * Tests agent detection caching, error recovery actions, and agent lifecycle
 * (kill, interrupt). The store orchestrates sessionStore mutations + IPC calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
	useAgentStore,
	selectAvailableAgents,
	selectAgentsDetected,
	getAgentState,
	getAgentActions,
} from '../../../renderer/stores/agentStore';
import { useSessionStore } from '../../../renderer/stores/sessionStore';
import type { Session, AgentConfig } from '../../../renderer/types';

// ============================================================================
// Helpers
// ============================================================================

function createMockSession(overrides: Partial<Session> = {}): Session {
	const defaultTab = {
		id: 'default-tab',
		agentSessionId: null,
		name: null,
		starred: false,
		logs: [],
		inputValue: '',
		stagedImages: [],
		createdAt: Date.now(),
		state: 'idle' as const,
	};
	return {
		id: overrides.id ?? `session-${Math.random().toString(36).slice(2, 8)}`,
		name: overrides.name ?? 'Test Session',
		toolType: overrides.toolType ?? 'claude-code',
		state: overrides.state ?? 'idle',
		cwd: '/test',
		fullPath: '/test',
		projectRoot: '/test',
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: overrides.inputMode ?? 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 0,
		isLive: false,
		changedFiles: [],
		isGitRepo: false,
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		executionQueue: [],
		activeTimeMs: 0,
		aiTabs: overrides.aiTabs ?? [defaultTab],
		activeTabId: overrides.activeTabId ?? defaultTab.id,
		closedTabHistory: [],
		filePreviewTabs: [],
		activeFileTabId: null,
		unifiedTabOrder: [{ type: 'ai' as const, id: defaultTab.id }],
		unifiedClosedTabHistory: [],
		...overrides,
	} as Session;
}

function createMockAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
	return {
		id: overrides.id ?? 'claude-code',
		name: overrides.name ?? 'Claude Code',
		available: overrides.available ?? true,
		command: overrides.command ?? 'claude',
		...overrides,
	} as AgentConfig;
}

// ============================================================================
// Setup
// ============================================================================

// Mock window.maestro (add to existing window, don't replace it)
const mockSpawn = vi.fn().mockResolvedValue({ pid: 123, success: true });
const mockKill = vi.fn().mockResolvedValue(true);
const mockInterrupt = vi.fn().mockResolvedValue(true);
const mockDetect = vi.fn().mockResolvedValue([]);
const mockClearError = vi.fn().mockResolvedValue(undefined);

(window as any).maestro = {
	process: {
		spawn: mockSpawn,
		kill: mockKill,
		interrupt: mockInterrupt,
	},
	agents: {
		detect: mockDetect,
	},
	agentError: {
		clearError: mockClearError,
	},
};

function resetStores() {
	useAgentStore.setState({
		availableAgents: [],
		agentsDetected: false,
	});
	useSessionStore.setState({
		sessions: [],
		groups: [],
		activeSessionId: '',
		sessionsLoaded: false,
		initialLoadComplete: false,
		removedWorktreePaths: new Set(),
		cyclePosition: -1,
	});
}

beforeEach(() => {
	resetStores();
	vi.clearAllMocks();
});

// ============================================================================
// Tests
// ============================================================================

describe('agentStore', () => {
	describe('initial state', () => {
		it('has empty available agents and agentsDetected false', () => {
			const state = useAgentStore.getState();
			expect(state.availableAgents).toEqual([]);
			expect(state.agentsDetected).toBe(false);
		});
	});

	describe('agent detection cache', () => {
		it('refreshAgents populates availableAgents from IPC', async () => {
			const agents = [
				createMockAgentConfig({ id: 'claude-code', name: 'Claude Code' }),
				createMockAgentConfig({ id: 'codex', name: 'Codex' }),
			];
			mockDetect.mockResolvedValueOnce(agents);

			await useAgentStore.getState().refreshAgents();

			expect(mockDetect).toHaveBeenCalledWith(undefined);
			expect(useAgentStore.getState().availableAgents).toEqual(agents);
			expect(useAgentStore.getState().agentsDetected).toBe(true);
		});

		it('refreshAgents passes sshRemoteId to IPC', async () => {
			mockDetect.mockResolvedValueOnce([]);

			await useAgentStore.getState().refreshAgents('remote-1');

			expect(mockDetect).toHaveBeenCalledWith('remote-1');
		});

		it('getAgentConfig returns cached agent by ID', async () => {
			const agents = [
				createMockAgentConfig({ id: 'claude-code' }),
				createMockAgentConfig({ id: 'codex' }),
			];
			useAgentStore.setState({ availableAgents: agents, agentsDetected: true });

			expect(useAgentStore.getState().getAgentConfig('claude-code')?.id).toBe('claude-code');
			expect(useAgentStore.getState().getAgentConfig('codex')?.id).toBe('codex');
		});

		it('getAgentConfig returns undefined for unknown agent', () => {
			expect(useAgentStore.getState().getAgentConfig('nonexistent')).toBeUndefined();
		});
	});

	describe('clearAgentError', () => {
		it('clears session-level error fields and sets state to idle', () => {
			const session = createMockSession({
				id: 'session-1',
				state: 'error',
				agentError: { type: 'agent_crashed', message: 'crash' } as any,
				agentErrorTabId: 'tab-1',
				agentErrorPaused: true,
			});

			useSessionStore.getState().setSessions([session]);

			useAgentStore.getState().clearAgentError('session-1');

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.state).toBe('idle');
			expect(updated.agentError).toBeUndefined();
			expect(updated.agentErrorTabId).toBeUndefined();
			expect(updated.agentErrorPaused).toBe(false);
		});

		it('clears tab-level agentError when tabId is provided', () => {
			const session = createMockSession({
				id: 'session-1',
				state: 'error',
				aiTabs: [
					{
						id: 'tab-1',
						agentSessionId: null,
						name: null,
						starred: false,
						logs: [],
						inputValue: '',
						stagedImages: [],
						createdAt: Date.now(),
						state: 'idle',
						agentError: { type: 'auth_expired', message: 'expired' } as any,
					},
				],
				activeTabId: 'tab-1',
			});

			useSessionStore.getState().setSessions([session]);

			useAgentStore.getState().clearAgentError('session-1', 'tab-1');

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.aiTabs[0].agentError).toBeUndefined();
		});

		it('uses agentErrorTabId as default when tabId not provided', () => {
			const session = createMockSession({
				id: 'session-1',
				state: 'error',
				agentErrorTabId: 'tab-1',
				aiTabs: [
					{
						id: 'tab-1',
						agentSessionId: null,
						name: null,
						starred: false,
						logs: [],
						inputValue: '',
						stagedImages: [],
						createdAt: Date.now(),
						state: 'idle',
						agentError: { type: 'network_error', message: 'timeout' } as any,
					},
				],
				activeTabId: 'tab-1',
			});

			useSessionStore.getState().setSessions([session]);

			// No tabId arg — should use session's agentErrorTabId
			useAgentStore.getState().clearAgentError('session-1');

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.aiTabs[0].agentError).toBeUndefined();
		});

		it('calls window.maestro.agentError.clearError IPC', () => {
			const session = createMockSession({ id: 'session-1', state: 'error' });
			useSessionStore.getState().setSessions([session]);

			useAgentStore.getState().clearAgentError('session-1');

			expect(mockClearError).toHaveBeenCalledWith('session-1');
		});

		it('does not affect other sessions', () => {
			const session1 = createMockSession({ id: 'session-1', state: 'error' });
			const session2 = createMockSession({ id: 'session-2', state: 'busy' });

			useSessionStore.getState().setSessions([session1, session2]);

			useAgentStore.getState().clearAgentError('session-1');

			const sessions = useSessionStore.getState().sessions;
			expect(sessions[0].state).toBe('idle');
			expect(sessions[1].state).toBe('busy'); // Unchanged
		});
	});

	describe('startNewSessionAfterError', () => {
		it('clears error and creates a new tab', () => {
			const session = createMockSession({
				id: 'session-1',
				state: 'error',
				agentError: { type: 'agent_crashed', message: 'crash' } as any,
			});

			useSessionStore.getState().setSessions([session]);

			useAgentStore.getState().startNewSessionAfterError('session-1');

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.state).toBe('idle');
			expect(updated.agentError).toBeUndefined();
			// A new tab should have been created
			expect(updated.aiTabs.length).toBeGreaterThanOrEqual(2);
		});

		it('passes options to createTab', () => {
			const session = createMockSession({
				id: 'session-1',
				state: 'error',
			});

			useSessionStore.getState().setSessions([session]);

			useAgentStore.getState().startNewSessionAfterError('session-1', {
				saveToHistory: true,
				showThinking: 'on',
			});

			const updated = useSessionStore.getState().sessions[0];
			// The new tab should have the options applied
			const newTab = updated.aiTabs[updated.aiTabs.length - 1];
			expect(newTab.saveToHistory).toBe(true);
			expect(newTab.showThinking).toBe('on');
		});

		it('does nothing if session not found', () => {
			useAgentStore.getState().startNewSessionAfterError('nonexistent');
			// No crash
			expect(mockClearError).not.toHaveBeenCalled();
		});
	});

	describe('retryAfterError', () => {
		it('clears error state (delegates to clearAgentError)', () => {
			const session = createMockSession({
				id: 'session-1',
				state: 'error',
				agentError: { type: 'rate_limited', message: 'rate limit' } as any,
			});

			useSessionStore.getState().setSessions([session]);

			useAgentStore.getState().retryAfterError('session-1');

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.state).toBe('idle');
			expect(updated.agentError).toBeUndefined();
		});
	});

	describe('restartAgentAfterError', () => {
		it('clears error and kills the AI process', async () => {
			const session = createMockSession({
				id: 'session-1',
				state: 'error',
				agentError: { type: 'agent_crashed', message: 'crash' } as any,
			});

			useSessionStore.getState().setSessions([session]);

			await useAgentStore.getState().restartAgentAfterError('session-1');

			// Error cleared
			const updated = useSessionStore.getState().sessions[0];
			expect(updated.state).toBe('idle');
			expect(updated.agentError).toBeUndefined();

			// Process killed
			expect(mockKill).toHaveBeenCalledWith('session-1-ai');
		});

		it('does nothing if session not found', async () => {
			await useAgentStore.getState().restartAgentAfterError('nonexistent');
			expect(mockKill).not.toHaveBeenCalled();
		});

		it('handles kill failure gracefully', async () => {
			mockKill.mockRejectedValueOnce(new Error('Process not found'));

			const session = createMockSession({
				id: 'session-1',
				state: 'error',
			});

			useSessionStore.getState().setSessions([session]);

			// Should not throw
			await useAgentStore.getState().restartAgentAfterError('session-1');

			// Error still cleared
			const updated = useSessionStore.getState().sessions[0];
			expect(updated.state).toBe('idle');
		});
	});

	describe('authenticateAfterError', () => {
		it('clears error, sets active session, and switches to terminal mode', () => {
			const session = createMockSession({
				id: 'session-1',
				state: 'error',
				inputMode: 'ai',
				agentError: { type: 'auth_expired', message: 'auth expired' } as any,
			});

			useSessionStore.getState().setSessions([session]);

			useAgentStore.getState().authenticateAfterError('session-1');

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.state).toBe('idle');
			expect(updated.inputMode).toBe('terminal');
			expect(updated.agentError).toBeUndefined();
			expect(useSessionStore.getState().activeSessionId).toBe('session-1');
		});

		it('does nothing if session not found', () => {
			useAgentStore.getState().authenticateAfterError('nonexistent');
			// No crash, no IPC calls
			expect(mockClearError).not.toHaveBeenCalled();
		});
	});

	describe('killAgent', () => {
		it('kills agent with default -ai suffix', async () => {
			await useAgentStore.getState().killAgent('session-1');
			expect(mockKill).toHaveBeenCalledWith('session-1-ai');
		});

		it('kills agent with custom suffix', async () => {
			await useAgentStore.getState().killAgent('session-1', 'terminal');
			expect(mockKill).toHaveBeenCalledWith('session-1-terminal');
		});

		it('handles kill failure gracefully', async () => {
			mockKill.mockRejectedValueOnce(new Error('Process not found'));

			// Should not throw
			await useAgentStore.getState().killAgent('session-1');
		});
	});

	describe('interruptAgent', () => {
		it('sends interrupt signal via IPC', async () => {
			await useAgentStore.getState().interruptAgent('session-1');
			expect(mockInterrupt).toHaveBeenCalledWith('session-1');
		});

		it('handles interrupt failure gracefully', async () => {
			mockInterrupt.mockRejectedValueOnce(new Error('Process not found'));

			// Should not throw
			await useAgentStore.getState().interruptAgent('session-1');
		});
	});

	describe('selectors', () => {
		it('selectAvailableAgents returns the agents list', () => {
			const agents = [createMockAgentConfig({ id: 'claude-code' })];
			useAgentStore.setState({ availableAgents: agents });

			expect(selectAvailableAgents(useAgentStore.getState())).toEqual(agents);
		});

		it('selectAgentsDetected returns detection status', () => {
			expect(selectAgentsDetected(useAgentStore.getState())).toBe(false);

			useAgentStore.setState({ agentsDetected: true });

			expect(selectAgentsDetected(useAgentStore.getState())).toBe(true);
		});
	});

	describe('non-React access', () => {
		it('getAgentState returns current snapshot', () => {
			const agents = [createMockAgentConfig()];
			useAgentStore.setState({ availableAgents: agents, agentsDetected: true });

			const state = getAgentState();
			expect(state.availableAgents).toEqual(agents);
			expect(state.agentsDetected).toBe(true);
		});

		it('getAgentActions returns all action functions', () => {
			const actions = getAgentActions();

			expect(typeof actions.refreshAgents).toBe('function');
			expect(typeof actions.getAgentConfig).toBe('function');
			expect(typeof actions.clearAgentError).toBe('function');
			expect(typeof actions.startNewSessionAfterError).toBe('function');
			expect(typeof actions.retryAfterError).toBe('function');
			expect(typeof actions.restartAgentAfterError).toBe('function');
			expect(typeof actions.authenticateAfterError).toBe('function');
			expect(typeof actions.killAgent).toBe('function');
			expect(typeof actions.interruptAgent).toBe('function');
		});
	});

	describe('React hook integration', () => {
		it('useAgentStore with selector re-renders on agent detection', async () => {
			const { result } = renderHook(() => useAgentStore(selectAgentsDetected));

			expect(result.current).toBe(false);

			const agents = [createMockAgentConfig()];
			mockDetect.mockResolvedValueOnce(agents);

			await act(async () => {
				await useAgentStore.getState().refreshAgents();
			});

			expect(result.current).toBe(true);
		});

		it('useAgentStore with availableAgents selector updates on refresh', async () => {
			const { result } = renderHook(() => useAgentStore(selectAvailableAgents));

			expect(result.current).toEqual([]);

			const agents = [createMockAgentConfig({ id: 'claude-code' })];
			mockDetect.mockResolvedValueOnce(agents);

			await act(async () => {
				await useAgentStore.getState().refreshAgents();
			});

			expect(result.current).toHaveLength(1);
			expect(result.current[0].id).toBe('claude-code');
		});
	});

	describe('action stability', () => {
		it('action references are stable across state changes', () => {
			const before = useAgentStore.getState();

			// Mutate state
			useAgentStore.setState({ agentsDetected: true });

			const after = useAgentStore.getState();

			expect(before.clearAgentError).toBe(after.clearAgentError);
			expect(before.refreshAgents).toBe(after.refreshAgents);
			expect(before.killAgent).toBe(after.killAgent);
			expect(before.interruptAgent).toBe(after.interruptAgent);
		});
	});

	describe('complex scenarios', () => {
		it('error recovery across multiple sessions only affects target', () => {
			const sessions = [
				createMockSession({
					id: 'session-1',
					state: 'error',
					agentError: { type: 'agent_crashed', message: 'crash' } as any,
				}),
				createMockSession({
					id: 'session-2',
					state: 'error',
					agentError: { type: 'auth_expired', message: 'auth' } as any,
				}),
				createMockSession({ id: 'session-3', state: 'busy' }),
			];

			useSessionStore.getState().setSessions(sessions);

			useAgentStore.getState().clearAgentError('session-1');

			const updated = useSessionStore.getState().sessions;
			expect(updated[0].state).toBe('idle');
			expect(updated[0].agentError).toBeUndefined();
			expect(updated[1].state).toBe('error'); // Untouched
			expect(updated[1].agentError).toBeDefined();
			expect(updated[2].state).toBe('busy'); // Untouched
		});

		it('sequential error recovery: clear then start new session', () => {
			const session = createMockSession({
				id: 'session-1',
				state: 'error',
				agentError: { type: 'agent_crashed', message: 'crash' } as any,
			});

			useSessionStore.getState().setSessions([session]);

			// First clear, then start new session (simulates user flow)
			useAgentStore.getState().startNewSessionAfterError('session-1');

			const updated = useSessionStore.getState().sessions[0];
			expect(updated.state).toBe('idle');
			expect(updated.aiTabs.length).toBeGreaterThanOrEqual(2);
		});

		it('authenticate switches active session to target', () => {
			const sessions = [
				createMockSession({ id: 'session-1', state: 'idle' }),
				createMockSession({
					id: 'session-2',
					state: 'error',
					agentError: { type: 'auth_expired', message: 'auth' } as any,
				}),
			];

			useSessionStore.getState().setSessions(sessions);
			useSessionStore.getState().setActiveSessionId('session-1');

			useAgentStore.getState().authenticateAfterError('session-2');

			// Active session switched to session-2
			expect(useSessionStore.getState().activeSessionId).toBe('session-2');
			// session-2 is now in terminal mode
			expect(useSessionStore.getState().sessions[1].inputMode).toBe('terminal');
		});
	});
});
