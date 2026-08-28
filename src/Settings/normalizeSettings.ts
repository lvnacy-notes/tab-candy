import {
	BOOKMARK_SOURCE,
	BackgroundTheme,
	QUOTE_SOURCE,
	TIME_FORMAT,
} from '../Types/Enums';
import { CustomQuote, SearchProvider } from '../Types/Interfaces';
import isEnumValue from '../Utils/isEnumValue';
import { DEFAULT_SETTINGS, TabCandySettings } from './Settings';

/**
 * Bumped whenever normalizeSettings()'s handling of a field changes in a
 * way that matters for migration (a field is renamed, restructured, or
 * gains a new required shape). Stamped onto every settings object that
 * passes through normalizeSettings(), including a first-run install with
 * no data.json at all, so future migrations can branch on "what version
 * did this data last get normalized as" rather than guessing from shape.
 */
export const CURRENT_SETTINGS_VERSION = 1;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isValidSearchProvider(value: unknown): value is SearchProvider {
	return (
		isPlainObject(value) &&
		typeof value.command === 'string' &&
		typeof value.display === 'string'
	);
}

function isValidCustomQuote(value: unknown): value is CustomQuote {
	return (
		isPlainObject(value) &&
		typeof value.text === 'string' &&
		typeof value.author === 'string'
	);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Merge loaded plugin data with DEFAULT_SETTINGS and validate every field
 * against its expected type/enum/shape before trusting it. Anything
 * missing, malformed, or of the wrong type falls back to the default for
 * that field rather than propagating bad data into the running plugin -
 * per REFACTOR.md's "Validate enum values and provider objects loaded
 * from data.json" and "Add a settingsVersion and a pure migration/
 * normalization function."
 *
 * Pure: no Obsidian API access, no side effects, safe to unit test with
 * plain objects once §9 adds a test runner.
 */
export function normalizeSettings(raw: unknown): TabCandySettings {
	const data = isPlainObject(raw) ? raw : {};
	const normalized: TabCandySettings = { ...DEFAULT_SETTINGS };

	// Plain strings and booleans: pass the loaded value through only if
	// it's actually the type the field is supposed to be, otherwise keep
	// the default rather than trusting whatever data.json contains.
	if (typeof data.customBackground === 'string') {
		normalized.customBackground = data.customBackground;
	}
	if (typeof data.localBackgroundsDirectory === 'string') {
		normalized.localBackgroundsDirectory = data.localBackgroundsDirectory;
	}
	if (typeof data.backgroundsFolder === 'string') {
		normalized.backgroundsFolder = data.backgroundsFolder;
	}
	if (typeof data.showTopLeftSearchButton === 'boolean') {
		normalized.showTopLeftSearchButton = data.showTopLeftSearchButton;
	}
	if (typeof data.showTime === 'boolean') {
		normalized.showTime = data.showTime;
	}
	if (typeof data.showGreeting === 'boolean') {
		normalized.showGreeting = data.showGreeting;
	}
	if (typeof data.greetingText === 'string') {
		normalized.greetingText = data.greetingText;
	}
	if (typeof data.showInlineSearch === 'boolean') {
		normalized.showInlineSearch = data.showInlineSearch;
	}
	if (typeof data.showRecentFiles === 'boolean') {
		normalized.showRecentFiles = data.showRecentFiles;
	}
	if (typeof data.showBookmarks === 'boolean') {
		normalized.showBookmarks = data.showBookmarks;
	}
	if (typeof data.bookmarkGroup === 'string') {
		normalized.bookmarkGroup = data.bookmarkGroup;
	}
	if (typeof data.showQuote === 'boolean') {
		normalized.showQuote = data.showQuote;
	}
	if (typeof data.legacyBackgroundsNoticeDismissed === 'boolean') {
		normalized.legacyBackgroundsNoticeDismissed =
			data.legacyBackgroundsNoticeDismissed;
	}

	// Enum-backed fields: validate against the enum instead of trusting
	// whatever string happens to be on disk (a hand-edited data.json, an
	// old enum value from a since-renamed member, etc).
	if (
		typeof data.backgroundTheme === 'string' &&
		isEnumValue(BackgroundTheme, data.backgroundTheme)
	) {
		normalized.backgroundTheme = data.backgroundTheme;
	}
	if (
		typeof data.timeFormat === 'string' &&
		isEnumValue(TIME_FORMAT, data.timeFormat)
	) {
		normalized.timeFormat = data.timeFormat;
	}
	if (
		typeof data.bookmarkSource === 'string' &&
		isEnumValue(BOOKMARK_SOURCE, data.bookmarkSource)
	) {
		normalized.bookmarkSource = data.bookmarkSource;
	}
	if (
		typeof data.quoteSource === 'string' &&
		isEnumValue(QUOTE_SOURCE, data.quoteSource)
	) {
		normalized.quoteSource = data.quoteSource;
	}

	// Arrays: only trust them if every entry is actually shaped right.
	// An empty array is always a safe fallback (matches DEFAULT_SETTINGS),
	// so a malformed array is dropped wholesale rather than partially kept.
	if (isStringArray(data.localBackgrounds)) {
		normalized.localBackgrounds = data.localBackgrounds;
	}
	if (isStringArray(data.backgroundFiles)) {
		normalized.backgroundFiles = data.backgroundFiles;
	}
	if (Array.isArray(data.customQuotes) && data.customQuotes.every(isValidCustomQuote)) {
		normalized.customQuotes = data.customQuotes;
	}

	// Search providers: fall back to the built-in provider wholesale
	// rather than trying to patch a half-malformed object - a provider
	// missing its `command` is unusable regardless of what else it has.
	if (isValidSearchProvider(data.topLeftSearchProvider)) {
		normalized.topLeftSearchProvider = data.topLeftSearchProvider;
	}
	if (isValidSearchProvider(data.inlineSearchProvider)) {
		normalized.inlineSearchProvider = data.inlineSearchProvider;
	}

	normalized.settingsVersion = CURRENT_SETTINGS_VERSION;

	return normalized;
}
