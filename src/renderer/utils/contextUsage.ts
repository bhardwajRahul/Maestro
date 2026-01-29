/**
 * Context Usage Estimation Utilities
 *
 * Re-exports from shared module for backward compatibility.
 * All context usage logic is now centralized in src/shared/contextUsage.ts
 */

export {
	DEFAULT_CONTEXT_WINDOWS,
	COMBINED_CONTEXT_AGENTS,
	calculateContextTokens,
	estimateContextUsage,
	type ContextUsageStats,
} from '../../shared/contextUsage';
