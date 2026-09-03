import {
	KeyboardEvent,
	ReactNode,
	RefObject,
	useEffect,
	useRef
} from 'react';
import { TFile, getIcon } from 'obsidian';
import { Quote } from '../types';

interface BackgroundSurfaceProps {
	background: string | null | undefined;
	transparent: boolean;
	transparentWithShadows: boolean;
	onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
	containerRef: RefObject<HTMLDivElement>;
	children: ReactNode;
}

interface BookmarksProps {
	files: TFile[];
	onOpen: (file: TFile) => void;
}

interface QuoteDisplayProps {
	quote: Quote | null;
	show: boolean;
}

interface RecentFilesProps {
	files: TFile[];
	onOpen: (file: TFile) => void;
}

interface SearchButtonProps {
	label: string;
	iconName: string;
	iconFirst?: boolean;
	className: string;
	textClassName: string;
	onClick: () => void;
}

/**
 * The full-bleed background container: applies the resolved background
 * image (or the transparent-theme classes when there isn't one) and hosts
 * the keyboard listener that lets any key press launch search.
 */
export const BackgroundSurface = ({
	background,
	transparent,
	transparentWithShadows,
	onKeyDown,
	containerRef,
	children,
}: BackgroundSurfaceProps) => (
	<div
		className = { `tabcandy-root ${
			transparent ? 'tabcandy-root--transparent' : ''
		} ${
			transparentWithShadows ? 'tabcandy-root--transparentWithShadows' : ''
		}`}
		style = {
			background ? { backgroundImage: `url('${ background }')` } : undefined
		}
		onKeyDown = { onKeyDown }
		tabIndex = { 0 } // Make the div focusable so we can capture key strokes
		ref = { containerRef }
	>
		{ children }
	</div>
);

/**
 * Renders an Obsidian icon by name. `getIcon()` returns a real
 * `SVGElement`, so this appends and clears the actual DOM node directly
 * rather than serializing it to a string and reinjecting it via
 * `dangerouslySetInnerHTML` - no icon markup passes through an HTML
 * string at all.
 */
export const Icon = ({ name }: { name: string }) => {
	const spanRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const el = spanRef.current;
		if (!el) {return;}

		while (el.firstChild) {
			el.removeChild(el.firstChild);
		}

		const icon = getIcon(name);
		if (icon) {
			el.appendChild(icon);
		}
	}, [name]);

	return <span className = 'tabcandy-icon' ref = { spanRef } />;
};

/**
 * Bookmarked files (all, or scoped to one group per settings), each
 * opening in the most recently used leaf when clicked.
 */
export const Bookmarks = ({ files, onOpen }: BookmarksProps) => (
	<div className = 'tabcandy-recentlyedited'>
		{ files.map((file) => (
			<a
				key = { file.path }
				className = 'tabcandy-recentlyedited-file'
				data-path = { file.path }
				onClick = { () => onOpen(file) }
			>
				<Icon name = 'bookmark' />
				<span className = 'tabcandy-recentlyedited-file-name'>
					{ file.basename }
				</span>
			</a>
		))}
	</div>
);

/**
 * A quote and its author, rendered only once a quote has loaded and the
 * setting is enabled.
 */
export const QuoteDisplay = ({ quote, show }: QuoteDisplayProps) => (
	<div className = 'tabcandy-quote'>
		{ quote && show && (
			<>
				<div className = 'tabcandy-quote-content'>
					&quot;{ quote.content }&quot;
				</div>
				<div className = 'tabcandy-quote-author'>{ quote.author }</div>
			</>
		)}
	</div>
);

/**
 * The most recently modified markdown files, each opening in the most
 * recently used leaf when clicked.
 */
export const RecentFiles = ({ files, onOpen }: RecentFilesProps) => (
	<div className = 'tabcandy-recentlyedited'>
		{ files.map((file) => (
			<a
				key = { file.path }
				className = 'tabcandy-recentlyedited-file'
				data-path = { file.path }
				onClick = { () => onOpen(file) }
			>
				<Icon name = 'file' />
				<span className = 'tabcandy-recentlyedited-file-name'>
					{ file.basename }
				</span>
			</a>
		))}
	</div>
);

/**
 * A clickable search trigger: an icon and a label, in either order,
 * wired to run a search-provider command on click.
 */
export const SearchButton = ({
	label,
	iconName,
	iconFirst,
	className,
	textClassName,
	onClick,
}: SearchButtonProps) => (
	<a className = { className } onClick={ onClick }>
		{ iconFirst && <Icon name = { iconName } /> }
		<span className = { textClassName }>{ label }</span>
		{ !iconFirst && <Icon name = { iconName } />}
	</a>
);