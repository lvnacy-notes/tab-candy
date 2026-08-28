import {
	Notice,
	Plugin,
	requestUrl
} from 'obsidian';
import {
	TabCandyView,
	TAB_CANDY_VIEW_TYPE
} from './Views/ReactView';
import SettingsStore from 'src/Settings/SettingsStore';
import {
	TabCandySettingTab,
	TabCandySettings,
} from 'src/Settings/Settings';
import { normalizeSettings } from 'src/Settings/normalizeSettings';
import { listBackgroundFilesInFolder } from 'src/services/backgrounds';

/**
 * This allows a "live-reload" of Obsidian when developing the plugin.
 * Any changes to the code will force reload Obsidian.
 */
if (process.env.NODE_ENV === 'development') {
	new EventSource('http://127.0.0.1:8000/esbuild').addEventListener(
		'change',
		() => location.reload()
	);
}

export default class TabCandyPlugin extends Plugin {
	// Populated in onload(), which Obsidian guarantees resolves before any
	// other plugin lifecycle method (registerView, addSettingTab, etc.) runs -
	// safe to assert definite assignment rather than union with `undefined`
	// and push null-checks into every consumer.
	settingsStore!: SettingsStore;

	// Obsidian's own Plugin base class declares `settings?: unknown` as a
	// plain field (see obsidian.d.ts), so it can't be overridden with a
	// getter here (TS2611: property/accessor kind mismatch). Instead this
	// stays a plain field, kept in sync by subscribing to settingsStore in
	// onload() below - purely a read convenience so the many pre-existing
	// `this.plugin.settings.X` reads throughout src/Settings/Settings.ts
	// and elsewhere didn't all need rewriting to `this.plugin.settingsStore.
	// get().X`. Writes must go through settingsStore.update(), never by
	// assigning to this field directly.
	settings!: TabCandySettings;

	async onload() {
		await this.loadSettings();

		this.settings = this.settingsStore.get();
		this.settingsStore.subscribe((settings) => {
			this.settings = settings;
		});

		this.versionCheck();

		// If a vault-relative backgrounds folder is already configured,
		// refresh the list of synced files on every load/reload/restart -
		// same behavior the old OS-folder sync had, minus the Node fs
		// dependency and the desktop-only restriction.
		await this.syncBackgroundsFolder();

		this.registerView(
			TAB_CANDY_VIEW_TYPE,
			(leaf) =>
				new TabCandyView(this.app, this.settingsStore, leaf, this)
		);

		this.addSettingTab(new TabCandySettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on(
				'layout-change',
				this.onLayoutChange.bind(this)
			)
		);

		if (process.env.NODE_ENV === 'development') {
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
	 * Load data from disk (data.json in the plugin folder), normalize it
	 * against defaults and validation rules (normalizeSettings.ts), and
	 * construct the typed settings store around the result. Trusting raw
	 * loadData() output directly (the old `Object.assign({}, DEFAULT_
	 * SETTINGS, data)`) had no enum checking or schema validation at all;
	 * normalizeSettings() is what actually enforces that now.
	 */
	async loadSettings() {
		const data = (await this.loadData()) ?? {};
		const normalized = normalizeSettings(data);
		this.settingsStore = new SettingsStore(
			normalized,
			(settings) => this.saveData(settings)
		);
	}

	/**
	 * Re-scan the configured vault-relative backgrounds folder and refresh
	 * settings.backgroundFiles. Thin plugin-lifecycle wrapper around
	 * src/services/backgrounds.ts's actual discovery logic - safe to call
	 * repeatedly (on load, on a settings change, or from the "Sync now"
	 * button), and safe to call with no folder configured (resolves to an
	 * empty list rather than throwing).
	 */
	async syncBackgroundsFolder() {
		const backgroundFiles = await listBackgroundFilesInFolder(
			this.app,
			this.settings.backgroundsFolder
		);
		await this.settingsStore.update({ backgroundFiles });
	}

	/**
	 * Check the local plugin version against github. If there is a new version, notify the user.
	 */
	async versionCheck() {
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

	/**
	 * Hijack new tabs and show Tab Candy
	 */
	private onLayoutChange(): void {
		const leaf = this.app.workspace.getMostRecentLeaf();
		if (leaf?.getViewState().type === 'empty') {
			leaf.setViewState({
				type: TAB_CANDY_VIEW_TYPE,
			});
		}
	}

	/**
	 * Check if the choosen provider is enabled
	 * If yes: open it by using executeCommandById
	 * If no: Notice the user and tell them to enable it in the settings
	 */
	openSwitcherCommand(command: string): void {
		const pluginID = command.split(':')[0];
		//@ts-ignore
		const { plugins } = this.app.plugins;
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