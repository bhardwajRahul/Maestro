/**
 * Data output listener.
 * Handles process output data, including group chat buffering and web broadcasting.
 */

import type { ProcessManager } from '../process-manager';
import type { ProcessListenerDependencies } from './types';

/**
 * Sets up the data listener for process output.
 * Handles:
 * - Group chat moderator/participant output buffering
 * - Regular process data forwarding to renderer
 * - Web broadcast to connected clients
 */
export function setupDataListener(
	processManager: ProcessManager,
	deps: Pick<
		ProcessListenerDependencies,
		'safeSend' | 'getWebServer' | 'outputBuffer' | 'outputParser' | 'debugLog' | 'patterns'
	>
): void {
	const { safeSend, getWebServer, outputBuffer, outputParser, debugLog, patterns } = deps;
	const { REGEX_MODERATOR_SESSION, REGEX_AI_SUFFIX, REGEX_AI_TAB_ID } = patterns;

	processManager.on('data', (sessionId: string, data: string) => {
		// Handle group chat moderator output - buffer it
		// Session ID format: group-chat-{groupChatId}-moderator-{uuid} or group-chat-{groupChatId}-moderator-synthesis-{uuid}
		const moderatorMatch = sessionId.match(REGEX_MODERATOR_SESSION);
		if (moderatorMatch) {
			const groupChatId = moderatorMatch[1];
			debugLog('GroupChat:Debug', `MODERATOR DATA received for chat ${groupChatId}`);
			debugLog('GroupChat:Debug', `Session ID: ${sessionId}`);
			debugLog('GroupChat:Debug', `Data length: ${data.length}`);
			// Buffer the output - will be routed on process exit
			const totalLength = outputBuffer.appendToGroupChatBuffer(sessionId, data);
			debugLog('GroupChat:Debug', `Buffered total: ${totalLength} chars`);
			return; // Don't send to regular process:data handler
		}

		// Handle group chat participant output - buffer it
		// Session ID format: group-chat-{groupChatId}-participant-{name}-{uuid|timestamp}
		const participantInfo = outputParser.parseParticipantSessionId(sessionId);
		if (participantInfo) {
			debugLog('GroupChat:Debug', 'PARTICIPANT DATA received');
			debugLog(
				'GroupChat:Debug',
				`Chat: ${participantInfo.groupChatId}, Participant: ${participantInfo.participantName}`
			);
			debugLog('GroupChat:Debug', `Session ID: ${sessionId}`);
			debugLog('GroupChat:Debug', `Data length: ${data.length}`);
			// Buffer the output - will be routed on process exit
			const totalLength = outputBuffer.appendToGroupChatBuffer(sessionId, data);
			debugLog('GroupChat:Debug', `Buffered total: ${totalLength} chars`);
			return; // Don't send to regular process:data handler
		}

		safeSend('process:data', sessionId, data);

		// Broadcast to web clients - extract base session ID (remove -ai or -terminal suffix)
		// IMPORTANT: Skip PTY terminal output (-terminal suffix) as it contains raw ANSI codes.
		// Web interface terminal commands use runCommand() which emits with plain session IDs.
		const webServer = getWebServer();
		if (webServer) {
			// Don't broadcast raw PTY terminal output to web clients
			if (sessionId.endsWith('-terminal')) {
				debugLog('WebBroadcast', `SKIPPING PTY terminal output for web: session=${sessionId}`);
				return;
			}

			// Don't broadcast background batch/synopsis output to web clients
			// These are internal Auto Run operations that should only appear in history, not as chat messages
			if (sessionId.includes('-batch-') || sessionId.includes('-synopsis-')) {
				debugLog('WebBroadcast', `SKIPPING batch/synopsis output for web: session=${sessionId}`);
				return;
			}

			// Extract base session ID and tab ID from format: {id}-ai-{tabId}
			const baseSessionId = sessionId.replace(REGEX_AI_SUFFIX, '');
			const isAiOutput = sessionId.includes('-ai-');

			// Extract tab ID from session ID format: {id}-ai-{tabId}
			const tabIdMatch = sessionId.match(REGEX_AI_TAB_ID);
			const tabId = tabIdMatch ? tabIdMatch[1] : undefined;

			const msgId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			debugLog(
				'WebBroadcast',
				`Broadcasting session_output: msgId=${msgId}, session=${baseSessionId}, tabId=${tabId || 'none'}, source=${isAiOutput ? 'ai' : 'terminal'}, dataLen=${data.length}`
			);
			webServer.broadcastToSessionClients(baseSessionId, {
				type: 'session_output',
				sessionId: baseSessionId,
				tabId,
				data,
				source: isAiOutput ? 'ai' : 'terminal',
				timestamp: Date.now(),
				msgId,
			});
		}
	});
}
