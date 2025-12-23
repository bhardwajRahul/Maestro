/**
 * SendToAgentModal - Modal for sending session context to another agent
 *
 * Allows users to transfer context from the current session/tab to a different
 * AI agent (e.g., from Claude Code to Gemini CLI). The context is groomed to
 * remove agent-specific artifacts before transfer.
 *
 * Features:
 * - Agent selection grid with availability status
 * - Fuzzy search for agent names
 * - Real-time token estimation
 * - Option for AI-powered context grooming
 * - Keyboard navigation with arrow keys, Enter, Escape
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, ArrowRight, Check, X, AlertCircle, Loader2 } from 'lucide-react';
import type { Theme, Session, AITab, ToolType, AgentConfig } from '../types';
import type { MergeResult } from '../types/contextMerge';
import { fuzzyMatchWithScore } from '../utils/search';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { formatTokensCompact } from '../utils/formatters';

/**
 * Agent availability status for display in the selection grid
 */
export type AgentStatus = 'ready' | 'busy' | 'unavailable' | 'current';

/**
 * Available agent with status information for the selection grid
 */
export interface AvailableAgent {
  id: ToolType;
  name: string;
  status: AgentStatus;
  activeSessions: number;
  available: boolean;
}

/**
 * Send options that can be configured by the user
 */
export interface SendToAgentOptions {
  /** Use AI to groom/deduplicate context before sending */
  groomContext: boolean;
  /** Create a new session for the target agent */
  createNewSession: boolean;
}

export interface SendToAgentModalProps {
  theme: Theme;
  isOpen: boolean;
  /** The session containing the source context */
  sourceSession: Session;
  /** The specific tab ID within the source session */
  sourceTabId: string;
  /** Available agent configurations from agent detector */
  availableAgents: AgentConfig[];
  /** All sessions for determining agent busy status */
  allSessions?: Session[];
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when send is initiated */
  onSend: (
    targetAgentId: ToolType,
    options: SendToAgentOptions
  ) => Promise<MergeResult>;
}

/**
 * Get display icon for an agent
 */
function getAgentIcon(agentId: string): string {
  switch (agentId) {
    case 'claude-code':
    case 'claude':
      return '🤖';
    case 'codex':
      return '◇';
    case 'gemini-cli':
      return '🔷';
    case 'qwen3-coder':
      return '⬡';
    case 'opencode':
      return '📟';
    case 'aider':
      return '🛠️';
    default:
      return '🔧';
  }
}

/**
 * Get status label for an agent
 */
function getStatusLabel(status: AgentStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'busy':
      return 'Busy';
    case 'unavailable':
      return 'N/A';
    case 'current':
      return 'Current';
    default:
      return '';
  }
}

/**
 * Estimate token count from log entries
 * Uses a simple heuristic: ~4 characters per token (average for English text)
 */
function estimateTokens(logs: { text: string }[]): number {
  const totalChars = logs.reduce((sum, log) => sum + (log.text?.length || 0), 0);
  return Math.round(totalChars / 4);
}

/**
 * Get display name for a tab
 */
function getTabDisplayName(tab: AITab): string {
  if (tab.name) return tab.name;
  if (tab.agentSessionId) {
    return tab.agentSessionId.split('-')[0].toUpperCase();
  }
  return 'New Tab';
}

/**
 * SendToAgentModal Component
 */
export function SendToAgentModal({
  theme,
  isOpen,
  sourceSession,
  sourceTabId,
  availableAgents,
  allSessions = [],
  onClose,
  onSend,
}: SendToAgentModalProps) {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Selected target agent
  const [selectedAgentId, setSelectedAgentId] = useState<ToolType | null>(null);

  // Keyboard navigation index
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Send options
  const [options, setOptions] = useState<SendToAgentOptions>({
    groomContext: true,
    createNewSession: true,
  });

  // Sending state
  const [isSending, setIsSending] = useState(false);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const layerIdRef = useRef<string>();
  const onCloseRef = useRef(onClose);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  // Keep onClose ref up to date
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();

  // Register layer on mount
  useEffect(() => {
    if (!isOpen) return;

    layerIdRef.current = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.SEND_TO_AGENT,
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'strict',
      ariaLabel: 'Send Context to Agent',
      onEscape: () => onCloseRef.current()
    });

    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
      }
    };
  }, [isOpen, registerLayer, unregisterLayer]);

  // Update handler when onClose changes
  useEffect(() => {
    if (layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, () => onCloseRef.current());
    }
  }, [updateLayerHandler]);

  // Focus input on mount
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedAgentId(null);
      setSelectedIndex(0);
      setIsSending(false);
    }
  }, [isOpen]);

  // Get source tab info
  const sourceTab = useMemo(() => {
    return sourceSession.aiTabs.find(t => t.id === sourceTabId);
  }, [sourceSession, sourceTabId]);

  const sourceTokens = useMemo(() => {
    if (!sourceTab) return 0;
    return estimateTokens(sourceTab.logs);
  }, [sourceTab]);

  // Calculate session counts per agent
  const sessionCountsByAgent = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const session of allSessions) {
      const toolType = session.toolType;
      counts[toolType] = (counts[toolType] || 0) + 1;
    }
    return counts;
  }, [allSessions]);

  // Calculate busy agents (those with sessions in busy state)
  const busyAgents = useMemo(() => {
    const busy = new Set<string>();
    for (const session of allSessions) {
      if (session.state === 'busy') {
        busy.add(session.toolType);
      }
    }
    return busy;
  }, [allSessions]);

  // Build list of agents with status
  const agents = useMemo((): AvailableAgent[] => {
    return availableAgents
      .filter(agent => !agent.hidden)
      .map(agent => {
        let status: AgentStatus;

        if (agent.id === sourceSession.toolType) {
          status = 'current';
        } else if (!agent.available) {
          status = 'unavailable';
        } else if (busyAgents.has(agent.id)) {
          status = 'busy';
        } else {
          status = 'ready';
        }

        return {
          id: agent.id as ToolType,
          name: agent.name,
          status,
          activeSessions: sessionCountsByAgent[agent.id] || 0,
          available: agent.available,
        };
      });
  }, [availableAgents, sourceSession.toolType, busyAgents, sessionCountsByAgent]);

  // Filter agents based on search query
  const filteredAgents = useMemo((): AvailableAgent[] => {
    if (!searchQuery.trim()) {
      return agents;
    }

    const query = searchQuery.trim();
    return agents
      .map(agent => {
        const result = fuzzyMatchWithScore(agent.name, query);
        return { agent, score: result.score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.agent);
  }, [agents, searchQuery]);

  // Scroll selected item into view
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Handle agent selection
  const handleSelectAgent = useCallback((agentId: ToolType) => {
    const agent = agents.find(a => a.id === agentId);
    if (agent && agent.status !== 'current' && agent.status !== 'unavailable') {
      setSelectedAgentId(agentId);
    }
  }, [agents]);

  // Handle send action
  const handleSend = useCallback(async () => {
    if (!selectedAgentId) return;

    setIsSending(true);
    try {
      await onSend(selectedAgentId, options);
      onClose();
    } catch (error) {
      console.error('Send to agent failed:', error);
    } finally {
      setIsSending(false);
    }
  }, [selectedAgentId, options, onSend, onClose]);

  // Handle key down
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const selectableAgents = filteredAgents.filter(
      a => a.status !== 'current' && a.status !== 'unavailable'
    );

    // Arrow navigation in grid (3 columns)
    const cols = 3;
    const rows = Math.ceil(filteredAgents.length / cols);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => {
        const nextIndex = prev + cols;
        return nextIndex < filteredAgents.length ? nextIndex : prev;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => {
        const nextIndex = prev - cols;
        return nextIndex >= 0 ? nextIndex : prev;
      });
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSelectedIndex(prev => {
        const nextIndex = prev + 1;
        // Don't wrap to next row
        const currentRow = Math.floor(prev / cols);
        const nextRow = Math.floor(nextIndex / cols);
        if (nextRow !== currentRow || nextIndex >= filteredAgents.length) {
          return prev;
        }
        return nextIndex;
      });
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedIndex(prev => {
        const nextIndex = prev - 1;
        // Don't wrap to previous row
        const currentRow = Math.floor(prev / cols);
        const nextRow = Math.floor(nextIndex / cols);
        if (nextRow !== currentRow || nextIndex < 0) {
          return prev;
        }
        return nextIndex;
      });
      return;
    }

    // Number keys for quick selection (1-9)
    if (e.key >= '1' && e.key <= '9') {
      const index = parseInt(e.key, 10) - 1;
      if (index < filteredAgents.length) {
        const agent = filteredAgents[index];
        if (agent.status !== 'current' && agent.status !== 'unavailable') {
          handleSelectAgent(agent.id);
        }
      }
      return;
    }

    // Space to select highlighted agent
    if (e.key === ' ' && !e.shiftKey && filteredAgents[selectedIndex]) {
      e.preventDefault();
      const agent = filteredAgents[selectedIndex];
      if (agent.status !== 'current' && agent.status !== 'unavailable') {
        handleSelectAgent(agent.id);
      }
      return;
    }

    // Enter to confirm send
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (selectedAgentId) {
        handleSend();
      } else if (filteredAgents[selectedIndex]) {
        const agent = filteredAgents[selectedIndex];
        if (agent.status !== 'current' && agent.status !== 'unavailable') {
          handleSelectAgent(agent.id);
        }
      }
      return;
    }
  }, [filteredAgents, selectedIndex, selectedAgentId, handleSelectAgent, handleSend]);

  // Get selected agent details
  const selectedAgent = useMemo(() => {
    return agents.find(a => a.id === selectedAgentId);
  }, [agents, selectedAgentId]);

  // Estimate groomed tokens (rough 25-30% reduction)
  const estimatedGroomedTokens = useMemo(() => {
    if (!options.groomContext) return sourceTokens;
    return Math.round(sourceTokens * 0.73);
  }, [sourceTokens, options.groomContext]);

  // Determine if send is possible
  const canSend = useMemo(() => {
    if (isSending) return false;
    if (!selectedAgentId) return false;
    const agent = agents.find(a => a.id === selectedAgentId);
    return agent && agent.status !== 'current' && agent.status !== 'unavailable';
  }, [selectedAgentId, agents, isSending]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 modal-overlay flex items-start justify-center pt-16 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label="Send Context to Agent"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-[600px] rounded-xl shadow-2xl border outline-none flex flex-col"
        style={{
          backgroundColor: theme.colors.bgSidebar,
          borderColor: theme.colors.border,
          maxHeight: 'calc(100vh - 128px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: theme.colors.border }}
        >
          <div className="flex items-center gap-2">
            <ArrowRight className="w-5 h-5" style={{ color: theme.colors.accent }} />
            <h2
              className="text-sm font-bold"
              style={{ color: theme.colors.textMain }}
            >
              Send Context to Agent
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: theme.colors.textDim }}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Search Input */}
          <div className="p-4 pb-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: theme.colors.textDim }}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: theme.colors.bgMain,
                  borderColor: theme.colors.border,
                  color: theme.colors.textMain,
                }}
              />
            </div>
          </div>

          {/* Agent Grid */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {filteredAgents.length === 0 ? (
              <div
                className="p-4 text-center text-sm"
                style={{ color: theme.colors.textDim }}
              >
                {searchQuery ? 'No matching agents found' : 'No agents available'}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {filteredAgents.map((agent, index) => {
                  const isHighlighted = index === selectedIndex;
                  const isSelected = selectedAgentId === agent.id;
                  const isDisabled = agent.status === 'current' || agent.status === 'unavailable';

                  return (
                    <button
                      key={agent.id}
                      ref={isHighlighted ? selectedItemRef : undefined}
                      onClick={() => !isDisabled && handleSelectAgent(agent.id)}
                      disabled={isDisabled}
                      className="p-3 rounded-lg border text-center transition-all disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: isSelected
                          ? theme.colors.accent
                          : isHighlighted && !isDisabled
                            ? `${theme.colors.accent}20`
                            : theme.colors.bgMain,
                        borderColor: isSelected
                          ? theme.colors.accent
                          : isHighlighted && !isDisabled
                            ? theme.colors.accent
                            : theme.colors.border,
                        opacity: isDisabled ? 0.5 : 1,
                      }}
                    >
                      {/* Agent Icon */}
                      <div className="text-2xl mb-1">
                        {getAgentIcon(agent.id)}
                      </div>

                      {/* Agent Name */}
                      <div
                        className="text-sm font-medium truncate"
                        style={{
                          color: isSelected
                            ? theme.colors.accentForeground
                            : theme.colors.textMain,
                        }}
                      >
                        {agent.name}
                      </div>

                      {/* Status Badge */}
                      <div
                        className="text-xs mt-1 flex items-center justify-center gap-1"
                        style={{
                          color: isSelected
                            ? theme.colors.accentForeground
                            : agent.status === 'ready'
                              ? theme.colors.success
                              : agent.status === 'busy'
                                ? theme.colors.warning
                                : theme.colors.textDim,
                        }}
                      >
                        {agent.status === 'ready' && <Check className="w-3 h-3" />}
                        {agent.status === 'busy' && <Loader2 className="w-3 h-3 animate-spin" />}
                        {agent.status === 'unavailable' && <AlertCircle className="w-3 h-3" />}
                        {getStatusLabel(agent.status)}
                      </div>

                      {/* Quick Select Number */}
                      {index < 9 && !isDisabled && (
                        <div
                          className="text-[10px] mt-1 opacity-50"
                          style={{ color: isSelected ? theme.colors.accentForeground : theme.colors.textDim }}
                        >
                          Press {index + 1}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Transfer Preview & Options */}
        <div
          className="p-4 border-t space-y-3"
          style={{ borderColor: theme.colors.border }}
        >
          {/* Token Preview */}
          <div
            className="p-3 rounded-lg text-xs space-y-1"
            style={{ backgroundColor: theme.colors.bgMain }}
          >
            <div className="flex justify-between">
              <span style={{ color: theme.colors.textDim }}>
                Source: {sourceTab ? getTabDisplayName(sourceTab) : 'Unknown'} ({sourceSession.toolType})
              </span>
              <span style={{ color: theme.colors.textMain }}>
                ~{formatTokensCompact(sourceTokens)} tokens
              </span>
            </div>

            {selectedAgent && (
              <div className="flex justify-between">
                <span style={{ color: theme.colors.textDim }}>
                  Target: {selectedAgent.name}
                </span>
                <span
                  className="flex items-center gap-1"
                  style={{ color: theme.colors.textMain }}
                >
                  <ArrowRight className="w-3 h-3" />
                  New session
                </span>
              </div>
            )}

            {options.groomContext && (
              <div className="flex justify-between">
                <span style={{ color: theme.colors.success }}>
                  After grooming:
                </span>
                <span style={{ color: theme.colors.success }}>
                  ~{formatTokensCompact(estimatedGroomedTokens)} tokens (estimated)
                </span>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label
              className="flex items-center gap-2 cursor-pointer"
              style={{ color: theme.colors.textMain }}
            >
              <input
                type="checkbox"
                checked={options.groomContext}
                onChange={(e) => setOptions(prev => ({ ...prev, groomContext: e.target.checked }))}
                className="rounded"
              />
              <span className="text-xs">
                Groom context for target agent
              </span>
            </label>

            <label
              className="flex items-center gap-2 cursor-pointer"
              style={{ color: theme.colors.textMain }}
            >
              <input
                type="checkbox"
                checked={options.createNewSession}
                onChange={(e) => setOptions(prev => ({ ...prev, createNewSession: e.target.checked }))}
                className="rounded"
              />
              <span className="text-xs">
                Create new session
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t flex justify-end gap-2"
          style={{ borderColor: theme.colors.border }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded text-sm border hover:bg-white/5 transition-colors"
            style={{
              borderColor: theme.colors.border,
              color: theme.colors.textMain,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{
              backgroundColor: theme.colors.accent,
              color: theme.colors.accentForeground,
            }}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                Send to Agent
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SendToAgentModal;
