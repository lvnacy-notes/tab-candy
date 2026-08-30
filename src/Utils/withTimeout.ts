/**
 * Races a promise against a timeout, rejecting if it doesn't settle in
 * time. `requestUrl()` (the Obsidian-compatible request boundary used for
 * all external requests) doesn't accept an `AbortSignal` or a timeout
 * option of its own, so this is the mechanism available under the current
 * API for bounding how long a network call can hang.
 */
export default function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => {
			reject(new Error(`Timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				window.clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		);
	});
}
