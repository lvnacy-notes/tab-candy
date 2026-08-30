import { Plugin } from 'obsidian';
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
import {
	pruneMissingManualBackgroundFiles,
	registerBackgroundVaultWatchers,
	syncBackgroundsFolder,
} from 'src/services/backgrounds';
import { checkForPluginUpdates } from 'src/services/versionCheck';
import { activateView, registerNewTabHijack } from 'src/services/newTabHijack';

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

		void checkForPluginUpdates();

		// Refreshes the list of synced files on every load/reload/restart so
		// background images are available immediately, without requiring an
		// explicit "Sync now" click first.
		await syncBackgroundsFolder(this.app, this.settingsStore);

		// Catches deletions/renames of individually-added images that
		// happened while the plugin wasn't loaded to see the vault event
		// (closing Obsidian, editing the vault elsewhere, reopening it -
		// an ordinary flow, not an edge case). Deletions/renames that
		// happen while the plugin is running are instead caught live by
		// the event listeners registered below.
		await pruneMissingManualBackgroundFiles(this.app, this.settingsStore);

		registerBackgroundVaultWatchers(
			this.app,
			this.settingsStore,
			(eventRef) => this.registerEvent(eventRef)
		);

		this.registerView(
			TAB_CANDY_VIEW_TYPE,
			(leaf) => new TabCandyView(this.settingsStore, leaf)
		);

		this.addSettingTab(new TabCandySettingTab(this.app, this));

		this.addCommand({
			id: 'open-tab-candy',
			name: 'Open new tab',
			callback: () => {
				void activateView(this.app);
			},
		});

		registerNewTabHijack(
			this.app,
			this.settingsStore,
			(eventRef) => this.registerEvent(eventRef)
		);
	}

	/**
	 * Load data from disk (data.json in the plugin folder), normalize it
	 * against defaults and validation rules (normalizeSettings.ts), and
	 * construct the typed settings store around the result. normalizeSettings()
	 * enforces enum checking and schema validation on every field.
	 */
	async loadSettings() {
		const data = (await this.loadData()) ?? {};
		const normalized = normalizeSettings(data);
		this.settingsStore = new SettingsStore(
			normalized,
			(settings) => this.saveData(settings)
		);
	}
}