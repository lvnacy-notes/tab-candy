import {
	Notice,
	Plugin,
	requestUrl
} from "obsidian";
import {
	ReactView,
	TAB_CANDY_REACT_VIEW
} from "./Views/ReactView";
import Observable from "src/Utils/Observable";
import {
	TabCandyPluginSettingTab,
	TabCandyPluginSettings,
	DEFAULT_SETTINGS,
} from "src/Settings/Settings";
import fs from "fs";
import path from "path";

const LOCAL_BACKGROUND_EXTENSIONS = [
	".jpg",
	".jpeg",
	".png",
	".webp",
	".gif"
];

/**
 * This allows a "live-reload" of Obsidian when developing the plugin.
 * Any changes to the code will force reload Obsidian.
 */
if (process.env.NODE_ENV === "development") {
	new EventSource("http://127.0.0.1:8000/esbuild").addEventListener(
		"change",
		() => location.reload()
	);
}

export default class TabCandyPlugin extends Plugin {
	settings: TabCandyPluginSettings;
	settingsObservable: Observable;

	async onload() {
		await this.loadSettings();

		this.versionCheck();

		// If the user has configured a local backgrounds folder, refresh the
		// list of local backgrounds from disk on every load/reload/restart.
		await this.syncLocalBackgroundsFromDirectory();

		this.settingsObservable = new Observable(this.settings);

		this.registerView(
			TAB_CANDY_REACT_VIEW,
			(leaf) =>
				new ReactView(this.app, this.settingsObservable, leaf, this)
		);

		this.addSettingTab(new TabCandyPluginSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on(
				"layout-change",
				this.onLayoutChange.bind(this)
			)
		);

		if (process.env.NODE_ENV === "development") {
			// @ts-ignore
			if (process.env.EMULATE_MOBILE && !this.app.isMobile) {
				// @ts-ignore
				this.app.emulateMobile(true);
			}

			// @ts-ignore
			if (!process.env.EMULATE_MOBILE && this.app.isMobile) {
				// @ts-ignore
				this.app.emulateMobile(false);
			}
		}
	}

	onunload() {}

	/**
	 * Load data from disk, stored in data.json in plugin folder
	 */
	async loadSettings() {
		const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	/**
	 * Save data to disk, stored in data.json in plugin folder
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Check the local plugin version against github. If there is a new version, notify the user.
	 */
	async versionCheck() {
		const localVersion = process.env.PLUGIN_VERSION;
		const stableVersion = await requestUrl(
			"https://raw.githubusercontent.com/lvnacy-notes/tab-candy/main/package.json"
		).then(async (res) => {
			if (res.status === 200) {
				const response = await res.json;
				return response.version;
			}
		});
		const betaVersion = await requestUrl(
			"https://raw.githubusercontent.com/lvnacy-notes/tab-candy/beta/package.json"
		).then(async (res) => {
			if (res.status === 200) {
				const response = await res.json;
				return response.version;
			}
		});

		if (localVersion?.indexOf("beta") !== -1) {
			if (localVersion !== betaVersion) {
				new Notice(
					"There is a beta update available for the Tab Candy plugin. Please update to to the latest version to get the latest features!",
					0
				);
			}
		} else if (localVersion !== stableVersion) {
			new Notice(
				"There is an update available for the Tab Candy plugin. Please update to to the latest version to get the latest features!",
				0
			);
		}
	}

	/**
	 * If the user has set a `localBackgroundsDirectory`, scan it for image files
	 * (non-recursive) and replace `localBackgrounds` with fresh base64 copies of
	 * whatever is currently in that folder. This is desktop-only (relies on Node's
	 * `fs`, unavailable on mobile) and is safe to call repeatedly - it always
	 * re-reads the directory from scratch, so adding/removing files in the folder
	 * and then reloading/restarting Obsidian (or hitting "Sync now") is enough to
	 * update the rotation without manually re-selecting images.
	 */
	async syncLocalBackgroundsFromDirectory(): Promise<void> {
		const directory = this.settings.localBackgroundsDirectory;

		// @ts-ignore
		if (!directory || this.app.isMobile) {
			return;
		}

		try {
			if (
				!fs.existsSync(directory) ||
				!fs.statSync(directory).isDirectory()
			) {
				new Notice(
					`Tab Candy: local backgrounds folder "${ directory }" could not be found.`
				);
				return;
			}

			const files = fs
				.readdirSync(directory)
				.filter((fileName) =>
					LOCAL_BACKGROUND_EXTENSIONS.includes(
						path.extname(fileName).toLowerCase()
					)
				)
				.sort();

			const localBackgrounds = files.map((fileName) => {
				const filePath = path.join(directory, fileName);
				const fileData = fs.readFileSync(filePath);
				const base64Data = fileData.toString("base64");
				const ext = path.extname(fileName).toLowerCase();
				const mimeType =
					ext === ".png"
						? "image/png"
						: ext === ".gif"
						? "image/gif"
						: ext === ".webp"
						? "image/webp"
						: "image/jpeg";

				return `data:${mimeType};base64,${base64Data}`;
			});

			this.settings.localBackgrounds = localBackgrounds;
			await this.saveSettings();
			this.settingsObservable?.setValue(this.settings);
		} catch (error) {
			console.error(
				"Tab Candy: failed to sync local backgrounds from directory",
				error
			);
			new Notice(
				`Tab Candy: failed to read local backgrounds folder. Check the console for details.`
			);
		}
	}

	/**
	 * Hijack new tabs and show Tab Candy
	 */
	private onLayoutChange(): void {
		const leaf = this.app.workspace.getMostRecentLeaf();
		if (leaf?.getViewState().type === "empty") {
			leaf.setViewState({
				type: TAB_CANDY_REACT_VIEW,
			});
		}
	}

	/**
	 * Check if the choosen provider is enabled
	 * If yes: open it by using executeCommandById
	 * If no: Notice the user and tell them to enable it in the settings
	 */
	openSwitcherCommand(command: string): void {
		const pluginID = command.split(":")[0];
		//@ts-ignore
		const plugins = this.app.plugins.plugins;
		//@ts-ignore
		const internalPlugins = this.app.internalPlugins.plugins;

		if (plugins[pluginID] || internalPlugins[pluginID]?.enabled) {
			//@ts-ignore
			this.app.commands.executeCommandById(command);
		} else {
			new Notice(
				`Plugin ${pluginID} is not enabled. Please enable it in the settings.`
			);
		}
	}
}