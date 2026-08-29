import { Notice, requestUrl } from 'obsidian';

/**
 * Compares the running plugin's version against the latest version
 * published on GitHub (stable or beta, depending on which channel the
 * running version belongs to) and shows a persistent Notice if a newer
 * version is available. Reads `process.env.PLUGIN_VERSION`, which esbuild
 * inlines at build time from `package.json`.
 */
export async function checkForPluginUpdates(): Promise<void> {
	const localVersion = process.env.PLUGIN_VERSION;
	const stableVersion = await requestUrl(
		'https://raw.githubusercontent.com/lvnacy-notes/tab-candy/main/package.json'
	).then(async (res) => {
		if (res.status === 200) {
			const response = await res.json;
			return response.version;
		}
	});
	const betaVersion = await requestUrl(
		'https://raw.githubusercontent.com/lvnacy-notes/tab-candy/beta/package.json'
	).then(async (res) => {
		if (res.status === 200) {
			const response = await res.json;
			return response.version;
		}
	});

	if (localVersion?.indexOf('beta') !== -1) {
		if (localVersion !== betaVersion) {
			new Notice(
				'There is a beta update available for the Tab Candy plugin. Please update to to the latest version to get the latest features!',
				0
			);
		}
	} else if (localVersion !== stableVersion) {
		new Notice(
			'There is an update available for the Tab Candy plugin. Please update to to the latest version to get the latest features!',
			0
		);
	}
}
