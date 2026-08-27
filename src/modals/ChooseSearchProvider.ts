import { App, FuzzySuggestModal } from 'obsidian';
import {
	TabCandyPluginSettings,
	SEARCH_PROVIDER,
} from '../../src/Settings/Settings';
import { SearchProvider } from '../Types/Interfaces';

/**
 * This class is used to create a modal to choose a search provider from a list of available search providers
 * Available search providers are defined in SEARCH_PROVIDER
 * Used in TabCandyPluginSettingTab
 */
class ChooseSearchProvider extends FuzzySuggestModal<SearchProvider> {
	settings: TabCandyPluginSettings;
	onSubmit: (result: SearchProvider) => void;

	constructor(
		app: App,
		settings: TabCandyPluginSettings,
		onSubmit: (result: SearchProvider) => void
	) {
		super(app);
		this.settings = settings;
		this.onSubmit = onSubmit;
	}

	getItems(): SearchProvider[] {
		//@ts-ignore
		const allCommands = Object.entries(this.app.commands.commands).filter(
			(pluginId) => SEARCH_PROVIDER.includes(pluginId[0].split(':')[0])
		);
		const searchProviders: SearchProvider[] = [];
		allCommands.forEach((command) => {
			searchProviders.push({
				command: command[0],
				display: (command[1] as any).name,
			});
		});
		return searchProviders;
	}

	getItemText(item: SearchProvider): string {
		return item.display;
	}

	onChooseItem(item: SearchProvider, evt: MouseEvent | KeyboardEvent): void {
		this.onSubmit(item);
		this.close();
	}
}

export default ChooseSearchProvider;
