import { useEffect, useMemo, useState } from 'react';
import { App, TFile } from 'obsidian';
import SettingsStore from '../settings/SettingsStore';
import { Quote, TabCandySettings } from '../types';
import { getBackgroundResourcePath } from '../services/backgrounds';
import { getBookmarks } from '../services/bookmarks';
import getBackground from './utils/getBackground';
import getQuote from './utils/getQuote';
import { getTime } from './utils/time';

/**
 * Subscribes to a SettingsStore and keeps a piece of React state in sync
 * with it, unsubscribing on unmount.
 */
export const useSettings = (settingsStore: SettingsStore): TabCandySettings => {
	const [settings, setSettings] = useState<TabCandySettings>(
		settingsStore.get()
	);

	useEffect(() => settingsStore.subscribe(setSettings), [settingsStore]);

	return settings;
};

/**
 * Ticks once a second, returning the current time formatted per
 * `timeFormat`. The interval only restarts when `timeFormat` itself
 * changes, not on every unrelated settings update.
 */
export const useClock = (timeFormat: TabCandySettings['timeFormat']): string => {
	const [time, setTime] = useState(() => getTime(timeFormat));

	useEffect(() => {
		setTime(getTime(timeFormat));

		const timer = window.setInterval(() => {
			setTime(getTime(timeFormat));
		}, 1000);

		return () => window.clearInterval(timer);
	}, [timeFormat]);

	return time;
};

/**
 * Fetches a random quote whenever the quote source or the custom-quotes
 * list changes. `null` covers both "still loading" and "nothing to show" -
 * `getQuote()` never throws, so there's no separate error state to track.
 * A stale, slower-resolving fetch is prevented from overwriting a newer
 * one if the source/list changes again before it resolves.
 */
export const useQuote = (
	quoteSource: TabCandySettings['quoteSource'],
	customQuotes: TabCandySettings['customQuotes']
): Quote | null => {
	const [quote, setQuote] = useState<Quote | null>(null);

	useEffect(() => {
		let cancelled = false;

		void getQuote(quoteSource, customQuotes).then((newQuote) => {
			if (!cancelled) {
				setQuote(newQuote);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [quoteSource, customQuotes]);

	return quote;
};

/**
 * Resolves the active background URL for the current theme, merging
 * folder-synced (`backgroundFiles`) and individually-added
 * (`manualBackgroundFiles`) vault backgrounds into the pool
 * `BackgroundTheme.LOCAL` picks from.
 */
export const useBackground = (app: App, settings: TabCandySettings) => {
	const combinedLocalBackgrounds = useMemo(
		() =>
			[
				...settings.backgroundFiles,
				...settings.manualBackgroundFiles,
			].map((filePath) => getBackgroundResourcePath(app, filePath)),
		[app, settings.backgroundFiles, settings.manualBackgroundFiles]
	);

	return useMemo(
		() =>
			getBackground(
				settings.backgroundTheme,
				settings.customBackground,
				combinedLocalBackgrounds
			),
		[
			settings.backgroundTheme,
			settings.customBackground,
			combinedLocalBackgrounds,
		]
	);
};

/**
 * The five most recently modified markdown files in the vault. Recomputed
 * on every render rather than memoized: `app.vault.getAllLoadedFiles()`
 * has no stable reference to memoize against, and there's no vault-event
 * subscription driving a real cache invalidation here.
 */
export const useRecentFiles = (app: App): TFile[] => {
	const files = app.vault
		.getAllLoadedFiles()
		.filter(
			(file): file is TFile =>
				file instanceof TFile && file.extension === 'md'
		);

	files.sort((a, b) => b.stat.mtime - a.stat.mtime);

	return files.slice(0, 5);
};

/**
 * The first five bookmarked files, per settings (all bookmarks, or scoped
 * to one group), via the guarded Bookmarks adapter in
 * `src/services/bookmarks.ts`.
 */
export const useBookmarks = (
	app: App,
	settings: TabCandySettings
): TFile[] => {
	return useMemo(
		() => getBookmarks(app, settings).slice(0, 5),
		[app, settings]
	);
};
