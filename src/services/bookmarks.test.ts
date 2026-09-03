import {
	describe,
	expect,
	it
} from 'vitest';
import { BOOKMARK_SOURCE } from '../types';
import {
	buildSettings,
	createConfiguredApp,
	setInternalPluginsRegistry,
	withEmptyPrivateRegistries,
} from '../test/fakes';
import { getBookmarkGroups, getBookmarks } from './bookmarks';

describe('getBookmarks', () => {
	it('returns an empty list when app is undefined', () => {
		const settings = buildSettings();

		const result = getBookmarks(undefined, settings);

		expect(result).toEqual([]);
	});

	it('returns an empty list when the Bookmarks registry is missing entirely', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: {} })
		);
		setInternalPluginsRegistry(app, undefined);

		const result = getBookmarks(app, buildSettings());

		expect(result).toEqual([]);
	});

	it('returns an empty list when the Bookmarks plugin is not registered', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: {} })
		);
		setInternalPluginsRegistry(app, {});

		const result = getBookmarks(app, buildSettings());

		expect(result).toEqual([]);
	});

	it('returns an empty list when the Bookmarks plugin is disabled', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: { 'Notes/one.md': '' } })
		);
		setInternalPluginsRegistry(app, {
			bookmarks: {
				enabled: false,
				instance: { items: [{ type: 'file', path: 'Notes/one.md' }] },
			},
		});

		const result = getBookmarks(app, buildSettings());

		expect(result).toEqual([]);
	});

	it('returns an empty list when the enabled plugin instance has a malformed (non-array) items field', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: { 'Notes/one.md': '' } })
		);
		setInternalPluginsRegistry(app, {
			bookmarks: { enabled: true, instance: { items: 'not an array' } },
		});

		const result = getBookmarks(app, buildSettings());

		expect(result).toEqual([]);
	});

	it('returns every file bookmark when bookmarkSource is ALL', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({
				files: { 'Notes/one.md': '', 'Notes/two.md': '' },
			})
		);
		setInternalPluginsRegistry(app, {
			bookmarks: {
				enabled: true,
				instance: {
					items: [
						{ type: 'file', path: 'Notes/one.md' },
						{ type: 'file', path: 'Notes/two.md' },
					],
				},
			},
		});

		const result = getBookmarks(
			app,
			buildSettings({ bookmarkSource: BOOKMARK_SOURCE.ALL })
		);

		expect(result.map((file) => file.path)).toEqual([
			'Notes/one.md',
			'Notes/two.md',
		]);
	});

	it('descends into groups when collecting every file bookmark', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({
				files: { 'Notes/one.md': '', 'Notes/two.md': '' },
			})
		);
		setInternalPluginsRegistry(app, {
			bookmarks: {
				enabled: true,
				instance: {
					items: [
						{ type: 'file', path: 'Notes/one.md' },
						{
							type: 'group',
							title: 'Work',
							items: [{ type: 'file', path: 'Notes/two.md' }],
						},
					],
				},
			},
		});

		const result = getBookmarks(
			app,
			buildSettings({ bookmarkSource: BOOKMARK_SOURCE.ALL })
		);

		expect(result.map((file) => file.path)).toEqual([
			'Notes/one.md',
			'Notes/two.md',
		]);
	});

	it('skips non-file bookmark types (search, graph, url) when flattening', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: { 'Notes/one.md': '' } })
		);
		setInternalPluginsRegistry(app, {
			bookmarks: {
				enabled: true,
				instance: {
					items: [
						{ type: 'file', path: 'Notes/one.md' },
						{ type: 'search', title: 'a saved search' },
						{ type: 'graph', title: 'a saved graph view' },
					],
				},
			},
		});

		const result = getBookmarks(
			app,
			buildSettings({ bookmarkSource: BOOKMARK_SOURCE.ALL })
		);

		expect(result.map((file) => file.path)).toEqual(['Notes/one.md']);
	});

	it('drops a file bookmark whose path no longer resolves to a real vault file', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: { 'Notes/one.md': '' } })
		);
		setInternalPluginsRegistry(app, {
			bookmarks: {
				enabled: true,
				instance: {
					items: [
						{ type: 'file', path: 'Notes/one.md' },
						{ type: 'file', path: 'Notes/deleted.md' },
					],
				},
			},
		});

		const result = getBookmarks(
			app,
			buildSettings({ bookmarkSource: BOOKMARK_SOURCE.ALL })
		);

		expect(result.map((file) => file.path)).toEqual(['Notes/one.md']);
	});

	it('returns only the bookmarks in the configured group when bookmarkSource is GROUP', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({
				files: { 'Notes/work.md': '', 'Notes/personal.md': '' },
			})
		);
		setInternalPluginsRegistry(app, {
			bookmarks: {
				enabled: true,
				instance: {
					items: [
						{ type: 'file', path: 'Notes/personal.md' },
						{
							type: 'group',
							title: 'Work',
							items: [{ type: 'file', path: 'Notes/work.md' }],
						},
					],
				},
			},
		});

		const result = getBookmarks(
			app,
			buildSettings({
				bookmarkSource: BOOKMARK_SOURCE.GROUP,
				bookmarkGroup: 'Work',
			})
		);

		expect(result.map((file) => file.path)).toEqual(['Notes/work.md']);
	});

	it('returns an empty list when bookmarkSource is GROUP but the named group does not exist', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: { 'Notes/one.md': '' } })
		);
		setInternalPluginsRegistry(app, {
			bookmarks: {
				enabled: true,
				instance: {
					items: [
						{
							type: 'group',
							title: 'Other',
							items: [{ type: 'file', path: 'Notes/one.md' }],
						},
					],
				},
			},
		});

		const result = getBookmarks(
			app,
			buildSettings({
				bookmarkSource: BOOKMARK_SOURCE.GROUP,
				bookmarkGroup: 'Nonexistent',
			})
		);

		expect(result).toEqual([]);
	});

	it('finds the named group even when nested inside another group', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: { 'Notes/nested.md': '' } })
		);
		setInternalPluginsRegistry(app, {
			bookmarks: {
				enabled: true,
				instance: {
					items: [
						{
							type: 'group',
							title: 'Outer',
							items: [
								{
									type: 'group',
									title: 'Inner',
									items: [{ type: 'file', path: 'Notes/nested.md' }],
								},
							],
						},
					],
				},
			},
		});

		const result = getBookmarks(
			app,
			buildSettings({
				bookmarkSource: BOOKMARK_SOURCE.GROUP,
				bookmarkGroup: 'Inner',
			})
		);

		expect(result.map((file) => file.path)).toEqual(['Notes/nested.md']);
	});
});

describe('getBookmarkGroups', () => {
	it('returns an empty list when the Bookmarks plugin is not registered', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: {} })
		);
		setInternalPluginsRegistry(app, {});

		const result = getBookmarkGroups(app);

		expect(result).toEqual([]);
	});

	it('lists every group with its title and full path', () => {
		const app = withEmptyPrivateRegistries(
			createConfiguredApp({ files: {} })
		);
		setInternalPluginsRegistry(app, {
			bookmarks: {
				enabled: true,
				instance: {
					items: [
						{
							type: 'group',
							title: 'Work',
							items: [
								{
									type: 'group',
									title: 'Active Projects',
									items: [],
								},
							],
						},
						{ type: 'group', title: 'Personal', items: [] },
					],
				},
			},
		});

		const result = getBookmarkGroups(app);

		expect(result).toEqual([
			{ title: 'Work', path: 'Work' },
			{ title: 'Active Projects', path: 'Work/Active Projects' },
			{ title: 'Personal', path: 'Personal' },
		]);
	});
});