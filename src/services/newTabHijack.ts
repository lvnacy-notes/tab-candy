import { App } from 'obsidian';
import { TAB_CANDY_VIEW_TYPE } from '../../Views/ReactView';

/**
 * When the workspace's most recently active leaf is an empty new-tab pane,
 * switches it to the Tab Candy view instead. Intended to run on every
 * workspace `layout-change` event, so opening a new tab shows Tab Candy
 * rather than Obsidian's default empty state.
 */
export function hijackEmptyLeafForNewTab(app: App): void {
	const leaf = app.workspace.getMostRecentLeaf();
	if (leaf?.getViewState().type === 'empty') {
		leaf.setViewState({
			type: TAB_CANDY_VIEW_TYPE,
		});
	}
}
