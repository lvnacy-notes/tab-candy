import { App, normalizePath } from 'obsidian';
import { BACKGROUND_IMAGE_EXTENSIONS } from '../Types/Images';

/**
 * Non-recursive discovery of background images inside a vault-relative
 * folder, using Obsidian's public vault adapter (`app.vault.adapter.list()`)
 * instead of Node's `fs`/`path`. This is the direct replacement for the
 * pre-refactor `syncLocalBackgroundsFromDirectory()`, which relied on an
 * absolute OS path and Node's filesystem module - both desktop-only and
 * incompatible with mobile.
 *
 * Two deliberate differences from the function this replaces:
 * - It returns vault-relative *paths*, never image bytes. Callers resolve a
 *   path to a displayable URL only when actually rendering it (see
 *   `getBackgroundResourcePath` below), rather than eagerly base64-encoding
 *   every file into settings.
 * - Non-recursive by design, matching the already-recorded §0 decision, not
 *   just matching old behavior by accident.
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
		// error - matches the graceful-failure behavior the pre-refactor
		// version had for a missing/invalid OS folder.
		console.error(
			`Tab Candy: could not read background images folder "${normalizedPath}"`,
			error
		);
		return [];
	}
}

/**
 * Resolves a vault-relative file path to a URL usable directly in an
 * `<img src>` or CSS `background-image` - the mobile/desktop-safe
 * replacement for reading a file's bytes and base64-encoding them into
 * settings. Nothing here is cached or persisted; call this at render time.
 */
export function getBackgroundResourcePath(app: App, path: string): string {
	return app.vault.adapter.getResourcePath(normalizePath(path));
}