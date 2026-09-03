import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';
import SettingsStore from '../settings/SettingsStore';
import { buildSettings, createConfiguredApp } from '../test/fakes';
import {
	filterExistingFiles,
	getBackgroundResourcePath,
	listBackgroundFilesInFolder,
	pruneMissingManualBackgroundFiles,
	registerBackgroundVaultWatchers,
	syncBackgroundsFolder,
} from './backgrounds';

function buildStore(overrides: Parameters<typeof buildSettings>[0] = {}) {
	return new SettingsStore(buildSettings(overrides), async () => {});
}

describe('listBackgroundFilesInFolder', () => {
	it('returns an empty array without touching the vault when the folder path is empty', async () => {
		const app = createConfiguredApp({ files: {} });
		const listSpy = vi.spyOn(app.vault.adapter, 'list');

		const result = await listBackgroundFilesInFolder(app, '');

		expect(result).toEqual([]);
		expect(listSpy).not.toHaveBeenCalled();
	});

	it('returns only image files, sorted, dropping non-image files in the same folder', async () => {
		const app = createConfiguredApp({
			files: {
				'Backgrounds/sunset.png': '',
				'Backgrounds/notes.md': '',
				'Backgrounds/forest.jpg': '',
				'Backgrounds/readme.txt': '',
				'Backgrounds/apple.webp': '',
			},
		});

		const result = await listBackgroundFilesInFolder(app, 'Backgrounds');

		expect(result).toEqual([
			'Backgrounds/apple.webp',
			'Backgrounds/forest.jpg',
			'Backgrounds/sunset.png',
		]);
	});

	it('matches image extensions case-insensitively', async () => {
		const app = createConfiguredApp({
			files: { 'Backgrounds/loud.PNG': '' },
		});

		const result = await listBackgroundFilesInFolder(app, 'Backgrounds');

		expect(result).toEqual(['Backgrounds/loud.PNG']);
	});

	it('is non-recursive: ignores images nested inside a subfolder', async () => {
		const app = createConfiguredApp({
			files: {
				'Backgrounds/top-level.png': '',
				'Backgrounds/Nested/deep.png': '',
			},
		});

		const result = await listBackgroundFilesInFolder(app, 'Backgrounds');

		expect(result).toEqual(['Backgrounds/top-level.png']);
	});

	it('returns an empty array for a folder that does not exist in the vault', async () => {
		const app = createConfiguredApp({ files: {} });

		const result = await listBackgroundFilesInFolder(app, 'Nonexistent');

		expect(result).toEqual([]);
	});

	it('degrades to an empty array (and logs) when the adapter throws for a malformed path', async () => {
		const app = createConfiguredApp({
			files: { 'Backgrounds/sunset.png': '' },
		});
		vi.spyOn(app.vault.adapter, 'list').mockRejectedValue(
			new Error('ENOTDIR: not a directory')
		);
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await listBackgroundFilesInFolder(app, 'Backgrounds');

		expect(result).toEqual([]);
		expect(consoleSpy).toHaveBeenCalledOnce();
	});

	it('normalizes the folder path before listing (trailing slash, backslashes)', async () => {
		const app = createConfiguredApp({
			files: { 'Backgrounds/sunset.png': '' },
		});
		const listSpy = vi.spyOn(app.vault.adapter, 'list');

		await listBackgroundFilesInFolder(app, 'Backgrounds\\/');

		expect(listSpy).toHaveBeenCalledWith('Backgrounds');
	});
});

describe('getBackgroundResourcePath', () => {
	it('resolves a vault-relative path to a resource URL', () => {
		const app = createConfiguredApp({
			files: { 'Backgrounds/sunset.png': '' },
		});

		const result = getBackgroundResourcePath(app, 'Backgrounds/sunset.png');

		expect(result).toBe('app://local/Backgrounds/sunset.png');
	});

	it('normalizes the path before resolving it', () => {
		const app = createConfiguredApp({
			files: { 'Backgrounds/sunset.png': '' },
		});

		const result = getBackgroundResourcePath(app, '/Backgrounds/sunset.png/');

		expect(result).toBe('app://local/Backgrounds/sunset.png');
	});
});

describe('filterExistingFiles', () => {
	it('keeps paths that resolve to a real file', () => {
		const app = createConfiguredApp({
			files: { 'Backgrounds/sunset.png': '' },
		});

		const result = filterExistingFiles(app, ['Backgrounds/sunset.png']);

		expect(result).toEqual(['Backgrounds/sunset.png']);
	});

	it('drops a path that no longer resolves to anything (deleted mid-session)', () => {
		const app = createConfiguredApp({ files: {} });

		const result = filterExistingFiles(app, ['Backgrounds/deleted.png']);

		expect(result).toEqual([]);
	});

	it('drops a path that resolves to a folder rather than a file', () => {
		const app = createConfiguredApp({
			files: { 'Backgrounds/Nested/': '' },
		});

		const result = filterExistingFiles(app, ['Backgrounds/Nested']);

		expect(result).toEqual([]);
	});

	it('returns an empty array unchanged', () => {
		const app = createConfiguredApp({ files: {} });

		const result = filterExistingFiles(app, []);

		expect(result).toEqual([]);
	});

	it('preserves the relative order of the surviving paths', () => {
		const app = createConfiguredApp({
			files: {
				'Backgrounds/a.png': '',
				'Backgrounds/c.png': '',
			},
		});

		const result = filterExistingFiles(app, [
			'Backgrounds/a.png',
			'Backgrounds/b.png',
			'Backgrounds/c.png',
		]);

		expect(result).toEqual(['Backgrounds/a.png', 'Backgrounds/c.png']);
	});
});

describe('syncBackgroundsFolder', () => {
	it('scans the configured folder and writes the result to settings.backgroundFiles', async () => {
		const app = createConfiguredApp({
			files: { 'Backgrounds/sunset.png': '' },
		});
		const store = buildStore({ backgroundsFolder: 'Backgrounds' });

		await syncBackgroundsFolder(app, store);

		expect(store.get().backgroundFiles).toEqual(['Backgrounds/sunset.png']);
	});

	it('resolves to an empty list without throwing when no folder is configured', async () => {
		const app = createConfiguredApp({ files: {} });
		const store = buildStore({ backgroundsFolder: '' });

		await expect(syncBackgroundsFolder(app, store)).resolves.toBeUndefined();
		expect(store.get().backgroundFiles).toEqual([]);
	});

	it('overwrites a previously-synced list rather than merging with it', async () => {
		const app = createConfiguredApp({
			files: { 'Backgrounds/new.png': '' },
		});
		const store = buildStore({
			backgroundsFolder: 'Backgrounds',
			backgroundFiles: ['Backgrounds/stale.png'],
		});

		await syncBackgroundsFolder(app, store);

		expect(store.get().backgroundFiles).toEqual(['Backgrounds/new.png']);
	});
});

describe('pruneMissingManualBackgroundFiles', () => {
	it('drops manualBackgroundFiles entries that no longer resolve and persists the result', async () => {
		const app = createConfiguredApp({
			files: { 'Pictures/keep.png': '' },
		});
		const store = buildStore({
			manualBackgroundFiles: ['Pictures/keep.png', 'Pictures/gone.png'],
		});

		await pruneMissingManualBackgroundFiles(app, store);

		expect(store.get().manualBackgroundFiles).toEqual(['Pictures/keep.png']);
	});

	it('does not write to the store when nothing needed pruning', async () => {
		const app = createConfiguredApp({
			files: { 'Pictures/keep.png': '' },
		});
		const store = buildStore({ manualBackgroundFiles: ['Pictures/keep.png'] });
		const updateSpy = vi.spyOn(store, 'update');

		await pruneMissingManualBackgroundFiles(app, store);

		expect(updateSpy).not.toHaveBeenCalled();
	});
});

describe('registerBackgroundVaultWatchers', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function setUp(overrides: Parameters<typeof buildSettings>[0] = {}) {
		const app = createConfiguredApp({
			files: { 'Backgrounds/existing.png': '' },
		});
		const store = buildStore({ backgroundsFolder: 'Backgrounds', ...overrides });
		const registerEvent = vi.fn();
		registerBackgroundVaultWatchers(app, store, registerEvent);
		return { app, store, registerEvent };
	}

	it('registers exactly one listener each for create, modify, delete, and rename', () => {
		const { registerEvent } = setUp();

		expect(registerEvent).toHaveBeenCalledTimes(4);
	});

	it('re-syncs the backgrounds folder 500ms after a file is created inside it', async () => {
		const { app, store } = setUp();

		await app.vault.create('Backgrounds/new.png', '');
		expect(store.get().backgroundFiles).not.toContain('Backgrounds/new.png');

		await vi.advanceTimersByTimeAsync(500);

		expect(store.get().backgroundFiles).toEqual([
			'Backgrounds/existing.png',
			'Backgrounds/new.png',
		]);
	});

	it('does not re-sync when a file is created outside the configured folder', async () => {
		const { app, store } = setUp();
		// backgroundFiles starts at the settings default (empty) - it's only
		// ever populated by a sync, and registering watchers doesn't sync on
		// its own. A no-op watcher should leave it exactly there.
		expect(store.get().backgroundFiles).toEqual([]);

		await app.vault.create('Elsewhere/new.png', '');
		await vi.advanceTimersByTimeAsync(500);

		expect(store.get().backgroundFiles).toEqual([]);
	});

	it('re-syncs after a file inside the folder is modified', async () => {
		const { app, store } = setUp();

		await app.vault.adapter.write('Backgrounds/existing.png', 'new bytes');
		const file = app.vault.getAbstractFileByPath('Backgrounds/existing.png');
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- seeded above, guaranteed present
		app.vault.trigger('modify', file!);
		await vi.advanceTimersByTimeAsync(500);

		expect(store.get().backgroundFiles).toEqual(['Backgrounds/existing.png']);
	});

	it('collapses a burst of create events into a single debounced sync', async () => {
		const { app, store } = setUp();

		await app.vault.create('Backgrounds/one.png', '');
		vi.advanceTimersByTime(200);
		await app.vault.create('Backgrounds/two.png', '');
		vi.advanceTimersByTime(200);
		await app.vault.create('Backgrounds/three.png', '');

		await vi.advanceTimersByTimeAsync(500);

		expect(store.get().backgroundFiles).toEqual([
			'Backgrounds/existing.png',
			'Backgrounds/one.png',
			'Backgrounds/three.png',
			'Backgrounds/two.png',
		]);
	});

	it('removes a deleted file from manualBackgroundFiles', async () => {
		const { app, store } = setUp({
			manualBackgroundFiles: ['Elsewhere/picture.png'],
		});
		await app.vault.create('Elsewhere/picture.png', '');
		const file = app.vault.getAbstractFileByPath('Elsewhere/picture.png');

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- created above, guaranteed present. Vault.delete() (not FileManager.trashFile()) is deliberate: it's what fires the 'delete' event this test exercises, not a stand-in for a user-facing delete action.
		await app.fileManager.trashFile(file!);

		expect(store.get().manualBackgroundFiles).toEqual([]);
	});

	it('leaves manualBackgroundFiles untouched when the deleted file was not in it', async () => {
		const { app, store } = setUp({
			manualBackgroundFiles: ['Elsewhere/keep.png'],
		});
		await app.vault.create('Elsewhere/other.png', '');
		const file = app.vault.getAbstractFileByPath('Elsewhere/other.png');

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- created above, guaranteed present. Vault.delete() (not FileManager.trashFile()) is deliberate: it's what fires the 'delete' event this test exercises, not a stand-in for a user-facing delete action.
		await app.fileManager.trashFile(file!);

		expect(store.get().manualBackgroundFiles).toEqual(['Elsewhere/keep.png']);
	});

	it('re-syncs when a file inside the configured folder is deleted', async () => {
		const { app, store } = setUp();
		const file = app.vault.getAbstractFileByPath('Backgrounds/existing.png');

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- seeded above, guaranteed present. Vault.delete() (not FileManager.trashFile()) is deliberate: it's what fires the 'delete' event this test exercises, not a stand-in for a user-facing delete action.
		await app.fileManager.trashFile(file!);
		await vi.advanceTimersByTimeAsync(500);

		expect(store.get().backgroundFiles).toEqual([]);
	});

	it('updates a manualBackgroundFiles entry to its new path on rename', async () => {
		const { app, store } = setUp({
			manualBackgroundFiles: ['Elsewhere/old-name.png'],
		});
		await app.vault.create('Elsewhere/old-name.png', '');
		const file = app.vault.getAbstractFileByPath('Elsewhere/old-name.png');

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- created above, guaranteed present
		await app.vault.rename(file!, 'Elsewhere/new-name.png');

		expect(store.get().manualBackgroundFiles).toEqual([
			'Elsewhere/new-name.png',
		]);
	});

	it('re-syncs when a file is renamed into the configured folder', async () => {
		const { app, store } = setUp();
		await app.vault.create('Elsewhere/incoming.png', '');
		const file = app.vault.getAbstractFileByPath('Elsewhere/incoming.png');

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- created above, guaranteed present
		await app.vault.rename(file!, 'Backgrounds/incoming.png');
		await vi.advanceTimersByTimeAsync(500);

		expect(store.get().backgroundFiles).toEqual([
			'Backgrounds/existing.png',
			'Backgrounds/incoming.png',
		]);
	});

	it('re-syncs when a file is renamed out of the configured folder', async () => {
		const { app, store } = setUp();
		const file = app.vault.getAbstractFileByPath('Backgrounds/existing.png');

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- seeded above, guaranteed present
		await app.vault.rename(file!, 'Elsewhere/existing.png');
		await vi.advanceTimersByTimeAsync(500);

		expect(store.get().backgroundFiles).toEqual([]);
	});
});