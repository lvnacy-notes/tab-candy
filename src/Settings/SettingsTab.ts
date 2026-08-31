import { getBookmarkGroups } from '../services/bookmarks';
import TabCandyPlugin from '../../main';
import {
	App,
	PluginSettingTab,
	Setting,
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
import ConfirmModal from '../ui/modals/ConfirmModal';
import ChooseImageSuggestModal from '../ui/modals/ChooseImageSuggestModal';
import ChooseBackgroundFolderModal from '../ui/modals/ChooseBackgroundFolderModal';
import {
	filterExistingFiles,
	getBackgroundResourcePath,
	syncBackgroundsFolder,
} from '../services/backgrounds';
import isEnumValue from '../utils/isEnumValue';
import debounce from '../utils/debounce';

/**
 * Capitalizes the first letter of a string. The only consumer is the
 * background theme dropdown's option labels below, so this stays local
 * rather than living as its own shared utility.
 */
const capitalizeFirstLetter = (string: string) =>
	string.charAt(0).toUpperCase() + string.slice(1);

class TabCandySettingTab extends PluginSettingTab {
	plugin: TabCandyPlugin;

	// Bound once in the constructor rather than created fresh inside
	// display() (which reruns on every setting change), so debounced
	// keystrokes across a redraw still collapse into the same timer
	// instead of each redraw silently starting a new one.
	private readonly debouncedUpdateSettings: (
		patch: Partial<TabCandySettings>
	) => void;

	constructor(app: App, plugin: TabCandyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.debouncedUpdateSettings = debounce(
			(patch: Partial<TabCandySettings>) => {
				this.plugin.settingsStore.update(patch);
			},
			500
		);
	}

	/**
	 * Update settings through the typed store and, if requested, redraw the
	 * settings tab.
	 */
	private async updateSettings(
		patch: Partial<TabCandySettings>,
		options: { redraw?: boolean } = {}
	): Promise<void> {
		await this.plugin.settingsStore.update(patch);
		if (options.redraw) {
			this.display();
		}
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		/****************************************
		 * New tab behavior settings
		 ***************************************/
		new Setting(containerEl).setHeading().setName(`New tab behavior`);

		new Setting(containerEl)
			.setName('Replace new empty tabs')
			.setDesc(
				`Automatically show Tab Candy whenever an empty new tab is opened. Turn this off to only open Tab Candy on demand, via the "Open Tab Candy" command.`
			)
			.addToggle((component) => {
				component.setValue(
					this.plugin.settings.replaceEmptyTabsWithTabCandy
				);
				component.onChange((value) => {
					this.updateSettings({
						replaceEmptyTabsWithTabCandy: value,
					});
				});
			});

		/****************************************
		 * Background settings
		 ***************************************/
		new Setting(containerEl).setHeading().setName(`Background settings`);

		new Setting(containerEl)
			.setName('Background theme')
			.setDesc(
				`What theme would you like to utilize for the random backgrounds? "Seasons and Holidays" will use a different tag depending on the time of the year. Custom will allow you to input your own url. Local will use the local images imported below.`
			)
			.addDropdown((component) => {
				Object.values(BackgroundTheme).forEach((theme) => {
					component.addOption(theme, capitalizeFirstLetter(theme));
				});

				component.setValue(this.plugin.settings.backgroundTheme);

				component.onChange((value) => {
					if (!isEnumValue(BackgroundTheme, value)) {return;}
					this.updateSettings(
						{ backgroundTheme: value },
						{ redraw: true }
					);
				});
			});

		if (this.plugin.settings.backgroundTheme === BackgroundTheme.CUSTOM) {
			new Setting(containerEl)
				.setName('Custom background url')
				.setDesc(`What url should be used for the background image?`)
				.addText((component) => {
					component.setValue(this.plugin.settings.customBackground);
					component.onChange((value) => {
						this.debouncedUpdateSettings({
							customBackground: value,
						});
					});
				});
		}

		const backgroundsFolderSetting = new Setting(containerEl)
			.setName('Local background images folder')
			.setDesc(
				`A folder inside your vault to sync background images from (not including subfolders). Supports jpg/jpeg/png/webp/gif. Works on desktop and mobile.`
			);

		backgroundsFolderSetting.addText((component) => {
			component.setPlaceholder('e.g. Assets/Tab Candy');
			component.setValue(this.plugin.settings.backgroundsFolder);
			component.onChange((value) => {
				this.debouncedUpdateSettings({ backgroundsFolder: value });
			});
		});

		backgroundsFolderSetting.addButton((component) => {
			component.setButtonText('Browse');
			component.setTooltip('Choose a folder from your vault');
			component.onClick(() => {
				new ChooseBackgroundFolderModal(this.app, async (folder) => {
					await this.updateSettings({
						backgroundsFolder: folder.path,
					});
					await syncBackgroundsFolder(
						this.app,
						this.plugin.settingsStore
					);
					this.display();
				}).open();
			});
		});

		backgroundsFolderSetting.addButton((component) => {
			component.setButtonText('Sync now');
			component.setTooltip(
				'Re-scan the folder above and refresh the local backgrounds list'
			);
			component.onClick(async () => {
				await syncBackgroundsFolder(this.app, this.plugin.settingsStore);
				this.display();
			});
		});

		const localBackgroundImagesSetting = new Setting(containerEl).setName(
			'Local background images'
		).setDesc(``);

		localBackgroundImagesSetting.addButton((component) => {
			component.setButtonText('Add vault image');
			component.onClick(() => {
				// Stores the picked file's vault-relative path, resolved to a
				// displayable URL at render time via getBackgroundResourcePath().
				new ChooseImageSuggestModal(this.app, (result) => {
					if (
						this.plugin.settings.manualBackgroundFiles.includes(
							result.path
						)
					) {
						return;
					}
					this.updateSettings(
						{
							manualBackgroundFiles: [
								...this.plugin.settings.manualBackgroundFiles,
								result.path,
							],
						},
						{ redraw: true }
					);
				}).open();
			});
		});

		// Filtered defensively at render time rather than trusting settings
		// as-is: a file recorded here can be deleted or renamed outside of
		// a vault event the plugin caught (most commonly, while Obsidian
		// wasn't running to see the event at all). main.ts prunes
		// manualBackgroundFiles for real - persisting the result - once on
		// every load and live on delete/rename events while running; this
		// is a cheap best-effort display-only pass for whatever a slow-to-
		// arrive prune hasn't caught up with yet, not a substitute for it.
		const existingManualBackgroundFiles = filterExistingFiles(
			this.app,
			this.plugin.settings.manualBackgroundFiles
		);

		if (existingManualBackgroundFiles.length) {
			const manualBackgroundsDiv = containerEl.createDiv({
				cls: 'tabcandy-settings-localbackgrounds',
			});

			existingManualBackgroundFiles.forEach((filePath) => {
				const backgroundDiv = manualBackgroundsDiv.createDiv({
					cls: 'tabcandy-settings-localbackgrounds-background',
				});
				backgroundDiv.createEl('img', {
					attr: {
						src: getBackgroundResourcePath(this.app, filePath),
						title: filePath,
					},
				});
				backgroundDiv.createEl('button', {
					text: 'x',
					cls: 'tabcandy-settings-localbackgrounds-background-delete',
				});
				backgroundDiv.addEventListener('click', () => {
					new ConfirmModal(
						this.app,
						() => {
							this.updateSettings(
								{
									manualBackgroundFiles:
										this.plugin.settings.manualBackgroundFiles.filter(
											(path) => path !== filePath
										),
								},
								{ redraw: true }
							);
						},
						'Remove background',
						`Are you sure?`,
						'Remove'
					).open();
				});
			});
		}

		const existingBackgroundFiles = filterExistingFiles(
			this.app,
			this.plugin.settings.backgroundFiles
		);

		if (existingBackgroundFiles.length) {
			const syncedBackgroundsDiv = containerEl.createDiv({
				cls: 'tabcandy-settings-localbackgrounds',
			});

			existingBackgroundFiles.forEach((filePath) => {
				const backgroundDiv = syncedBackgroundsDiv.createDiv({
					cls: 'tabcandy-settings-localbackgrounds-background',
				});
				backgroundDiv.createEl('img', {
					attr: {
						src: getBackgroundResourcePath(this.app, filePath),
						title: filePath,
					},
				});
			});
		}

		/****************************************
		 * Search settings
		 ***************************************/
		new Setting(containerEl).setHeading().setName(`Search settings`);

		new Setting(containerEl)
			.setName('Show top left search button')
			.setDesc(
				`Should the search button at the top left of the new tab screen be displayed?`
			)
			.addToggle((component) => {
				component.setValue(
					this.plugin.settings.showTopLeftSearchButton
				);
				component.onChange((value) => {
					this.updateSettings(
						{ showTopLeftSearchButton: value },
						{ redraw: true }
					);
				});
			});

		new Setting(containerEl)
			.setName('Top left search provider')
			.setDesc(
				`Which plugin should be utilized for search when clicking the top left button?`
			)
			.setClass('search-provider')
			.addText((component) => {
				component.setValue(
					this.plugin.settings.topLeftSearchProvider.display
				);
				component.setDisabled(true);
			})
			.addButton((component) => {
				component.setButtonText('Change');
				component.setTooltip('Choose search provider');
				component.onClick(() => {
					new ChooseSearchProvider(
						this.app,
						this.plugin.settings,
						(result) => {
							this.updateSettings(
								{ topLeftSearchProvider: result },
								{ redraw: true }
							);
						}
					).open();
				});
			});

		new Setting(containerEl)
			.setName('Show inline search')
			.setDesc(
				`Should the inline search in the middle of the new tab screen be displayed?`
			)
			.addToggle((component) => {
				component.setValue(this.plugin.settings.showInlineSearch);
				component.onChange((value) => {
					this.updateSettings(
						{ showInlineSearch: value },
						{ redraw: true }
					);
				});
			});

		new Setting(containerEl)
			.setName('Inline search provider')
			.setDesc(
				`Which plugin should be utilized for search when clicking the middle of the screen button?`
			)
			.setClass('search-provider')

			.addText((component) => {
				component
					.setValue(this.plugin.settings.inlineSearchProvider.display)
					.setDisabled(true);
			})
			.addButton((component) => {
				component.setButtonText('Change');
				component.setTooltip('Choose search provider');
				component.onClick(() => {
					new ChooseSearchProvider(
						this.app,
						this.plugin.settings,
						(result) => {
							this.updateSettings(
								{ inlineSearchProvider: result },
								{ redraw: true }
							);
						}
					).open();
				});
			});

		/****************************************
		 * Time settings
		 ***************************************/
		new Setting(containerEl).setHeading().setName(`Time settings`);

		new Setting(containerEl)
			.setName('Show time')
			.setDesc(
				`Should the time in the middle of the new tab screen be displayed?`
			)
			.addToggle((component) => {
				component.setValue(this.plugin.settings.showTime);
				component.onChange((value) => {
					this.updateSettings({ showTime: value }, { redraw: true });
				});
			});

		new Setting(containerEl)
			.setName('Time format')
			.setDesc(`Should the time be in 12-hour format or 24-hour format?`)
			.addDropdown((component) => {
				component.addOption(
					TIME_FORMAT.TWELVE_HOUR,
					TIME_FORMAT.TWELVE_HOUR
				);
				component.addOption(
					TIME_FORMAT.TWENTY_FOUR_HOUR,
					TIME_FORMAT.TWENTY_FOUR_HOUR
				);

				component.setValue(this.plugin.settings.timeFormat);

				component.onChange((value) => {
					if (!isEnumValue(TIME_FORMAT, value)) {return;}
					this.updateSettings({ timeFormat: value }, { redraw: true });
				});
			});

		/****************************************
		 * Greeting settings
		 ***************************************/
		new Setting(containerEl).setHeading().setName(`Greeting settings`);

		new Setting(containerEl)
			.setName('Show greeting')
			.setDesc(
				`Should the greeting in the middle of the new tab screen be displayed?`
			)
			.addToggle((component) => {
				component.setValue(this.plugin.settings.showGreeting);
				component.onChange((value) => {
					this.updateSettings(
						{ showGreeting: value },
						{ redraw: true }
					);
				});
			});

		new Setting(containerEl)
			.setName('Greeting text')
			.setDesc(
				`What text should be displayed as a greeting? You can use the {{greeting}} to add a greeting based on the time of the day. (E.g. Good morning)`
			)
			.addText((component) => {
				component.setValue(this.plugin.settings.greetingText);
				component.onChange((value) => {
					this.debouncedUpdateSettings({ greetingText: value });
				});
			});

		/****************************************
		 * Recent file settings
		 ***************************************/
		new Setting(containerEl).setHeading().setName(`Recent file settings`);

		new Setting(containerEl)
			.setName('Show recent files')
			.setDesc(
				`Should recent files in the middle of the new tab screen be displayed?`
			)
			.addToggle((component) => {
				component.setValue(this.plugin.settings.showRecentFiles);
				component.onChange((value) => {
					this.updateSettings(
						{ showRecentFiles: value },
						{ redraw: true }
					);
				});
			});

		/****************************************
		 * Bookmark settings
		 ***************************************/
		new Setting(containerEl).setHeading().setName(`Bookmark settings`);

		new Setting(containerEl)
			.setName('Show bookmarks')
			.setDesc(
				`Should bookmarks in the middle of the new tab screen be displayed?`
			)
			.addToggle((component) => {
				component.setValue(this.plugin.settings.showBookmarks);
				component.onChange((value) => {
					this.updateSettings(
						{ showBookmarks: value },
						{ redraw: true }
					);
				});
			});

		new Setting(containerEl)
			.setName('Bookmarks source')
			.setDesc(
				`Should all bookmarks be displayed or bookmarks from a specific group?`
			)
			.addDropdown((component) => {
				component.addOption(BOOKMARK_SOURCE.ALL, 'All bookmarks');
				component.addOption(
					BOOKMARK_SOURCE.GROUP,
					'Bookmarks from group'
				);

				component.setValue(this.plugin.settings.bookmarkSource);
				component.onChange((value) => {
					if (!isEnumValue(BOOKMARK_SOURCE, value)) {return;}
					this.updateSettings(
						{ bookmarkSource: value },
						{ redraw: true }
					);
				});
			});

		if (this.plugin.settings.bookmarkSource === BOOKMARK_SOURCE.GROUP) {
			new Setting(containerEl)
				.setName('Bookmarks group')
				.setDesc(`Which group should bookmarks be pulled from?`)
				.addDropdown((component) => {
					getBookmarkGroups(this.app).forEach((group) => {
						component.addOption(group.title, group.path);
					});

					component.setValue(this.plugin.settings.bookmarkGroup);
					component.onChange((value) => {
						this.updateSettings(
							{ bookmarkGroup: value },
							{ redraw: true }
						);
					});
				});
		}

		/****************************************
		 * Quote settings
		 ***************************************/
		new Setting(containerEl).setHeading().setName(`Quote settings`);

		new Setting(containerEl)
			.setName('Show quote')
			.setDesc(
				`Should the quote at the bottom of the new tab screen be displayed?`
			)
			.addToggle((component) => {
				component.setValue(this.plugin.settings.showQuote);
				component.onChange((value) => {
					this.updateSettings({ showQuote: value }, { redraw: true });
				});
			});

		new Setting(containerEl)
			.setName('Quote source')
			.setDesc(
				`Where should quotes be pulled from? You can use either built in quotes, your own quotes, or a combination of both.`
			)
			.addDropdown((component) => {
				Object.values(QUOTE_SOURCE).forEach((source) => {
					component.addOption(source, source);
				});

				component.setValue(this.plugin.settings.quoteSource);
				component.onChange((value) => {
					if (!isEnumValue(QUOTE_SOURCE, value)) {return;}
					this.updateSettings({ quoteSource: value }, { redraw: true });
				});
			});

		new Setting(containerEl)
			.setName('Custom quotes')
			.setDesc(`${this.plugin.settings.customQuotes.length} quotes`)
			.addButton((component) => {
				component.setButtonText('Edit');

				component.onClick(() => {
					new CustomQuotesModal(
						this.plugin,
						(modifiedCustomQuotes: CustomQuote[]) => {
							this.updateSettings(
								{ customQuotes: modifiedCustomQuotes },
								{ redraw: true }
							);
						}
					).open();
				});
			});
	}
}

export default TabCandySettingTab;
