/**
 * Store Utilities
 *
 * Helper functions for store operations including:
 * - Sync path resolution
 * - Early settings access (before app.ready)
 * - SSH remote configuration lookup
 */

import Store from 'electron-store';
import fsSync from 'fs';

import type { BootstrapSettings } from './types';
import type { SshRemoteConfig } from '../../shared/types';

// Re-export getDefaultShell from defaults for backward compatibility
export { getDefaultShell } from './defaults';

// ============================================================================
// Sync Path Utilities
// ============================================================================

/**
 * Get the custom sync path from the bootstrap store.
 * Creates the directory if it doesn't exist.
 * Returns undefined if no custom path is configured or if creation fails.
 */
export function getCustomSyncPath(bootstrapStore: Store<BootstrapSettings>): string | undefined {
	const customPath = bootstrapStore.get('customSyncPath');

	if (customPath) {
		// Ensure the directory exists
		if (!fsSync.existsSync(customPath)) {
			try {
				fsSync.mkdirSync(customPath, { recursive: true });
			} catch {
				// If we can't create the directory, fall back to default
				console.error(`Failed to create custom sync path: ${customPath}, using default`);
				return undefined;
			}
		}
		return customPath;
	}

	return undefined;
}

// ============================================================================
// Early Settings Access
// ============================================================================

/**
 * Get early settings that need to be read before app.ready.
 * Used for crash reporting and GPU acceleration settings.
 *
 * This creates a temporary store instance just for reading these values
 * before the full store initialization happens.
 */
export function getEarlySettings(syncPath: string): {
	crashReportingEnabled: boolean;
	disableGpuAcceleration: boolean;
} {
	const earlyStore = new Store<{
		crashReportingEnabled: boolean;
		disableGpuAcceleration: boolean;
	}>({
		name: 'maestro-settings',
		cwd: syncPath,
	});

	return {
		crashReportingEnabled: earlyStore.get('crashReportingEnabled', true),
		disableGpuAcceleration: earlyStore.get('disableGpuAcceleration', false),
	};
}

// ============================================================================
// SSH Remote Utilities
// ============================================================================

/**
 * Get SSH remote configuration by ID from a settings store.
 * Returns undefined if not found.
 *
 * Note: This is a lower-level function that takes a store instance.
 * For convenience, use getSshRemoteById() from the main stores module
 * which automatically uses the initialized settings store.
 */
export function findSshRemoteById(
	sshRemotes: SshRemoteConfig[],
	sshRemoteId: string
): SshRemoteConfig | undefined {
	return sshRemotes.find((r) => r.id === sshRemoteId);
}
