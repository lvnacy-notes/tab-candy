import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import ReactApp from './app/App';
import SettingsStore from './settings/SettingsStore';

export const TAB_CANDY_VIEW_TYPE = 'tabcandy-react-view';

export class TabCandyView extends ItemView {
	root: Root | null = null;
	settingsStore: SettingsStore;

	constructor(
		settingsStore: SettingsStore,
		leaf: WorkspaceLeaf
	) {
		super(leaf);
		this.settingsStore = settingsStore;
	}

	getViewType() {
		return TAB_CANDY_VIEW_TYPE;
	}

	getDisplayText() {
		return 'New tab';
	}

	getIcon() {
		return '';
	}

	async onOpen() {
		// Defensive: guards against a stray leftover React root if Obsidian
		// ever calls onOpen() again without a matching onClose() in between
		// (e.g. certain leaf-reuse paths), rather than assuming onOpen()
		// only ever runs once per view instance.
		this.contentEl.empty();

		this.root = createRoot(this.contentEl);
		this.root.render(
			<ReactApp app={this.app} settingsStore={this.settingsStore} />
		);
		this.containerEl.addClass('tabcandy');
	}

	async onClose() {
		this.root?.unmount();
		this.root = null;
	}
}
