import {
	useEffect,
	useMemo,
	useState,
	useRef
} from 'react';
import { useObsidian } from '../../Context/ObsidianAppContext';
import { TFile, getIcon } from 'obsidian';
import getTime from '../../Utils/getTime';
import SettingsStore from '../../../src/Settings/SettingsStore';
import getBackground from '../../Utils/getBackground';
import { getBackgroundResourcePath } from '../../../src/services/backgrounds';
import { executeEnabledPluginCommand } from '../../../src/services/commands';
import getTimeOfDayGreeting from '../../Utils/getTimeOfDayGreeting';
import { getBookmarks } from '../../Utils/getBookmarks';
import { TabCandySettings } from '../../../src/Settings/Settings';
import getQuote from '../../Utils/getQuote';
import { BackgroundTheme } from '../../../src/Types/Enums';

/**
 * Given an icon name, converts a Obsidian icon to a usable SVG string and embeds it into a span.
 * @returns
 */
const Icon = ({ name }: { name: string }) => {
	const iconText = new XMLSerializer().serializeToString(
		getIcon(name) ?? new Node()
	);

	return (
		<span
			className='tabcandy-icon'
			dangerouslySetInnerHTML={{
				__html: iconText,
			}}
		></span>
	);
};

const App = ({ settingsStore }: { settingsStore: SettingsStore }) => {
	const [quote, setQuote] = useState<{
		content: string;
		author: string;
	} | null>(null);
	const [settings, setSettings] = useState<TabCandySettings>(
		settingsStore.get()
	);
	const [time, setTime] = useState(getTime(settings.timeFormat));
	const mainDivRef = useRef<HTMLDivElement>(null);

	const obsidian = useObsidian();

	// Vault-folder-synced backgrounds (backgroundFiles) and individually
	// added vault images (manualBackgroundFiles) are both stored as
	// vault-relative paths, never image bytes, so they need resolving to an
	// actual displayable URL at render time. The two lists are merged here
	// so BackgroundTheme.LOCAL treats them identically downstream
	// regardless of which path added a given image.
	const combinedLocalBackgrounds = useMemo(
		() =>
			obsidian
				? [
					...settings.backgroundFiles,
					...settings.manualBackgroundFiles,
				].map((filePath) =>
					getBackgroundResourcePath(obsidian, filePath)
				)
				: [],
		[settings.backgroundFiles, settings.manualBackgroundFiles, obsidian]
	);

	const background = useMemo(
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

	const allVaultFiles = obsidian?.vault.getAllLoadedFiles();
	const latestModifiedMarkdownFiles = useMemo(() => {
		const files = allVaultFiles?.filter(
			(file) => file instanceof TFile && file.extension === 'md'
		);
		files?.sort((a, b) =>
			a instanceof TFile && b instanceof TFile
				? b.stat.mtime - a.stat.mtime
				: 0
		);
		return files?.slice(0, 5);
	}, [allVaultFiles]);

	const bookmarks = useMemo(
		() => getBookmarks(obsidian, settings).slice(0, 5),
		[obsidian, settings]
	);

	/**
	 * Keep the time up to date by updating it every second
	 * Note that this shouldn't cause extra renders because calling 'setTime' with a duplicate value should skip the render
	 */
	useEffect(() => {
		const timer = window.setInterval(() => {
			setTime(getTime(settings.timeFormat));
		}, 1000);

		return () => {
			window.clearInterval(timer);
		};
	}, [setTime, settings]);

	/**
	 * Get a random quote
	 */
	useEffect(() => {
		getQuote(settings.quoteSource, settings.customQuotes).then(
			(newQuote: any) => {
				setQuote(newQuote);
			}
		);
	}, [setQuote, settings.quoteSource, settings.customQuotes]);

	/**
	 * Subscribe to settings from Obsidian
	 */
	useEffect(() => {
		const unsubscribe = settingsStore.subscribe(
			(newSettings: TabCandySettings) => {
				setSettings(newSettings);
			}
		);

		return () => {
			unsubscribe();
		};
	}, [setSettings]);

	/**
	 * Auto focus so key presses launch search
	 */
	useEffect(() => {
		mainDivRef?.current?.focus();
	}, []);

	return (
		<div
			className={`tabcandy-root ${
				settings.backgroundTheme === BackgroundTheme.TRANSPARENT &&
				'tabcandy-root--transparent'
			}
			
			${
		settings.backgroundTheme ===
					BackgroundTheme.TRANSPARENT_WITH_SHADOWS &&
				'tabcandy-root--transparentWithShadows'
		}
			`}
			style={{
				backgroundImage: `url('${background}')`,
			}}
			onKeyDown={(e) => {
				if (!e.ctrlKey && !e.altKey && /^[A-Za-z0-9]$/.test(e.key)) {
					obsidian &&
						executeEnabledPluginCommand(
							obsidian,
							settings.inlineSearchProvider.command
						);
				}
			}}
			tabIndex={0} // Make the div focusable so we can capture key strokes
			ref={mainDivRef}
		>
			<div className='tabcandy-wrapper'>
				<div className='tabcandy-top'>
					{settings.showTopLeftSearchButton && (
						<a
							className='tabcandy-iconbutton'
							onClick={() => {
								obsidian &&
									executeEnabledPluginCommand(
										obsidian,
										settings.topLeftSearchProvider.command
									);
							}}
						>
							<span className='tabcandy-iconbutton-text'>
								Open Search
							</span>
							<Icon name='search' />
						</a>
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
							<a
								className='tabcandy-search-wrapper'
								onClick={() => {
									obsidian &&
										executeEnabledPluginCommand(
											obsidian,
											settings.inlineSearchProvider.command
										);
								}}
							>
								<Icon name='search' />
								<span className='tabcandy-search-text'>
									Search
								</span>
							</a>
						)}
					</div>
					{settings.showRecentFiles && (
						<div className='tabcandy-recentlyedited'>
							{latestModifiedMarkdownFiles?.map(
								(file) =>
									file instanceof TFile && (
										<a
											key={file.path}
											className='tabcandy-recentlyedited-file'
											data-path={file.path}
											onClick={() => {
												const leaf =
													obsidian?.workspace.getMostRecentLeaf();
												if (file instanceof TFile) {
													leaf?.openFile(file);
												}
											}}
										>
											<Icon name='file' />
											<span className='tabcandy-recentlyedited-file-name'>
												{file.basename}
											</span>
										</a>
									)
							)}
						</div>
					)}
					{ settings.showBookmarks && (
						<div className = 'tabcandy-recentlyedited'>
							{ bookmarks?.map(
								(file) =>
									file instanceof TFile && (
										<a
											key = { file.path }
											className = 'tabcandy-recentlyedited-file'
											data-path = { file.path }
											onClick = { () => {
												const leaf =
													obsidian?.workspace.getMostRecentLeaf();
												leaf?.openFile(file);
											} }
										>
											<Icon name = 'bookmark' />
											<span className = 'tabcandy-recentlyedited-file-name'>
												{ file.basename }
											</span>
										</a>
									)
							)}
						</div>
					)}
				</div>
				<div className='tabcandy-quote'>
					{quote && settings.showQuote && (
						<div className='tabcandy-quote-content'>
							&quot;{quote.content}&quot;
						</div>
					)}
					{quote && settings.showQuote && (
						<div className='tabcandy-quote-author'>
							{quote.author}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default App;