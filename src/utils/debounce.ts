/**
 * Returns a debounced wrapper around fn: repeated calls within waitMs of
 * each other collapse into a single call to fn, waitMs after the last one.
 *
 * Used for text-setting saves in src/settings/SettingsTab.ts so every
 * keystroke doesn't trigger its own settings persistence/disk write -
 * per REFACTOR.md's "Batch or debounce text-setting saves" guidance.
 */
export default function debounce<Args extends unknown[]>(
	fn: (...args: Args) => void,
	waitMs: number
): (...args: Args) => void {
	let timeoutId: number | undefined;

	return (...args: Args) => {
		if (timeoutId !== undefined) {
			window.clearTimeout(timeoutId);
		}
		timeoutId = window.setTimeout(() => fn(...args), waitMs);
	};
}
