import { Notice, requestUrl } from 'obsidian';
import withTimeout from '../Utils/withTimeout';

const REQUEST_TIMEOUT_MS = 8000;

const STABLE_MANIFEST_URL =
	'https://raw.githubusercontent.com/lvnacy-notes/tab-candy/main/package.json';
const BETA_MANIFEST_URL =
	'https://raw.githubusercontent.com/lvnacy-notes/tab-candy/beta/package.json';

/**
 * Reads the `version` field out of a fetched `package.json`, without
 * trusting its shape - the response body is arbitrary data pulled from a
 * URL, not something this plugin controls the shape of.
 */
const readVersionField = (data: unknown): string | undefined => {
	if (
		data &&
		typeof data === 'object' &&
		'version' in data &&
		typeof data.version === 'string'
	) {
		return data.version;
	}

	return undefined;
};

/**
 * Fetches the `version` field from a `package.json` at the given URL.
 * Returns `undefined` rather than throwing on a network failure, a
 * non-2xx response, a timeout, or an unexpected response shape - every
 * failure mode collapses to the same predictable "unknown" result so the
 * caller doesn't need to distinguish them.
 */
const fetchPublishedVersion = async (
	url: string
): Promise<string | undefined> => {
	try {
		const response = await withTimeout(
			requestUrl({ url, throw: false }),
			REQUEST_TIMEOUT_MS
		);

		if (response.status !== 200) {return undefined;}

		return readVersionField(await response.json);
	} catch {
		return undefined;
	}
};

/**
 * Compares the running plugin's version against the latest version
 * published on GitHub (stable or beta, depending on which channel the
 * running version belongs to) and shows a persistent Notice if a newer
 * version is available. Reads `process.env.PLUGIN_VERSION`, which esbuild
 * inlines at build time from `package.json`.
 *
 * Best-effort and non-blocking: called without being awaited (see
 * `main.ts`), so a slow or failing check can never delay plugin startup or
 * view registration, and every internal failure resolves to "do nothing"
 * rather than throwing into an unhandled rejection.
 */
export async function checkForPluginUpdates(): Promise<void> {
	const localVersion = process.env.PLUGIN_VERSION;

	const [stableVersion, betaVersion] = await Promise.all([
		fetchPublishedVersion(STABLE_MANIFEST_URL),
		fetchPublishedVersion(BETA_MANIFEST_URL),
	]);

	if (localVersion?.includes('beta')) {
		if (betaVersion && localVersion !== betaVersion) {
			new Notice(
				'There is a beta update available for the Tab Candy plugin. Please update to to the latest version to get the latest features!',
				0
			);
		}
	} else if (stableVersion && localVersion !== stableVersion) {
		new Notice(
			'There is an update available for the Tab Candy plugin. Please update to to the latest version to get the latest features!',
			0
		);
	}
}
