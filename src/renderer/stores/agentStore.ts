/**
 * agentStore - Zustand store for agent lifecycle orchestration
 *
 * This store follows the tabStore pattern: it does NOT own session-level agent
 * state (state, busySource, agentError, etc. — those stay in sessionStore).
 * Instead it provides orchestration actions that compose sessionStore mutations
 * with IPC calls for agent lifecycle management.
 *
 * Responsibilities:
 * 1. Agent detection cache — avoid repeated IPC calls for agent configs
 * 2. Error recovery actions — clearError, restart, retry, newSession, authenticate
 * 3. Agent lifecycle actions — kill, interrupt
 *
 * Can be used outside React via useAgentStore.getState() / getAgentActions().
 */

import { create } from 'zustand';
import type { Session, SessionState, AgentConfig } from '../types';
import { createTab } from '../utils/tabHelpers';
import { useSessionStore } from './sessionStore';

// ============================================================================
// Store Types
// ============================================================================

export interface AgentStoreState {
	/** Cached agent detection results from main process */
	availableAgents: AgentConfig[];
	/** Whether agent detection has completed at least once */
	agentsDetected: boolean;
}

export interface AgentStoreActions {
	// === Agent Detection Cache ===

	/** Detect available agents and cache the results */
	refreshAgents: (sshRemoteId?: string) => Promise<void>;

	/** Look up a cached agent config by ID */
	getAgentConfig: (agentId: string) => AgentConfig | undefined;

	// === Error Recovery (extracted from App.tsx) ===

	/**
	 * Clear agent error state on a session and optionally a specific tab.
	 * Resets session to idle, clears error fields, notifies main process.
	 */
	clearAgentError: (sessionId: string, tabId?: string) => void;

	/**
	 * Start a new tab in the session after an error (recovery action).
	 * Clears error and creates a fresh AI tab.
	 */
	startNewSessionAfterError: (
		sessionId: string,
		options?: { saveToHistory?: boolean; showThinking?: 'off' | 'on' | 'sticky' }
	) => void;

	/**
	 * Clear error and let user retry manually (recovery action).
	 */
	retryAfterError: (sessionId: string) => void;

	/**
	 * Kill the agent process and clear error (recovery action for crashes).
	 * Agent will be respawned when user sends next message.
	 */
	restartAgentAfterError: (sessionId: string) => Promise<void>;

	/**
	 * Clear error and switch to terminal mode for re-authentication.
	 */
	authenticateAfterError: (sessionId: string) => void;

	// === Agent Lifecycle ===

	/** Kill an agent process by session ID and optional suffix */
	killAgent: (sessionId: string, suffix?: string) => Promise<void>;

	/** Send interrupt (CTRL+C) to an agent process */
	interruptAgent: (sessionId: string) => Promise<void>;
}

export type AgentStore = AgentStoreState & AgentStoreActions;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find a session by ID from sessionStore.
 */
function getSession(sessionId: string): Session | undefined {
	return useSessionStore.getState().sessions.find((s) => s.id === sessionId);
}

/**
 * Update a specific session in sessionStore using an updater function.
 */
function updateSession(sessionId: string, updater: (s: Session) => Session): void {
	useSessionStore
		.getState()
		.setSessions((prev) => prev.map((s) => (s.id === sessionId ? updater(s) : s)));
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useAgentStore = create<AgentStore>()((set, get) => ({
	// --- State ---
	availableAgents: [],
	agentsDetected: false,

	// --- Actions ---

	refreshAgents: async (sshRemoteId?) => {
		const agents = await window.maestro.agents.detect(sshRemoteId);
		set({ availableAgents: agents, agentsDetected: true });
	},

	getAgentConfig: (agentId) => {
		return get().availableAgents.find((a) => a.id === agentId);
	},

	clearAgentError: (sessionId, tabId?) => {
		updateSession(sessionId, (s) => {
			const targetTabId = tabId ?? s.agentErrorTabId;
			const updatedAiTabs = targetTabId
				? s.aiTabs.map((tab) => (tab.id === targetTabId ? { ...tab, agentError: undefined } : tab))
				: s.aiTabs;
			return {
				...s,
				agentError: undefined,
				agentErrorTabId: undefined,
				agentErrorPaused: false,
				state: 'idle' as SessionState,
				aiTabs: updatedAiTabs,
			};
		});
		// Close the agent error modal if open
		window.maestro.agentError.clearError(sessionId).catch((err) => {
			console.error('Failed to clear agent error:', err);
		});
	},

	startNewSessionAfterError: (sessionId, options?) => {
		const session = getSession(sessionId);
		if (!session) return;

		// Clear the error state
		get().clearAgentError(sessionId);

		// Create a new tab in the session
		updateSession(sessionId, (s) => {
			const result = createTab(s, {
				saveToHistory: options?.saveToHistory,
				showThinking: options?.showThinking,
			});
			if (!result) return s;
			return result.session;
		});
	},

	retryAfterError: (sessionId) => {
		get().clearAgentError(sessionId);
	},

	restartAgentAfterError: async (sessionId) => {
		const session = getSession(sessionId);
		if (!session) return;

		// Clear the error state
		get().clearAgentError(sessionId);

		// Kill any existing AI process
		try {
			await window.maestro.process.kill(`${sessionId}-ai`);
		} catch {
			// Process may not exist
		}
	},

	authenticateAfterError: (sessionId) => {
		const session = getSession(sessionId);
		if (!session) return;

		get().clearAgentError(sessionId);

		// Switch to terminal mode for re-auth
		useSessionStore.getState().setActiveSessionId(sessionId);
		updateSession(sessionId, (s) => ({ ...s, inputMode: 'terminal' }));
	},

	killAgent: async (sessionId, suffix?) => {
		const target = suffix ? `${sessionId}-${suffix}` : `${sessionId}-ai`;
		try {
			await window.maestro.process.kill(target);
		} catch {
			// Process may not exist
		}
	},

	interruptAgent: async (sessionId) => {
		try {
			await window.maestro.process.interrupt(sessionId);
		} catch {
			// Process may not exist
		}
	},
}));

// ============================================================================
// Selectors
// ============================================================================

/** Select the list of available (detected) agents */
export const selectAvailableAgents = (state: AgentStore): AgentConfig[] => state.availableAgents;

/** Select whether agent detection has completed */
export const selectAgentsDetected = (state: AgentStore): boolean => state.agentsDetected;

// ============================================================================
// Non-React Access
// ============================================================================

/**
 * Get the current agent store state snapshot.
 * Use outside React (services, orchestrators, IPC handlers).
 */
export function getAgentState() {
	return useAgentStore.getState();
}

/**
 * Get stable agent action references outside React.
 */
export function getAgentActions() {
	const state = useAgentStore.getState();
	return {
		refreshAgents: state.refreshAgents,
		getAgentConfig: state.getAgentConfig,
		clearAgentError: state.clearAgentError,
		startNewSessionAfterError: state.startNewSessionAfterError,
		retryAfterError: state.retryAfterError,
		restartAgentAfterError: state.restartAgentAfterError,
		authenticateAfterError: state.authenticateAfterError,
		killAgent: state.killAgent,
		interruptAgent: state.interruptAgent,
	};
}
