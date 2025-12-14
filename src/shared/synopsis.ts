/**
 * Synopsis parsing utilities for batch processing output.
 * Used by both renderer (useBatchProcessor hook) and CLI (batch-processor service).
 *
 * Functions:
 * - parseSynopsis: Parse AI-generated synopsis responses into structured format
 */

export interface ParsedSynopsis {
  shortSummary: string;
  fullSynopsis: string;
}

/**
 * Parse a synopsis response into short summary and full synopsis.
 *
 * Expected AI response format:
 *   **Summary:** Short 1-2 sentence summary
 *   **Details:** Detailed paragraph...
 *
 * Falls back to using the first line as summary if format not detected.
 *
 * @param response - Raw AI response string (may contain ANSI codes, box drawing chars)
 * @returns Parsed synopsis with shortSummary and fullSynopsis
 */
export function parseSynopsis(response: string): ParsedSynopsis {
  // Clean up ANSI codes and box drawing characters
  const clean = response
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/─+/g, '')
    .replace(/[│┌┐└┘├┤┬┴┼]/g, '')
    .trim();

  // Try to extract Summary and Details sections
  const summaryMatch = clean.match(/\*\*Summary:\*\*\s*(.+?)(?=\*\*Details:\*\*|$)/is);
  const detailsMatch = clean.match(/\*\*Details:\*\*\s*(.+?)$/is);

  const shortSummary = summaryMatch?.[1]?.trim() || clean.split('\n')[0]?.trim() || 'Task completed';
  const details = detailsMatch?.[1]?.trim() || '';

  // Full synopsis includes both parts
  const fullSynopsis = details ? `${shortSummary}\n\n${details}` : shortSummary;

  return { shortSummary, fullSynopsis };
}
