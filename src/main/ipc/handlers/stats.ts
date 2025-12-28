/**
 * Stats IPC Handlers
 *
 * These handlers provide access to the stats tracking database for recording
 * and querying AI interaction metrics across Maestro sessions.
 *
 * Features:
 * - Record query events (interactive AI conversations)
 * - Track Auto Run sessions and individual tasks
 * - Query stats with time range and filter support
 * - Aggregated statistics for dashboard display
 * - CSV export for data analysis
 */

import { ipcMain, BrowserWindow } from 'electron';
import { logger } from '../../utils/logger';
import { withIpcErrorLogging, CreateHandlerOptions } from '../../utils/ipcHandler';
import { getStatsDB } from '../../stats-db';
import {
  QueryEvent,
  AutoRunSession,
  AutoRunTask,
  StatsTimeRange,
  StatsFilters,
} from '../../../shared/stats-types';

const LOG_CONTEXT = '[Stats]';

// Helper to create handler options with consistent context
const handlerOpts = (operation: string): Pick<CreateHandlerOptions, 'context' | 'operation'> => ({
  context: LOG_CONTEXT,
  operation,
});

/**
 * Dependencies for stats handlers
 */
export interface StatsHandlerDependencies {
  getMainWindow: () => BrowserWindow | null;
}

/**
 * Broadcast stats update to renderer
 */
function broadcastStatsUpdate(getMainWindow: () => BrowserWindow | null): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stats:updated');
  }
}

/**
 * Register all Stats-related IPC handlers.
 *
 * These handlers provide stats persistence and query operations:
 * - Record query events for interactive sessions
 * - Start/end Auto Run sessions
 * - Record individual Auto Run tasks
 * - Get stats with filtering and time range
 * - Get aggregated stats for dashboard
 * - Export stats to CSV
 */
export function registerStatsHandlers(deps: StatsHandlerDependencies): void {
  const { getMainWindow } = deps;

  // Record a query event (interactive conversation turn)
  ipcMain.handle(
    'stats:record-query',
    withIpcErrorLogging(handlerOpts('recordQuery'), async (event: Omit<QueryEvent, 'id'>) => {
      const db = getStatsDB();
      const id = db.insertQueryEvent(event);
      logger.debug(`Recorded query event: ${id}`, LOG_CONTEXT, {
        sessionId: event.sessionId,
        agentType: event.agentType,
        source: event.source,
        duration: event.duration,
      });
      broadcastStatsUpdate(getMainWindow);
      return id;
    })
  );

  // Start an Auto Run session (returns ID for later updates)
  ipcMain.handle(
    'stats:start-autorun',
    withIpcErrorLogging(
      handlerOpts('startAutoRun'),
      async (session: Omit<AutoRunSession, 'id' | 'duration'>) => {
        const db = getStatsDB();
        const fullSession: Omit<AutoRunSession, 'id'> = {
          ...session,
          duration: 0, // Will be updated when session ends
        };
        const id = db.insertAutoRunSession(fullSession);
        logger.info(`Started Auto Run session: ${id}`, LOG_CONTEXT, {
          sessionId: session.sessionId,
          documentPath: session.documentPath,
        });
        broadcastStatsUpdate(getMainWindow);
        return id;
      }
    )
  );

  // End an Auto Run session (update duration and completed count)
  ipcMain.handle(
    'stats:end-autorun',
    withIpcErrorLogging(
      handlerOpts('endAutoRun'),
      async (id: string, duration: number, tasksCompleted: number) => {
        const db = getStatsDB();
        const updated = db.updateAutoRunSession(id, { duration, tasksCompleted });
        if (updated) {
          logger.info(`Ended Auto Run session: ${id}`, LOG_CONTEXT, {
            duration,
            tasksCompleted,
          });
        } else {
          logger.warn(`Auto Run session not found: ${id}`, LOG_CONTEXT);
        }
        broadcastStatsUpdate(getMainWindow);
        return updated;
      }
    )
  );

  // Record an Auto Run task completion
  ipcMain.handle(
    'stats:record-task',
    withIpcErrorLogging(handlerOpts('recordTask'), async (task: Omit<AutoRunTask, 'id'>) => {
      const db = getStatsDB();
      const id = db.insertAutoRunTask(task);
      logger.debug(`Recorded Auto Run task: ${id}`, LOG_CONTEXT, {
        autoRunSessionId: task.autoRunSessionId,
        taskIndex: task.taskIndex,
        success: task.success,
      });
      broadcastStatsUpdate(getMainWindow);
      return id;
    })
  );

  // Get query events with time range and optional filters
  ipcMain.handle(
    'stats:get-stats',
    withIpcErrorLogging(
      handlerOpts('getStats'),
      async (range: StatsTimeRange, filters?: StatsFilters) => {
        const db = getStatsDB();
        return db.getQueryEvents(range, filters);
      }
    )
  );

  // Get Auto Run sessions within a time range
  ipcMain.handle(
    'stats:get-autorun-sessions',
    withIpcErrorLogging(handlerOpts('getAutoRunSessions'), async (range: StatsTimeRange) => {
      const db = getStatsDB();
      return db.getAutoRunSessions(range);
    })
  );

  // Get tasks for a specific Auto Run session
  ipcMain.handle(
    'stats:get-autorun-tasks',
    withIpcErrorLogging(handlerOpts('getAutoRunTasks'), async (autoRunSessionId: string) => {
      const db = getStatsDB();
      return db.getAutoRunTasks(autoRunSessionId);
    })
  );

  // Get aggregated stats for dashboard display
  ipcMain.handle(
    'stats:get-aggregation',
    withIpcErrorLogging(handlerOpts('getAggregation'), async (range: StatsTimeRange) => {
      const db = getStatsDB();
      return db.getAggregatedStats(range);
    })
  );

  // Export query events to CSV
  ipcMain.handle(
    'stats:export-csv',
    withIpcErrorLogging(handlerOpts('exportCsv'), async (range: StatsTimeRange) => {
      const db = getStatsDB();
      return db.exportToCsv(range);
    })
  );
}
