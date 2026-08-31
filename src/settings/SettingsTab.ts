import { getBookmarkGroups } from '../services/bookmarks';
import TabCandyPlugin from '../../main';
import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
} from 'obsidian';
import ChooseSearchProvider from '../ui/modals/ChooseSearchProvider';
import CustomQuotesModal from '../ui/modals/CustomQuotesModal';
import {
	BOOKMARK_SOURCE,
	BackgroundTheme,
	CustomQuote,
	QUOTE_SOURCE,
	TIME_FORMAT,
	TabCandySettings,
} from '../types';
import ChooseImageSuggestModal from '../ui/modals/ChooseImageSuggestModal';
import {
	filterExistingFiles,
	getBackgroundResourcePath,
	syncBackgroundsFolder,
} from '../services/backgrounds';
import debounce from '../utils/debounce';

/**
 * Capitalizes the first letter of a string. The only consumer is the
 * background theme dropdown's option labels below, so this stays local
 * rather than living as its own shared utility.
 */
const capitalizeFirstLetter = (string: string) =>
	string.charAt(0).toUpperCase() + string.slice(1);

// Settings whose control commits a value on every keystroke (raw text
// input, not a discrete pick like a toggle/dropdown/folder suggestion).
// Routed through the debounced writer so typing doesn't fire a disk write
// per character; everything else writes immediately.
const DEBOUNCED_SETTING_KEYS: ReadonlySet<keyof TabCandySettings> = new Set([
	'customBackground',
	'greetingText',
]);

export default class TabCandySettingTab extends PluginSettingTab {
	plugin: TabCandyPlugin;

	// Bound once in the constructor rather than created fresh inside
	// getSettingDefinitions() (which reruns on every render), so debounced
	// keystrokes across a rerender still collapse into the same timer
	// instead of each rerender silently starting a new one.
	private readonly debouncedUpdateSettings: (
		patch: Partial<TabCandySettings>
	) => void;

	constructor(app: App, plugin: TabCandyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.debouncedUpdateSettings = debounce(
			(patch: Partial<TabCandySettings>) => {
				void this.updateSettings(patch);
			},
			500
		);
	}

	/**
	 * Update settings through the typed store and, if requested, re-render
	 * the settings tab. Persisting to disk can fail (e.g. a disk/permissions
	 * error surfacing from Obsidian's saveData()); that failure is caught
	 * and surfaced here, once, rather than at every call site below.
	 */
	private async updateSettings(
		patch: Partial<TabCandySettings>,
		options: { redraw?: boolean } = {}
	): Promise<void> {
		try {
			await this.plugin.settingsStore.update(patch);
		} catch (error) {
			console.error('Tab Candy: failed to save settings', error);
			new Notice('Tab Candy: failed to save your settings. Please try again.');
			return;
		}
		if (options.redraw) {
			this.update();
		}
	}

	/**
	 * Reads live settings through the store rather than PluginSettingTab's
	 * default (which reads/writes `this.plugin.settings` directly) so a
	 * value never bypasses SettingsStore's single source of truth. The
	 * base class declares this as returning `unknown` (the framework can't
	 * know our settings shape); overriding a method's return type with a
	 * narrower type is sound covariance, so `key`'s indexed-access type
	 * gives an honest, non-cast return type instead.
	 */
	getControlValue(
		key: keyof TabCandySettings
	): TabCandySettings[keyof TabCandySettings] {
		return this.plugin.settingsStore.get()[key];
	}

	/**
	 * Writes live settings through the store rather than PluginSettingTab's
	 * default. The default implementation would mutate `this.plugin.settings`
	 * in place and persist it directly, bypassing SettingsStore.update()'s
	 * subscriber notifications (which the live Tab Candy view depends on to
	 * reflect a settings change without a reload) and its replace-rather-
	 * than-mutate semantics (which React's reference-equality checks depend
	 * on). Text-bearing keys are routed through the debounced writer so
	 * typing doesn't persist on every keystroke; everything else persists
	 * and re-renders immediately, matching every non-debounced call site
	 * this replaces.
	 *
	 * The base class declares `value: unknown` (again, the framework can't
	 * know our settings shape). Every `SettingControl` this file defines is
	 * a toggle, dropdown, text, or folder control, whose values are always
	 * boolean or string - never the array/object-valued settings fields
	 * (manualBackgroundFiles, customQuotes, topLeftSearchProvider, etc.),
	 * which are only ever written via updateSettings() directly from a
	 * modal callback, not through a control's key. Narrowing the override's
	 * parameter to that real union (method parameters are checked
	 * bivariantly, so a narrower override parameter type is accepted) is
	 * an honest reflection of what this method actually receives, and
	 * still requires one cast below - `key`'s type spans every settings
	 * field including the array/object ones `value` can't be - to build
	 * the patch object itself.
	 */
	setControlValue(
		key: keyof TabCandySettings,
		value: boolean | string
	): void | Promise<void> {
		const patch = { [key]: value } as Partial<TabCandySettings>;

		if (DEBOUNCED_SETTING_KEYS.has(key)) {
			this.debouncedUpdateSettings(patch);
			return;
		}
		return this.updateSettings(patch, { redraw: true });
	}

	getSettingDefinitions(): SettingDefinitionItem<
		keyof TabCandySettings
	>[] {
		// Filtered defensively at render time rather than trusting settings
		// as-is: a file recorded here can be deleted or renamed outside of
		// a vault event the plugin caught (most commonly, while Obsidian
		// wasn't running to see the event at all). main.ts prunes both
		// manualBackgroundFiles and backgroundFiles for real - persisting
		// the result - once on every load and live on delete/rename events
		// while running; this is a cheap best-effort display-only pass for
		// whatever a slow-to-arrive prune hasn't caught up with yet, not a
		// substitute for it.
		const existingManualBackgroundFiles = filterExistingFiles(
			this.app,
			this.plugin.settings.manualBackgroundFiles
		);
		const existingBackgroundFiles = filterExistingFiles(
			this.app,
			this.plugin.settings.backgroundFiles
		);

		return [
			{
				type: 'group',
				heading: 'New tab behavior',
				items: [
					{
						name: 'Replace new empty tabs',
						desc: `Automatically show Tab Candy whenever an empty new tab is opened. Turn this off to only open Tab Candy on demand, via the "open new tab" command.`,
						control: {
							type: 'toggle',
							key: 'replaceEmptyTabsWithTabCandy',
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Background settings',
				items: [
					{
						name: 'Background theme',
						desc: `What theme would you like to utilize for the random backgrounds? "seasons and holidays" will use a different tag depending on the time of the year. Custom will allow you to input your own URL. Local will use the local images imported below.`,
						control: {
							type: 'dropdown',
							key: 'backgroundTheme',
							options: Object.fromEntries(
								Object.values(BackgroundTheme).map((theme) => [
									theme,
									capitalizeFirstLetter(theme),
								])
							),
						},
					},
					{
						name: 'Custom background URL',
						desc: `What URL should be used for the background image?`,
						visible: () =>
							this.plugin.settings.backgroundTheme ===
							BackgroundTheme.CUSTOM,
						control: {
							type: 'text',
							key: 'customBackground',
						},
					},
					{
						name: 'Local background images folder',
						desc: `A folder inside your vault to sync background images from (not including subfolders). Supports JPG/JPEG/PNG/webp/GIF. Works on desktop and mobile.`,
						control: {
							type: 'folder',
							key: 'backgroundsFolder',
							placeholder: 'E.g. Assets/Tab Candy',
							includeRoot: true,
						},
					},
					{
						name: 'Sync now',
						desc: 'Re-scan the folder above and refresh the local backgrounds list',
						action: () => {
							void (async () => {
								await syncBackgroundsFolder(
									this.app,
									this.plugin.settingsStore
								);
								this.update();
							})();
						},
					},
				],
			},
			{
				type: 'group',
				heading: '',
				visible: () => existingBackgroundFiles.length > 0,
				items: existingBackgroundFiles.map((filePath) => ({
					name: '',
					render: (setting: Setting) => {
						setting.settingEl.addClass(
							'tabcandy-settings-localbackgrounds-background'
						);
						setting.controlEl.createEl('img', {
							cls: 'tabcandy-settings-localbackgrounds-background-image',
							attr: {
								src: getBackgroundResourcePath(this.app, filePath),
								title: filePath,
							},
						});
					},
				})),
			},
			{
				type: 'list',
				heading: 'Local background images',
				addItem: {
					name: 'Add vault image',
					action: () => {
						// Stores the picked file's vault-relative path,
						// resolved to a displayable URL at render time via
						// getBackgroundResourcePath(). Kept as a modal
						// rather than the native `file` control type since
						// this appends to an array field, not a single
						// scalar settings key.
						new ChooseImageSuggestModal(this.app, (result) => {
							if (
								this.plugin.settings.manualBackgroundFiles.includes(
									result.path
								)
							) {
								return;
							}
							void this.updateSettings(
								{
									manualBackgroundFiles: [
										...this.plugin.settings
											.manualBackgroundFiles,
										result.path,
									],
								},
								{ redraw: true }
							);
						}).open();
					},
				},
				onDelete: (index) => {
					// Resolved by value against the same filtered array used
					// to build `items` below, rather than trusting `index`
					// against the raw settings array directly - the two can
					// diverge if a recorded file no longer exists and was
					// filtered out of what's actually rendered.
					const filePath = existingManualBackgroundFiles[index];
					if (!filePath) {return;}
					void this.updateSettings(
						{
							manualBackgroundFiles:
								this.plugin.settings.manualBackgroundFiles.filter(
									(path) => path !== filePath
								),
						},
						{ redraw: true }
					);
				},
				items: existingManualBackgroundFiles.map((filePath) => ({
					name: '',
					render: (setting: Setting) => {
						setting.settingEl.addClass(
							'tabcandy-settings-localbackgrounds-background'
						);
						setting.controlEl.createEl('img', {
							cls: 'tabcandy-settings-localbackgrounds-background-image',
							attr: {
								src: getBackgroundResourcePath(this.app, filePath),
								title: filePath,
							},
						});
					},
				})),
			},
			{
				type: 'group',
				heading: 'Search settings',
				items: [
					{
						name: 'Show top left search button',
						desc: `Should the search button at the top left of the new tab screen be displayed?`,
						control: {
							type: 'toggle',
							key: 'showTopLeftSearchButton',
						},
					},
					{
						name: 'Top left search provider',
						desc: `Which plugin should be utilized for search when clicking the top left button? Currently: ${this.plugin.settings.topLeftSearchProvider.display}`,
						action: () => {
							new ChooseSearchProvider(
								this.app,
								this.plugin.settings,
								(result) => {
									void this.updateSettings(
										{ topLeftSearchProvider: result },
										{ redraw: true }
									);
								}
							).open();
						},
					},
					{
						name: 'Show inline search',
						desc: `Should the inline search in the middle of the new tab screen be displayed?`,
						control: {
							type: 'toggle',
							key: 'showInlineSearch',
						},
					},
					{
						name: 'Inline search provider',
						desc: `Which plugin should be utilized for search when clicking the middle of the screen button? Currently: ${this.plugin.settings.inlineSearchProvider.display}`,
						action: () => {
							new ChooseSearchProvider(
								this.app,
								this.plugin.settings,
								(result) => {
									void this.updateSettings(
										{ inlineSearchProvider: result },
										{ redraw: true }
									);
								}
							).open();
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Time settings',
				items: [
					{
						name: 'Show time',
						desc: `Should the time in the middle of the new tab screen be displayed?`,
						control: {
							type: 'toggle',
							key: 'showTime',
						},
					},
					{
						name: 'Time format',
						desc: `Should the time be in 12-hour format or 24-hour format?`,
						control: {
							type: 'dropdown',
							key: 'timeFormat',
							options: {
								[TIME_FORMAT.TWELVE_HOUR]: TIME_FORMAT.TWELVE_HOUR,
								[TIME_FORMAT.TWENTY_FOUR_HOUR]:
									TIME_FORMAT.TWENTY_FOUR_HOUR,
							},
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Greeting settings',
				items: [
					{
						name: 'Show greeting',
						desc: `Should the greeting in the middle of the new tab screen be displayed?`,
						control: {
							type: 'toggle',
							key: 'showGreeting',
						},
					},
					{
						name: 'Greeting text',
						desc: `What text should be displayed as a greeting? You can use the {{greeting}} to add a greeting based on the time of the day. (E.g. Good morning)`,
						control: {
							type: 'text',
							key: 'greetingText',
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Recent file settings',
				items: [
					{
						name: 'Show recent files',
						desc: `Should recent files in the middle of the new tab screen be displayed?`,
						control: {
							type: 'toggle',
							key: 'showRecentFiles',
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Bookmark settings',
				items: [
					{
						name: 'Show bookmarks',
						desc: `Should bookmarks in the middle of the new tab screen be displayed?`,
						control: {
							type: 'toggle',
							key: 'showBookmarks',
						},
					},
					{
						name: 'Bookmarks source',
						desc: `Should all bookmarks be displayed or bookmarks from a specific group?`,
						control: {
							type: 'dropdown',
							key: 'bookmarkSource',
							options: {
								[BOOKMARK_SOURCE.ALL]: 'All bookmarks',
								[BOOKMARK_SOURCE.GROUP]: 'Bookmarks from group',
							},
						},
					},
					{
						name: 'Bookmarks group',
						desc: `Which group should bookmarks be pulled from?`,
						visible: () =>
							this.plugin.settings.bookmarkSource ===
							BOOKMARK_SOURCE.GROUP,
						control: {
							type: 'dropdown',
							key: 'bookmarkGroup',
							options: Object.fromEntries(
								getBookmarkGroups(this.app).map((group) => [
									group.title,
									group.path,
								])
							),
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Quote settings',
				items: [
					{
						name: 'Show quote',
						desc: `Should the quote at the bottom of the new tab screen be displayed?`,
						control: {
							type: 'toggle',
							key: 'showQuote',
						},
					},
					{
						name: 'Quote source',
						desc: `Where should quotes be pulled from? You can use either built in quotes, your own quotes, or a combination of both.`,
						control: {
							type: 'dropdown',
							key: 'quoteSource',
							options: Object.fromEntries(
								Object.values(QUOTE_SOURCE).map((source) => [
									source,
									source,
								])
							),
						},
					},
					{
						name: 'Custom quotes',
						desc: `${this.plugin.settings.customQuotes.length} quotes`,
						action: () => {
							new CustomQuotesModal(
								this.plugin,
								(modifiedCustomQuotes: CustomQuote[]) => {
									void this.updateSettings(
										{ customQuotes: modifiedCustomQuotes },
										{ redraw: true }
									);
								}
							).open();
						},
					},
				],
			},
		];
	}
}
