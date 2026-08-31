import {
	App,
	EventRef,
	WorkspaceLeaf
} from 'obsidian';
import { TAB_CANDY_VIEW_TYPE } from '../TabCandyView';
import SettingsStore from '../settings/SettingsStore';

/**
 * Points `leaf` at the Tab Candy view, replacing whatever it currently
 * shows. Shared by activateView() (creating/reusing a leaf on demand) and
 * registerNewTabHijack() (converting a leaf that already exists) so both
 * paths funnel through one place that knows how to turn a leaf into Tab
 * Candy, rather than each constructing the same setViewState() call
 * separately.
 */
async function setLeafToTabCandy(leaf: WorkspaceLeaf): Promise<void> {
	await leaf.setViewState({
		type: TAB_CANDY_VIEW_TYPE,
		active: true,
	});
}

/**
 * The one supported way to summon Tab Candy on demand - backs the "Open
 * Tab Candy" command. Checks `workspace.getLeavesOfType()` first and
 * reuses an existing Tab Candy leaf if one is already open anywhere in the
 * workspace, rather than spawning a duplicate; only creates a new leaf as
 * a fallback when none exists yet.
 */
export async function activateView(app: App): Promise<void> {
	const { workspace } = app;
	const existing = workspace.getLeavesOfType(TAB_CANDY_VIEW_TYPE)[0];
	if (existing) {
		await workspace.revealLeaf(existing);
		return;
	}

	const leaf = workspace.getLeaf(true);
	await setLeafToTabCandy(leaf);
	await workspace.revealLeaf(leaf);
}

/**
 * Registers the opt-in "replace new empty tabs automatically" behavior
 * (settings.replaceEmptyTabsWithTabCandy, defaulted on). Runs on every
 * workspace `layout-change` event; when the most-recently-used leaf is an
 * empty pane, converts that specific leaf via the same setLeafToTabCandy()
 * helper activateView() uses, rather than duplicating the setViewState()
 * call inline.
 *
 * Deliberately does NOT route through activateView()'s "reuse an existing
 * Tab Candy leaf" check - this handler's job is specifically to fill the
 * empty leaf that just appeared, and revealing a different, already-open
 * Tab Candy tab instead would leave that new empty tab empty, which
 * undermines the whole point of the setting. See REFACTOR-DECISIONS.md's
 * activation-vs-hijacking entry for the full reasoning and the open
 * question flagged there about this trade-off.
 *
 * `registerEvent` is passed in rather than this function registering
 * directly on `app.workspace`, matching `registerBackgroundVaultWatchers()`'s
 * convention in `src/services/backgrounds.ts` - the caller's own
 * `Component.registerEvent()` (auto-cleaned up on unload) is what actually
 * owns the returned `EventRef`, not this function.
 */
export function registerNewTabHijack(
	app: App,
	settingsStore: SettingsStore,
	registerEvent: (eventRef: EventRef) => void
): void {
	registerEvent(
		app.workspace.on('layout-change', () => {
			if (!settingsStore.get().replaceEmptyTabsWithTabCandy) {
				return;
			}

			const leaf = app.workspace.getMostRecentLeaf();
			if (leaf?.getViewState().type === 'empty') {
				void setLeafToTabCandy(leaf);
			}
		})
	);
}
