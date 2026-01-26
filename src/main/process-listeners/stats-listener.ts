/**
 * Stats listener.
 * Handles query-complete events for usage statistics tracking.
 */

import type { ProcessManager } from '../process-manager';
import type { QueryCompleteData } from '../process-manager/types';
import type { ProcessListenerDependencies } from './types';

/**
 * Sets up the query-complete listener for stats tracking.
 * Records AI query events to the stats database.
 */
export function setupStatsListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'safeSend' | 'getStatsDB' | 'logger'>
): void {
	const { safeSend, getStatsDB, logger } = deps;

	// Handle query-complete events for stats tracking
	// This is emitted when a batch mode AI query completes (user or auto)
	processManager.on('query-complete', (_sessionId: string, queryData: QueryCompleteData) => {
		try {
			const db = getStatsDB();
			if (db.isReady()) {
				const id = db.insertQueryEvent({
					sessionId: queryData.sessionId,
					agentType: queryData.agentType,
					source: queryData.source,
					startTime: queryData.startTime,
					duration: queryData.duration,
					projectPath: queryData.projectPath,
					tabId: queryData.tabId,
				});
				logger.debug(`Recorded query event: ${id}`, '[Stats]', {
					sessionId: queryData.sessionId,
					agentType: queryData.agentType,
					source: queryData.source,
					duration: queryData.duration,
				});
				// Broadcast stats update to renderer for real-time dashboard refresh
				safeSend('stats:updated');
			}
		} catch (error) {
			logger.error(`Failed to record query event: ${error}`, '[Stats]', {
				sessionId: queryData.sessionId,
			});
		}
	});
}
