import { App, FuzzySuggestModal } from 'obsidian';
import {
	TabCandySettings,
	SEARCH_PROVIDER,
} from '../../src/Settings/Settings';
import { SearchProvider } from '../Types/Interfaces';
import { listSearchProviderCommands } from '../services/commands';

/**
 * This class is used to create a modal to choose a search provider from a list of available search providers
 * Available search providers are defined in SEARCH_PROVIDER
 * Used in TabCandySettingTab
 */
class ChooseSearchProvider extends FuzzySuggestModal<SearchProvider> {
	settings: TabCandySettings;
	onSubmit: (result: SearchProvider) => void;

	constructor(
		app: App,
		settings: TabCandySettings,
		onSubmit: (result: SearchProvider) => void
	) {
		super(app);
		this.settings = settings;
		this.onSubmit = onSubmit;
	}

	getItems(): SearchProvider[] {
		return listSearchProviderCommands(this.app, SEARCH_PROVIDER);
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
