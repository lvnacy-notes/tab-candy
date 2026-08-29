import {
	App,
	FuzzySuggestModal,
	TFolder
} from 'obsidian';

/**
 * Recursively collects every non-root folder in the vault, starting from
 * `root`. Implemented by hand over `TFolder.children` (public, stable since
 * Obsidian 0.9.7) rather than the newer `Vault.getAllFolders()` convenience
 * method, which requires Obsidian 1.6.6 - past this project's locked
 * minAppVersion of 0.15.0 (§0). Folder listing here is always recursive
 * regardless of the non-recursive §0 decision for background-image
 * discovery - that decision is about which *images* count as configured,
 * not about which folders are choosable as a destination.
 */
function collectFolders(root: TFolder): TFolder[] {
	const folders: TFolder[] = [];

	for (const child of root.children) {
		if (child instanceof TFolder) {
			folders.push(child);
			folders.push(...collectFolders(child));
		}
	}

	return folders;
}

/**
 * Vault-folder picker for the "Local background images folder" setting,
 * letting the user pick an existing vault folder instead of typing a
 * vault-relative path by hand - so a typo can't silently sync zero files.
 *
 * The vault root itself is deliberately excluded from the list.
 * `backgroundsFolder` uses an empty string to mean "no folder configured"
 * throughout this codebase (see `listBackgroundFilesInFolder()`'s early
 * return), and the root folder's own path is also an empty string -
 * offering it as a selectable option would make "sync from the vault root"
 * indistinguishable from "nothing configured" without adding a whole
 * separate sentinel value for a rarely-needed case.
 */
class ChooseBackgroundFolderModal extends FuzzySuggestModal<TFolder> {
	onSubmit: (result: TFolder) => void;

	constructor(app: App, onSubmit: (result: TFolder) => void) {
		super(app);
		this.onSubmit = onSubmit;
		this.setPlaceholder('Choose a folder to sync background images from');
	}

	getItems(): TFolder[] {
		return collectFolders(this.app.vault.getRoot());
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	onChooseItem(item: TFolder): void {
		this.onSubmit(item);
		this.close();
	}
}

export default ChooseBackgroundFolderModal;

