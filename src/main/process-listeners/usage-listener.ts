/**
 * Usage statistics listener.
 * Handles usage stats from AI responses, including group chat participant/moderator updates.
 */

import type { ProcessManager } from '../process-manager';
import type { ProcessListenerDependencies } from './types';

/**
 * Sets up the usage listener for token/cost statistics.
 * Handles:
 * - Group chat participant usage updates
 * - Group chat moderator usage updates
 * - Regular process usage forwarding to renderer
 */
export function setupUsageListener(
	processManager: ProcessManager,
	deps: Pick<
		ProcessListenerDependencies,
		| 'safeSend'
		| 'outputParser'
		| 'groupChatEmitters'
		| 'groupChatStorage'
		| 'usageAggregator'
		| 'logger'
		| 'patterns'
	>
): void {
	const {
		safeSend,
		outputParser,
		groupChatEmitters,
		groupChatStorage,
		usageAggregator,
		logger,
		patterns,
	} = deps;
	const { REGEX_MODERATOR_SESSION } = patterns;

	// Handle usage statistics from AI responses
	processManager.on(
		'usage',
		(
			sessionId: string,
			usageStats: {
				inputTokens: number;
				outputTokens: number;
				cacheReadInputTokens: number;
				cacheCreationInputTokens: number;
				totalCostUsd: number;
				contextWindow: number;
				reasoningTokens?: number; // Separate reasoning tokens (Codex o3/o4-mini)
			}
		) => {
			// Handle group chat participant usage - update participant stats
			const participantUsageInfo = outputParser.parseParticipantSessionId(sessionId);
			if (participantUsageInfo) {
				const { groupChatId, participantName } = participantUsageInfo;

				// Calculate context usage percentage using agent-specific logic
				// Note: For group chat, we don't have agent type here, defaults to Claude behavior
				const totalContextTokens = usageAggregator.calculateContextTokens(usageStats);
				const contextUsage =
					usageStats.contextWindow > 0
						? Math.round((totalContextTokens / usageStats.contextWindow) * 100)
						: 0;

				// Update participant with usage stats
				groupChatStorage
					.updateParticipant(groupChatId, participantName, {
						contextUsage,
						tokenCount: totalContextTokens,
						totalCost: usageStats.totalCostUsd,
					})
					.then(async () => {
						// Emit participants changed so UI updates
						const chat = await groupChatStorage.loadGroupChat(groupChatId);
						if (chat) {
							groupChatEmitters.emitParticipantsChanged?.(groupChatId, chat.participants);
						}
					})
					.catch((err) => {
						logger.error('[GroupChat] Failed to update participant usage', 'ProcessListener', {
							error: String(err),
							participant: participantName,
						});
					});
				// Still send to renderer for consistency
			}

			// Handle group chat moderator usage - emit for UI
			const moderatorUsageMatch = sessionId.match(REGEX_MODERATOR_SESSION);
			if (moderatorUsageMatch) {
				const groupChatId = moderatorUsageMatch[1];
				// Calculate context usage percentage using agent-specific logic
				// Note: Moderator is typically Claude, defaults to Claude behavior
				const totalContextTokens = usageAggregator.calculateContextTokens(usageStats);
				const contextUsage =
					usageStats.contextWindow > 0
						? Math.round((totalContextTokens / usageStats.contextWindow) * 100)
						: 0;

				// Emit moderator usage for the moderator card
				groupChatEmitters.emitModeratorUsage?.(groupChatId, {
					contextUsage,
					totalCost: usageStats.totalCostUsd,
					tokenCount: totalContextTokens,
				});
			}

			safeSend('process:usage', sessionId, usageStats);
		}
	);
}
