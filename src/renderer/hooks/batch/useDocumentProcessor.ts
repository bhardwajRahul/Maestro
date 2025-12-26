/**
 * useDocumentProcessor - Document processing logic hook for batch processing
 *
 * This hook extracts the core document reading and task processing logic from
 * useBatchProcessor, providing a reusable interface for:
 * - Reading documents and counting tasks
 * - Processing individual tasks with template variable substitution
 * - Spawning agents and tracking results
 * - Generating synopses for completed tasks
 *
 * The hook is designed to be used by useBatchProcessor for orchestration
 * while encapsulating the document-specific processing logic.
 */

import { useCallback } from 'react';
import type { Session, UsageStats, ToolType } from '../../types';
import { substituteTemplateVariables, TemplateContext } from '../../utils/templateVariables';
import { autorunSynopsisPrompt } from '../../../prompts';
import { parseSynopsis } from '../../../shared/synopsis';
import { countUnfinishedTasks, countCheckedTasks } from './batchUtils';

/**
 * Configuration for document processing
 */
export interface DocumentProcessorConfig {
  /**
   * Folder path containing the Auto Run documents
   */
  folderPath: string;

  /**
   * Session to process documents for
   */
  session: Session;

  /**
   * Current git branch (for template variable substitution)
   */
  gitBranch?: string;

  /**
   * Session group name (for template variable substitution)
   */
  groupName?: string;

  /**
   * Current loop iteration (1-indexed, for template variables)
   */
  loopIteration: number;

  /**
   * Effective current working directory (may be worktree path)
   */
  effectiveCwd: string;

  /**
   * Custom prompt to use for task processing
   */
  customPrompt: string;
}

/**
 * Result of processing a single task
 */
export interface TaskResult {
  /**
   * Whether the task completed successfully
   */
  success: boolean;

  /**
   * Agent session ID from the spawn result
   */
  agentSessionId?: string;

  /**
   * Token usage statistics from the agent run
   */
  usageStats?: UsageStats;

  /**
   * Time elapsed processing this task (ms)
   */
  elapsedTimeMs: number;

  /**
   * Number of tasks completed in this run (can be 0 if stalled)
   */
  tasksCompletedThisRun: number;

  /**
   * Number of remaining unchecked tasks after this run
   */
  newRemainingTasks: number;

  /**
   * Short summary of work done (for history entry)
   */
  shortSummary: string;

  /**
   * Full synopsis of work done (for history entry)
   */
  fullSynopsis: string;

  /**
   * Whether the document content changed during processing
   */
  documentChanged: boolean;

  /**
   * The content of the document after processing
   */
  contentAfterTask: string;

  /**
   * New count of checked tasks
   */
  newCheckedCount: number;

  /**
   * Number of new unchecked tasks that were added during processing
   */
  addedUncheckedTasks: number;
}

/**
 * Document read result with task count
 */
export interface DocumentReadResult {
  /**
   * The document content
   */
  content: string;

  /**
   * Number of unchecked tasks in the document
   */
  taskCount: number;

  /**
   * Number of checked tasks in the document
   */
  checkedCount: number;
}

/**
 * Callbacks required for document processing
 */
export interface DocumentProcessorCallbacks {
  /**
   * Spawn an agent with a prompt
   */
  onSpawnAgent: (
    sessionId: string,
    prompt: string,
    cwdOverride?: string
  ) => Promise<{
    success: boolean;
    response?: string;
    agentSessionId?: string;
    usageStats?: UsageStats;
  }>;

  /**
   * Spawn a synopsis request for a completed task
   */
  onSpawnSynopsis: (
    sessionId: string,
    cwd: string,
    agentSessionId: string,
    prompt: string,
    toolType?: ToolType
  ) => Promise<{
    success: boolean;
    response?: string;
  }>;
}

/**
 * Return type for the useDocumentProcessor hook
 */
export interface UseDocumentProcessorReturn {
  /**
   * Read a document and count its tasks
   * @param folderPath - Folder containing the document
   * @param filename - Document filename (without .md extension)
   * @returns Document content and task counts
   */
  readDocAndCountTasks: (
    folderPath: string,
    filename: string
  ) => Promise<DocumentReadResult>;

  /**
   * Process a single task in a document
   * @param config - Document processing configuration
   * @param filename - Document filename (without .md extension)
   * @param previousCheckedCount - Number of checked tasks before this run
   * @param previousRemainingTasks - Number of remaining tasks before this run
   * @param contentBeforeTask - Document content before processing
   * @param callbacks - Callbacks for agent spawning
   * @returns Result of the task processing
   */
  processTask: (
    config: DocumentProcessorConfig,
    filename: string,
    previousCheckedCount: number,
    previousRemainingTasks: number,
    contentBeforeTask: string,
    callbacks: DocumentProcessorCallbacks
  ) => Promise<TaskResult>;
}

/**
 * Hook for document processing operations in batch processing
 *
 * This hook provides reusable document processing logic that was previously
 * embedded directly in useBatchProcessor. It handles:
 * - Reading documents and counting tasks
 * - Template variable expansion in prompts and documents
 * - Spawning agents to process tasks
 * - Generating synopses for completed work
 *
 * Usage:
 * ```typescript
 * const { readDocAndCountTasks, processTask } = useDocumentProcessor();
 *
 * // Read document and count tasks
 * const { content, taskCount, checkedCount } = await readDocAndCountTasks(folderPath, 'phase-1');
 *
 * // Process a task
 * const result = await processTask(config, 'phase-1', checkedCount, taskCount, content, callbacks);
 * ```
 */
export function useDocumentProcessor(): UseDocumentProcessorReturn {
  /**
   * Read a document and count its tasks
   */
  const readDocAndCountTasks = useCallback(
    async (folderPath: string, filename: string): Promise<DocumentReadResult> => {
      const result = await window.maestro.autorun.readDoc(folderPath, filename + '.md');

      if (!result.success || !result.content) {
        return { content: '', taskCount: 0, checkedCount: 0 };
      }

      return {
        content: result.content,
        taskCount: countUnfinishedTasks(result.content),
        checkedCount: countCheckedTasks(result.content),
      };
    },
    []
  );

  /**
   * Process a single task in a document
   */
  const processTask = useCallback(
    async (
      config: DocumentProcessorConfig,
      filename: string,
      previousCheckedCount: number,
      previousRemainingTasks: number,
      contentBeforeTask: string,
      callbacks: DocumentProcessorCallbacks
    ): Promise<TaskResult> => {
      const {
        folderPath,
        session,
        gitBranch,
        groupName,
        loopIteration,
        effectiveCwd,
        customPrompt,
      } = config;

      const docFilePath = `${folderPath}/${filename}.md`;

      // Build template context for this task
      const templateContext: TemplateContext = {
        session,
        gitBranch,
        groupName,
        autoRunFolder: folderPath,
        loopNumber: loopIteration, // Already 1-indexed from caller
        documentName: filename,
        documentPath: docFilePath,
      };

      // Substitute template variables in the prompt
      const finalPrompt = substituteTemplateVariables(customPrompt, templateContext);

      // Read document content and expand template variables in it
      const docReadResult = await window.maestro.autorun.readDoc(
        folderPath,
        filename + '.md'
      );

      if (docReadResult.success && docReadResult.content) {
        const expandedDocContent = substituteTemplateVariables(
          docReadResult.content,
          templateContext
        );

        // Write the expanded content back to the document temporarily
        // (Agent will read this file, so it needs the expanded variables)
        if (expandedDocContent !== docReadResult.content) {
          await window.maestro.autorun.writeDoc(
            folderPath,
            filename + '.md',
            expandedDocContent
          );
        }
      }

      // Capture start time for elapsed time tracking
      const taskStartTime = Date.now();

      // Spawn agent with the prompt, using effective cwd (may be worktree path)
      const result = await callbacks.onSpawnAgent(
        session.id,
        finalPrompt,
        effectiveCwd !== session.cwd ? effectiveCwd : undefined
      );

      // Capture elapsed time
      const elapsedTimeMs = Date.now() - taskStartTime;

      // Register agent session origin for Auto Run tracking
      if (result.agentSessionId) {
        // Use effectiveCwd (worktree path when active) so session can be found later
        window.maestro.agentSessions
          .registerSessionOrigin(effectiveCwd, result.agentSessionId, 'auto')
          .catch((err) =>
            console.error(
              '[DocumentProcessor] Failed to register session origin:',
              err
            )
          );
      }

      // Re-read document to get updated task count and content
      const afterResult = await readDocAndCountTasks(folderPath, filename);
      const { content: contentAfterTask, taskCount: newRemainingTasks, checkedCount: newCheckedCount } = afterResult;

      // Calculate tasks completed based on newly checked tasks
      // This remains accurate even if new unchecked tasks are added
      const tasksCompletedThisRun = Math.max(0, newCheckedCount - previousCheckedCount);
      const addedUncheckedTasks = Math.max(
        0,
        newRemainingTasks - previousRemainingTasks
      );

      // Detect if document content changed
      const documentChanged = contentBeforeTask !== contentAfterTask;

      // Generate synopsis for successful tasks with an agent session
      let shortSummary = `[${filename}] Task completed`;
      let fullSynopsis = shortSummary;

      if (result.success && result.agentSessionId) {
        // Request a synopsis from the agent by resuming the session
        // Use effectiveCwd (worktree path when active) to find the session
        try {
          const synopsisResult = await callbacks.onSpawnSynopsis(
            session.id,
            effectiveCwd,
            result.agentSessionId,
            autorunSynopsisPrompt,
            session.toolType // Pass the agent type for multi-provider support
          );

          if (synopsisResult.success && synopsisResult.response) {
            const parsed = parseSynopsis(synopsisResult.response);
            shortSummary = parsed.shortSummary;
            fullSynopsis = parsed.fullSynopsis;
          }
        } catch (err) {
          console.error('[DocumentProcessor] Synopsis generation failed:', err);
        }
      } else if (!result.success) {
        shortSummary = `[${filename}] Task failed`;
        fullSynopsis = shortSummary;
      }

      return {
        success: result.success,
        agentSessionId: result.agentSessionId,
        usageStats: result.usageStats,
        elapsedTimeMs,
        tasksCompletedThisRun,
        newRemainingTasks,
        shortSummary,
        fullSynopsis,
        documentChanged,
        contentAfterTask,
        newCheckedCount,
        addedUncheckedTasks,
      };
    },
    [readDocAndCountTasks]
  );

  return {
    readDocAndCountTasks,
    processTask,
  };
}
