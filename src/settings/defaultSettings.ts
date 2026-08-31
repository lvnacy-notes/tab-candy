import {
	BOOKMARK_SOURCE,
	BackgroundTheme,
	QUOTE_SOURCE,
	SearchProvider,
	TIME_FORMAT,
	TabCandySettings,
} from '../types';

const DEFAULT_SEARCH_PROVIDER: SearchProvider = {
	command: 'switcher:open',
	display: 'Obsidian Core Quick Switcher',
};

export const SEARCH_PROVIDER = [
	'switcher',
	'omnisearch',
	'darlal-switcher-plus',
	'obsidian-another-quick-switcher',
];

export const DEFAULT_SETTINGS: TabCandySettings = {
	// Real value is always stamped by normalizeSettings() on load; this
	// default only matters for code that constructs settings without
	// going through normalizeSettings() (there shouldn't be any, but a
	// wrong number here should never be load-bearing).
	settingsVersion: 0,
	replaceEmptyTabsWithTabCandy: true,
	backgroundTheme: BackgroundTheme.SEASONS_AND_HOLIDAYS,
	customBackground: '',
	backgroundsFolder: '',
	backgroundFiles: [],
	manualBackgroundFiles: [],
	showTopLeftSearchButton: true,
	topLeftSearchProvider: DEFAULT_SEARCH_PROVIDER,
	showTime: true,
	timeFormat: TIME_FORMAT.TWELVE_HOUR,
	showGreeting: true,
	greetingText: 'Hello, Beautiful.',
	showInlineSearch: true,
	inlineSearchProvider: DEFAULT_SEARCH_PROVIDER,
	showRecentFiles: true,
	showBookmarks: false,
	bookmarkSource: BOOKMARK_SOURCE.ALL,
	bookmarkGroup: '',
	showQuote: true,
	quoteSource: QUOTE_SOURCE.QUOTEABLE,
	customQuotes: [],
};
