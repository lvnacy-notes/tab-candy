import {
	KeyboardEvent,
	useEffect,
	useRef
} from 'react';
import { App as ObsidianApp, TFile } from 'obsidian';
import SettingsStore from '../../../src/Settings/SettingsStore';
import { executeEnabledPluginCommand } from '../../../src/services/commands';
import { BackgroundTheme } from '../../../src/Types/Enums';
import getTimeOfDayGreeting from '../../Utils/getTimeOfDayGreeting';
import {
	useBackground,
	useBookmarks,
	useClock,
	useQuote,
	useRecentFiles,
	useSettings,
} from '../../Hooks/hooks';
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
}: {
	app: ObsidianApp;
	settingsStore: SettingsStore;
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

	const openFile = (file: TFile) => {
		void app.workspace.getMostRecentLeaf()?.openFile(file);
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
			background={background}
			transparent={settings.backgroundTheme === BackgroundTheme.TRANSPARENT}
			transparentWithShadows={
				settings.backgroundTheme ===
				BackgroundTheme.TRANSPARENT_WITH_SHADOWS
			}
			onKeyDown={handleContainerKeyDown}
			containerRef={mainDivRef}
		>
			<div className='tabcandy-wrapper'>
				<div className='tabcandy-top'>
					{settings.showTopLeftSearchButton && (
						<SearchButton
							label='Open Search'
							iconName='search'
							className='tabcandy-iconbutton'
							textClassName='tabcandy-iconbutton-text'
							onClick={() =>
								executeEnabledPluginCommand(
									app,
									settings.topLeftSearchProvider.command
								)
							}
						/>
					)}
				</div>
				<div className='tabcandy-center'>
					{settings.showTime && (
						<div className='tabcandy-time'>{time}</div>
					)}
					{settings.showGreeting && (
						<div className='tabcandy-greeting'>
							{settings.greetingText.replace(
								/{{greeting}}/gi,
								getTimeOfDayGreeting()
							)}
						</div>
					)}
				</div>
				<div className='tabcandy-bottom'>
					<div className='tabcandy-search'>
						{settings.showInlineSearch && (
							<SearchButton
								label='Search'
								iconName='search'
								iconFirst
								className='tabcandy-search-wrapper'
								textClassName='tabcandy-search-text'
								onClick={runInlineSearch}
							/>
						)}
					</div>
					{settings.showRecentFiles && (
						<RecentFiles files={recentFiles} onOpen={openFile} />
					)}
					{settings.showBookmarks && (
						<Bookmarks files={bookmarks} onOpen={openFile} />
					)}
				</div>
				<QuoteDisplay quote={quote} show={settings.showQuote} />
			</div>
		</BackgroundSurface>
	);
};

export default App;