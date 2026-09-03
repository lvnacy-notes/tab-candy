import {
	KeyboardEvent,
	useEffect,
	useRef
} from 'react';
import {
	App as ObsidianApp,
	TFile,
	WorkspaceLeaf
} from 'obsidian';
import SettingsStore from '../settings/SettingsStore';
import { executeEnabledPluginCommand } from '../services/commands';
import { BackgroundTheme } from '../types';
import { getTimeOfDayGreeting } from './utils/time';
import {
	useBackground,
	useBookmarks,
	useClock,
	useQuote,
	useRecentFiles,
	useSettings,
} from './hooks';
import {
	BackgroundSurface,
	Bookmarks,
	QuoteDisplay,
	RecentFiles,
	SearchButton,
} from './components';

const App = ({
	app,
	settingsStore,
	leaf,
}: {
	app: ObsidianApp;
	settingsStore: SettingsStore;
	leaf: WorkspaceLeaf;
}) => {
	const settings = useSettings(settingsStore);
	const time = useClock(settings.timeFormat);
	const quote = useQuote(settings.quoteSource, settings.customQuotes);
	const background = useBackground(app, settings);
	const recentFiles = useRecentFiles(app);
	const bookmarks = useBookmarks(app, settings);
	const mainDivRef = useRef<HTMLDivElement>(null);

	/**
	 * Auto focus so key presses launch search
	 */
	useEffect(() => {
		mainDivRef.current?.focus();
	}, []);

	// Opens directly on the leaf hosting *this* Tab Candy instance, rather
	// than asking Obsidian to resolve "the right leaf" itself (e.g. via
	// workspace.getLeaf(false)). Clicking something in Recent Files or
	// Bookmarks should always land in the exact new tab you're looking at
	// - using the leaf reference we already hold is simply the most direct
	// way to guarantee that, regardless of whatever heuristics Obsidian's
	// own leaf-resolution might apply.
	const openFile = (file: TFile) => {
		void leaf.openFile(file);
	};

	const runInlineSearch = () =>
		executeEnabledPluginCommand(app, settings.inlineSearchProvider.command);

	const handleContainerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!event.ctrlKey && !event.altKey && /^[A-Za-z0-9]$/.test(event.key)) {
			runInlineSearch();
		}
	};

	return (
		<BackgroundSurface
			background = { background }
			transparent = { settings.backgroundTheme === BackgroundTheme.TRANSPARENT }
			transparentWithShadows = {
				settings.backgroundTheme ===
				BackgroundTheme.TRANSPARENT_WITH_SHADOWS
			}
			onKeyDown = { handleContainerKeyDown }
			containerRef = { mainDivRef }
		>
			<div className = 'tabcandy-wrapper'>
				<div className = 'tabcandy-top'>
					{ settings.showTopLeftSearchButton && (
						<SearchButton
							label = 'Open Search'
							iconName = 'search'
							className = 'tabcandy-iconbutton'
							textClassName = 'tabcandy-iconbutton-text'
							onClick = { () =>
								executeEnabledPluginCommand(
									app,
									settings.topLeftSearchProvider.command
								)
							}
						/>
					)}
				</div>
				<div className = 'tabcandy-center'>
					{ settings.showTime && (
						<div className = 'tabcandy-time'>{time}</div>
					)}
					{settings.showGreeting && (
						<div className = 'tabcandy-greeting'>
							{ settings.greetingText.replace(
								/{{greeting}}/gi,
								getTimeOfDayGreeting()
							)}
						</div>
					)}
				</div>
				<div className = 'tabcandy-bottom'>
					<div className = 'tabcandy-search'>
						{ settings.showInlineSearch && (
							<SearchButton
								label = 'Search'
								iconName = 'search'
								iconFirst
								className = 'tabcandy-search-wrapper'
								textClassName = 'tabcandy-search-text'
								onClick = { runInlineSearch }
							/>
						)}
					</div>
					{ settings.showRecentFiles && (
						<RecentFiles files = { recentFiles } onOpen = { openFile } />
					)}
					{ settings.showBookmarks && (
						<Bookmarks files = { bookmarks } onOpen = { openFile } />
					)}
				</div>
				<QuoteDisplay quote = { quote } show = { settings.showQuote } />
			</div>
		</BackgroundSurface>
	);
};

export default App;