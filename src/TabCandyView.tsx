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
		// Obsidian's `View.navigation` defaults to a static, non-navigable
		// view (the same bucket as the file explorer or calendar pane) -
		// meaning core features that ask "give me an existing leaf that CAN
		// be navigated" (this is literally how the file explorer picks
		// where to open a file: Workspace.getLeaf(false), whose own doc
		// comment says exactly that) skip right past this leaf as
		// ineligible. A "new tab" view is the opposite of static - it's
		// meant to be navigated away from the moment a note is picked,
		// same as a browser's new-tab page - so it must opt in explicitly.
		this.navigation = true;
	}

	getDisplayText() {
		return 'New tab';
	}

	getIcon() {
		return '';
	}

	getViewType() {
		return TAB_CANDY_VIEW_TYPE;
	}

	// Neither override awaits anything - both are synchronous work - but
	// ItemView's own type declares onOpen()/onClose() as returning
	// Promise<void> (not Promise<void> | void), so the contract is met
	// with an explicit Promise.resolve() rather than a pointless `async`
	// keyword with nothing to await inside it.
	onOpen(): Promise<void> {
		// Defensive: guards against a stray leftover React root if Obsidian
		// ever calls onOpen() again without a matching onClose() in between
		// (e.g. certain leaf-reuse paths), rather than assuming onOpen()
		// only ever runs once per view instance.
		this.contentEl.empty();

		this.root = createRoot(this.contentEl);
		this.root.render(
			<ReactApp
				app = { this.app }
				settingsStore = { this.settingsStore }
				leaf = { this.leaf }
			/>
		);
		this.containerEl.addClass('tabcandy');

		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;

		return Promise.resolve();
	}
}