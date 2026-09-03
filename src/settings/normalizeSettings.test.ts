import {
	describe,
	expect,
	it
} from 'vitest';
import {
	BOOKMARK_SOURCE,
	BackgroundTheme,
	QUOTE_SOURCE,
	TIME_FORMAT,
} from '../types';
import { DEFAULT_SETTINGS } from './defaultSettings';
import { CURRENT_SETTINGS_VERSION, normalizeSettings } from './normalizeSettings';

describe('normalizeSettings', () => {
	it('returns DEFAULT_SETTINGS with the current version stamped when given no data at all', () => {
		const raw = undefined;

		const result = normalizeSettings(raw);

		expect(result).toEqual({
			...DEFAULT_SETTINGS,
			settingsVersion: CURRENT_SETTINGS_VERSION,
		});
	});

	it('falls back to defaults when given null instead of an object', () => {
		const raw = null;

		const result = normalizeSettings(raw);

		expect(result).toEqual({
			...DEFAULT_SETTINGS,
			settingsVersion: CURRENT_SETTINGS_VERSION,
		});
	});

	it('falls back to defaults when given a non-object primitive', () => {
		const raw = 'not an object';

		const result = normalizeSettings(raw);

		expect(result).toEqual({
			...DEFAULT_SETTINGS,
			settingsVersion: CURRENT_SETTINGS_VERSION,
		});
	});

	it('falls back to defaults when given an array instead of a plain object', () => {
		const raw = ['not', 'a', 'settings', 'object'];

		const result = normalizeSettings(raw);

		expect(result).toEqual({
			...DEFAULT_SETTINGS,
			settingsVersion: CURRENT_SETTINGS_VERSION,
		});
	});

	it('always stamps the current settings version regardless of what was loaded', () => {
		const raw = { settingsVersion: 999 };

		const result = normalizeSettings(raw);

		expect(result.settingsVersion).toBe(CURRENT_SETTINGS_VERSION);
	});

	describe('boolean fields', () => {
		const booleanFields = [
			'replaceEmptyTabsWithTabCandy',
			'showTopLeftSearchButton',
			'showTime',
			'showGreeting',
			'showInlineSearch',
			'showRecentFiles',
			'showBookmarks',
			'showQuote',
		] as const;

		it.each(booleanFields)('passes through a valid boolean for %s', (field) => {
			const raw = { [field]: !DEFAULT_SETTINGS[field] };

			const result = normalizeSettings(raw);

			expect(result[field]).toBe(!DEFAULT_SETTINGS[field]);
		});

		it.each(booleanFields)('falls back to the default for %s when given a non-boolean', (field) => {
			const raw = { [field]: 'not a boolean' };

			const result = normalizeSettings(raw);

			expect(result[field]).toBe(DEFAULT_SETTINGS[field]);
		});

		it.each(booleanFields)('falls back to the default for %s when the field is missing', (field) => {
			const raw = {};

			const result = normalizeSettings(raw);

			expect(result[field]).toBe(DEFAULT_SETTINGS[field]);
		});
	});

	describe('plain string fields', () => {
		const stringFields = [
			'customBackground',
			'backgroundsFolder',
			'greetingText',
			'bookmarkGroup',
		] as const;

		it.each(stringFields)('passes through a valid string for %s', (field) => {
			const raw = { [field]: 'a custom value' };

			const result = normalizeSettings(raw);

			expect(result[field]).toBe('a custom value');
		});

		it.each(stringFields)('falls back to the default for %s when given a non-string', (field) => {
			const raw = { [field]: 12345 };

			const result = normalizeSettings(raw);

			expect(result[field]).toBe(DEFAULT_SETTINGS[field]);
		});

		it.each(stringFields)('falls back to the default for %s when the field is missing', (field) => {
			const raw = {};

			const result = normalizeSettings(raw);

			expect(result[field]).toBe(DEFAULT_SETTINGS[field]);
		});
	});

	describe('backgroundTheme enum', () => {
		it('passes through a valid enum value', () => {
			const raw = { backgroundTheme: BackgroundTheme.TRANSPARENT };

			const result = normalizeSettings(raw);

			expect(result.backgroundTheme).toBe(BackgroundTheme.TRANSPARENT);
		});

		it('falls back to the default when given a value from a since-renamed enum member', () => {
			const raw = { backgroundTheme: 'a legacy value that no longer exists' };

			const result = normalizeSettings(raw);

			expect(result.backgroundTheme).toBe(DEFAULT_SETTINGS.backgroundTheme);
		});

		it('falls back to the default when given a non-string', () => {
			const raw = { backgroundTheme: 42 };

			const result = normalizeSettings(raw);

			expect(result.backgroundTheme).toBe(DEFAULT_SETTINGS.backgroundTheme);
		});

		it('falls back to the default when the field is missing', () => {
			const raw = {};

			const result = normalizeSettings(raw);

			expect(result.backgroundTheme).toBe(DEFAULT_SETTINGS.backgroundTheme);
		});
	});

	describe('timeFormat enum', () => {
		it('passes through a valid enum value', () => {
			const raw = { timeFormat: TIME_FORMAT.TWENTY_FOUR_HOUR };

			const result = normalizeSettings(raw);

			expect(result.timeFormat).toBe(TIME_FORMAT.TWENTY_FOUR_HOUR);
		});

		it('falls back to the default when given an invalid value', () => {
			const raw = { timeFormat: 'thirteen-hour' };

			const result = normalizeSettings(raw);

			expect(result.timeFormat).toBe(DEFAULT_SETTINGS.timeFormat);
		});

		it('falls back to the default when the field is missing', () => {
			const raw = {};

			const result = normalizeSettings(raw);

			expect(result.timeFormat).toBe(DEFAULT_SETTINGS.timeFormat);
		});
	});

	describe('bookmarkSource enum', () => {
		it('passes through a valid enum value', () => {
			const raw = { bookmarkSource: BOOKMARK_SOURCE.GROUP };

			const result = normalizeSettings(raw);

			expect(result.bookmarkSource).toBe(BOOKMARK_SOURCE.GROUP);
		});

		it('falls back to the default when given an invalid value', () => {
			const raw = { bookmarkSource: 'nonexistent-source' };

			const result = normalizeSettings(raw);

			expect(result.bookmarkSource).toBe(DEFAULT_SETTINGS.bookmarkSource);
		});

		it('falls back to the default when the field is missing', () => {
			const raw = {};

			const result = normalizeSettings(raw);

			expect(result.bookmarkSource).toBe(DEFAULT_SETTINGS.bookmarkSource);
		});
	});

	describe('quoteSource enum', () => {
		it('passes through a valid enum value', () => {
			const raw = { quoteSource: QUOTE_SOURCE.MY_QUOTES };

			const result = normalizeSettings(raw);

			expect(result.quoteSource).toBe(QUOTE_SOURCE.MY_QUOTES);
		});

		it('falls back to the default when given an invalid value', () => {
			const raw = { quoteSource: 'nonexistent-source' };

			const result = normalizeSettings(raw);

			expect(result.quoteSource).toBe(DEFAULT_SETTINGS.quoteSource);
		});

		it('falls back to the default when the field is missing', () => {
			const raw = {};

			const result = normalizeSettings(raw);

			expect(result.quoteSource).toBe(DEFAULT_SETTINGS.quoteSource);
		});
	});

	describe('backgroundFiles / manualBackgroundFiles string arrays', () => {
		const arrayFields = ['backgroundFiles', 'manualBackgroundFiles'] as const;

		it.each(arrayFields)('passes through a valid string array for %s', (field) => {
			const raw = { [field]: ['Assets/one.png', 'Assets/two.jpg'] };

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual(['Assets/one.png', 'Assets/two.jpg']);
		});

		it.each(arrayFields)('passes through an empty array for %s', (field) => {
			const raw = { [field]: [] };

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual([]);
		});

		it.each(arrayFields)('drops the whole array for %s when any entry is not a string', (field) => {
			const raw = { [field]: ['Assets/one.png', 42, 'Assets/two.jpg'] };

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual(DEFAULT_SETTINGS[field]);
		});

		it.each(arrayFields)('falls back to the default for %s when given a non-array', (field) => {
			const raw = { [field]: 'not an array' };

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual(DEFAULT_SETTINGS[field]);
		});

		it.each(arrayFields)('falls back to the default for %s when the field is missing', (field) => {
			const raw = {};

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual(DEFAULT_SETTINGS[field]);
		});
	});

	describe('customQuotes', () => {
		it('passes through a valid array of custom quotes', () => {
			const raw = {
				customQuotes: [
					{ text: 'Be excellent to each other.', author: 'Bill' },
					{ text: 'Party on, dudes.', author: 'Ted' },
				],
			};

			const result = normalizeSettings(raw);

			expect(result.customQuotes).toEqual(raw.customQuotes);
		});

		it('passes through an empty array', () => {
			const raw = { customQuotes: [] };

			const result = normalizeSettings(raw);

			expect(result.customQuotes).toEqual([]);
		});

		it('drops the whole array when one entry is missing its author field', () => {
			const raw = {
				customQuotes: [
					{ text: 'Be excellent to each other.', author: 'Bill' },
					{ text: 'Missing an author' },
				],
			};

			const result = normalizeSettings(raw);

			expect(result.customQuotes).toEqual(DEFAULT_SETTINGS.customQuotes);
		});

		it('drops the whole array when one entry has a non-string text field', () => {
			const raw = {
				customQuotes: [{ text: 123, author: 'Bill' }],
			};

			const result = normalizeSettings(raw);

			expect(result.customQuotes).toEqual(DEFAULT_SETTINGS.customQuotes);
		});

		it('falls back to the default when given a non-array', () => {
			const raw = { customQuotes: 'not an array' };

			const result = normalizeSettings(raw);

			expect(result.customQuotes).toEqual(DEFAULT_SETTINGS.customQuotes);
		});

		it('falls back to the default when the field is missing', () => {
			const raw = {};

			const result = normalizeSettings(raw);

			expect(result.customQuotes).toEqual(DEFAULT_SETTINGS.customQuotes);
		});
	});

	describe('search providers', () => {
		const providerFields = ['topLeftSearchProvider', 'inlineSearchProvider'] as const;

		it.each(providerFields)('passes through a valid provider for %s', (field) => {
			const raw = {
				[field]: { command: 'omnisearch:open', display: 'Omnisearch' },
			};

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual(raw[field]);
		});

		it.each(providerFields)('falls back wholesale for %s when command is missing', (field) => {
			const raw = { [field]: { display: 'Missing a command' } };

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual(DEFAULT_SETTINGS[field]);
		});

		it.each(providerFields)('falls back wholesale for %s when display is missing', (field) => {
			const raw = { [field]: { command: 'missing:display' } };

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual(DEFAULT_SETTINGS[field]);
		});

		it.each(providerFields)('falls back wholesale for %s when given a non-object', (field) => {
			const raw = { [field]: 'not a provider object' };

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual(DEFAULT_SETTINGS[field]);
		});

		it.each(providerFields)('falls back to the default for %s when the field is missing', (field) => {
			const raw = {};

			const result = normalizeSettings(raw);

			expect(result[field]).toEqual(DEFAULT_SETTINGS[field]);
		});
	});

	it('drops an unknown legacy field entirely rather than carrying it forward', () => {
		const raw = {
			showTime: true,
			aFieldThatNoLongerExists: 'leftover from an old version',
		};

		const result = normalizeSettings(raw);

		expect(result).not.toHaveProperty('aFieldThatNoLongerExists');
	});

	it('normalizes a fully malformed legacy settings object field-by-field rather than rejecting it wholesale', () => {
		const raw = {
			replaceEmptyTabsWithTabCandy: 'yes please',
			backgroundTheme: 'a theme that got renamed away',
			backgroundFiles: ['fine.png', 7, 'also-fine.jpg'],
			customQuotes: 'not even an array',
			topLeftSearchProvider: { command: 'switcher:open' },
			showQuote: false,
			quoteSource: QUOTE_SOURCE.BOTH,
			aRemovedField: 'from three versions ago',
		};

		const result = normalizeSettings(raw);

		expect(result).toEqual({
			...DEFAULT_SETTINGS,
			showQuote: false,
			quoteSource: QUOTE_SOURCE.BOTH,
			settingsVersion: CURRENT_SETTINGS_VERSION,
		});
	});
});