import {
	App,
	EventRef,
	TAbstractFile,
	TFile,
	normalizePath
} from 'obsidian';
import { BACKGROUND_IMAGE_EXTENSIONS } from '../Types/Images';
import SettingsStore from '../Settings/SettingsStore';
import debounce from '../Utils/debounce';

/**
 * Non-recursive discovery of background images inside a vault-relative
 * folder, using Obsidian's public vault adapter (`app.vault.adapter.list()`).
 *
 * Returns vault-relative *paths*, never image bytes - callers resolve a
 * path to a displayable URL only when actually rendering it (see
 * `getBackgroundResourcePath` below), rather than eagerly encoding every
 * file into settings.
 *
 * Never throws: returns an empty array if the folder path is empty, doesn't
 * exist, isn't a folder, or can't be read for any other reason - callers
 * should treat that identically to "no local backgrounds configured" rather
 * than as an error state that needs separate handling.
 */
export async function listBackgroundFilesInFolder(
	app: App,
	folderPath: string
): Promise<string[]> {
	if (!folderPath) {
		return [];
	}

	const normalizedPath = normalizePath(folderPath);

	try {
		const { files } = await app.vault.adapter.list(normalizedPath);

		return files
			.filter((filePath) => {
				const extension = filePath.split('.').pop()?.toLowerCase();
				return (
					!!extension &&
					BACKGROUND_IMAGE_EXTENSIONS.includes(extension)
				);
			})
			.sort();
	} catch (error) {
		// adapter.list() throws (rather than returning an empty result) when
		// the path doesn't exist or isn't a directory. Log for debugging but
		// degrade to "nothing found" instead of surfacing this as a fatal
		// error - a missing or invalid folder is an ordinary, expected
		// configuration state, not an exceptional one.
		console.error(
			`Tab Candy: could not read background images folder "${normalizedPath}"`,
			error
		);
		return [];
	}
}

/**
 * Resolves a vault-relative file path to a URL usable directly in an
 * `<img src>` or CSS `background-image`. Nothing here is cached or
 * persisted; call this at render time.
 */
export function getBackgroundResourcePath(app: App, path: string): string {
	return app.vault.adapter.getResourcePath(normalizePath(path));
}

/**
 * Filters a list of vault-relative paths down to the ones that still
 * resolve to an actual file in the vault, dropping any that were deleted
 * or renamed since they were recorded. Applies to both `backgroundFiles`
 * (folder-sync results) and `manualBackgroundFiles` (individually-added
 * images) - a stale path in either would otherwise resolve, via
 * `getBackgroundResourcePath()`, to a URL for a file that no longer
 * exists: not a crash, but a broken image with no signal anywhere that
 * something's wrong.
 *
 * This is a read-only check - it doesn't persist anything. Callers that
 * want the settings themselves cleaned up (not just the current render)
 * need to write the filtered result back through the settings store
 * themselves; see `pruneMissingManualBackgroundFiles()` below.
 */
export function filterExistingFiles(app: App, paths: string[]): string[] {
	return paths.filter(
		(path) =>
			app.vault.getAbstractFileByPath(normalizePath(path)) instanceof
			TFile
	);
}

/**
 * Re-scans the configured vault-relative backgrounds folder and writes the
 * result to settings.backgroundFiles. Safe to call repeatedly (on load, on
 * a vault event, or from the "Sync now" button), and safe to call with no
 * folder configured (resolves to an empty list rather than throwing).
 */
export async function syncBackgroundsFolder(
	app: App,
	settingsStore: SettingsStore
): Promise<void> {
	const backgroundFiles = await listBackgroundFilesInFolder(
		app,
		settingsStore.get().backgroundsFolder
	);
	await settingsStore.update({ backgroundFiles });
}

/**
 * Drops any manualBackgroundFiles entries that no longer resolve to a real
 * vault file, persisting the filtered result. Complements the live
 * delete/rename event listeners registered by
 * `registerBackgroundVaultWatchers()` below: those catch changes made
 * while the plugin is running, this catches whatever happened while it
 * wasn't (vault events don't fire retroactively for changes made before
 * the plugin loaded).
 */
export async function pruneMissingManualBackgroundFiles(
	app: App,
	settingsStore: SettingsStore
): Promise<void> {
	const current = settingsStore.get().manualBackgroundFiles;
	const manualBackgroundFiles = filterExistingFiles(app, current);
	if (manualBackgroundFiles.length !== current.length) {
		await settingsStore.update({ manualBackgroundFiles });
	}
}

/**
 * True when `file` is a direct child of `backgroundsFolder` - used to scope
 * vault create/modify/delete/rename handling to files that could actually
 * affect `backgroundFiles`, rather than re-scanning the folder on every
 * vault event regardless of what changed. Matches the already-locked §0
 * non-recursive decision: a file several folders deeper is intentionally
 * ignored, same as it always has been for the folder sync itself.
 */
function isInBackgroundsFolder(
	file: TAbstractFile,
	backgroundsFolder: string
): boolean {
	if (!backgroundsFolder) {return false;}
	return file.parent?.path === normalizePath(backgroundsFolder);
}

/**
 * Registers vault `create`/`modify`/`delete`/`rename` listeners that keep
 * `backgroundFiles` and `manualBackgroundFiles` current without requiring a
 * reload or an explicit "Sync now" click. `create`/`modify` trigger a
 * debounced re-sync of the configured folder; `delete`/`rename` update or
 * drop the affected `manualBackgroundFiles` entry directly, since an
 * individually-added image can live anywhere in the vault, not just inside
 * the configured folder.
 *
 * `registerEvent` is passed in rather than this function registering
 * directly on `app.vault`, so the caller's own `Component.registerEvent()`
 * (auto-cleaned up on unload) is what actually owns the returned
 * `EventRef`s - this function has no lifecycle of its own to clean up
 * against.
 */
export function registerBackgroundVaultWatchers(
	app: App,
	settingsStore: SettingsStore,
	registerEvent: (eventRef: EventRef) => void
): void {
	// Collapses a burst of vault events (e.g. a sync client writing several
	// files in a row) into a single re-scan 500ms after the last one,
	// instead of re-reading the folder from scratch on every individual
	// event.
	const debouncedSync = debounce(() => {
		void syncBackgroundsFolder(app, settingsStore);
	}, 500);

	registerEvent(
		app.vault.on('create', (file) => {
			if (isInBackgroundsFolder(file, settingsStore.get().backgroundsFolder)) {
				debouncedSync();
			}
		})
	);

	registerEvent(
		app.vault.on('modify', (file) => {
			if (isInBackgroundsFolder(file, settingsStore.get().backgroundsFolder)) {
				debouncedSync();
			}
		})
	);

	registerEvent(
		app.vault.on('delete', (file) => {
			const settings = settingsStore.get();
			if (settings.manualBackgroundFiles.includes(file.path)) {
				void settingsStore.update({
					manualBackgroundFiles: settings.manualBackgroundFiles.filter(
						(path) => path !== file.path
					),
				});
			}
			if (isInBackgroundsFolder(file, settings.backgroundsFolder)) {
				debouncedSync();
			}
		})
	);

	registerEvent(
		app.vault.on('rename', (file, oldPath) => {
			const settings = settingsStore.get();
			if (
				file instanceof TFile &&
				settings.manualBackgroundFiles.includes(oldPath)
			) {
				void settingsStore.update({
					manualBackgroundFiles: settings.manualBackgroundFiles.map(
						(path) => (path === oldPath ? file.path : path)
					),
				});
			}
			const oldParentPath = oldPath.includes('/')
				? oldPath.slice(0, oldPath.lastIndexOf('/'))
				: '';
			if (
				isInBackgroundsFolder(file, settings.backgroundsFolder) ||
				(settings.backgroundsFolder &&
					oldParentPath === normalizePath(settings.backgroundsFolder))
			) {
				debouncedSync();
			}
		})
	);
}