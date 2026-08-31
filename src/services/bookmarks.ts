import { App, TFile } from 'obsidian';
import { BOOKMARK_SOURCE, TabCandySettings } from '../types';

/**
 * Shape of an entry in the Bookmarks core plugin's item tree. Bookmarks can
 * be files, folders, searches, graphs, or URLs; only "file" and "group" are
 * meaningful here, so every other type is represented by the base shape and
 * skipped wherever items are flattened.
 */
interface BookmarkItemBase {
	type: string;
	title?: string;
}

interface BookmarkFileItem extends BookmarkItemBase {
	type: 'file';
	path: string;
}

interface BookmarkGroupItem extends BookmarkItemBase {
	type: 'group';
	title: string;
	items: BookmarkItem[];
}

type BookmarkItem = BookmarkFileItem | BookmarkGroupItem | BookmarkItemBase;

const isBookmarkFileItem = (item: BookmarkItem): item is BookmarkFileItem =>
	item.type === 'file' && typeof (item as BookmarkFileItem).path === 'string';

const isBookmarkGroupItem = (item: BookmarkItem): item is BookmarkGroupItem =>
	item.type === 'group' && Array.isArray((item as BookmarkGroupItem).items);

/**
 * The Bookmarks core plugin's private, unpublished runtime shape. This
 * interface exists only to give the one cast below a narrow, explicit type
 * instead of leaving the access as `any` - it is not, and cannot be, an
 * official Obsidian API contract, since `internalPlugins` is not part of the
 * public `App` typings at all.
 */
interface BookmarksInternalPlugin {
	enabled?: boolean;
	instance?: {
		items?: unknown;
	};
}

interface AppWithInternalPlugins extends App {
	internalPlugins: {
		plugins: Record<string, BookmarksInternalPlugin | undefined>;
	};
}

/**
 * The only place `internalPlugins` is touched anywhere in the codebase.
 * Returns an empty list rather than throwing whenever Bookmarks is
 * disabled, not installed, or its private shape doesn't match what's
 * expected - callers never need to know which of those happened.
 */
const getBookmarkItems = (app: App | undefined): BookmarkItem[] => {
	if (!app) {return [];}

	const bookmarksPlugin = (app as AppWithInternalPlugins).internalPlugins
		?.plugins?.bookmarks;

	if (!bookmarksPlugin?.enabled) {return [];}

	const items = bookmarksPlugin.instance?.items;

	return Array.isArray(items) ? (items as BookmarkItem[]) : [];
};

/**
 * Recursively collects every file bookmark, descending into groups.
 */
const flattenBookmarks = (items: BookmarkItem[]): BookmarkFileItem[] => {
	let flattened: BookmarkFileItem[] = [];

	items.forEach((item) => {
		if (isBookmarkFileItem(item)) {
			flattened.push(item);
		} else if (isBookmarkGroupItem(item)) {
			flattened = flattened.concat(flattenBookmarks(item.items));
		}
	});

	return flattened;
};

/**
 * Finds a group by title anywhere in the tree and returns its file
 * bookmarks. Returns an empty list if no group with that title exists.
 */
const getBookmarksByGroupName = (
	title: string,
	items: BookmarkItem[]
): BookmarkFileItem[] => {
	let flattened: BookmarkFileItem[] = [];

	items.forEach((item) => {
		if (!isBookmarkGroupItem(item)) {return;}

		if (item.title === title) {
			flattened = flattenBookmarks(item.items);
		} else {
			const nested = getBookmarksByGroupName(title, item.items);
			if (nested.length > 0) {
				flattened = nested;
			}
		}
	});

	return flattened;
};

/**
 * Gets a list of bookmarked files depending on settings - either every
 * bookmark or only those in a specific group. Returns an empty list if
 * Bookmarks is disabled/unavailable, or if the requested group doesn't
 * exist.
 * @param app
 * @param settings
 */
export const getBookmarks = (
	app: App | undefined,
	settings: TabCandySettings
): TFile[] => {
	const items = getBookmarkItems(app);

	const fileBookmarks =
		settings.bookmarkSource === BOOKMARK_SOURCE.GROUP
			? getBookmarksByGroupName(settings.bookmarkGroup, items)
			: flattenBookmarks(items);

	return fileBookmarks
		.map((bookmark) => app?.vault.getAbstractFileByPath(bookmark.path))
		.filter((file): file is TFile => file instanceof TFile);
};

/**
 * A bookmark group's title alongside its full path (title segments joined
 * by "/" from the root), for display in the group-selection dropdown.
 */
interface BookmarkGroupOption {
	title: string;
	path: string;
}

/**
 * Recursively collects every group in the tree with its title and full
 * path.
 */
const flattenBookmarkGroups = (
	items: BookmarkItem[],
	parentPath: string | null = null
): BookmarkGroupOption[] => {
	let flattened: BookmarkGroupOption[] = [];

	items.forEach((item) => {
		if (!isBookmarkGroupItem(item)) {return;}

		const path = parentPath ? `${parentPath}/${item.title}` : item.title;
		flattened.push({ title: item.title, path });
		flattened = flattened.concat(flattenBookmarkGroups(item.items, path));
	});

	return flattened;
};

/**
 * Gets a list of all bookmark groups. Returns an empty list if Bookmarks
 * is disabled or unavailable.
 * @param app
 */
export const getBookmarkGroups = (app: App): BookmarkGroupOption[] =>
	flattenBookmarkGroups(getBookmarkItems(app));
