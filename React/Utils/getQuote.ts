import { requestUrl } from 'obsidian';
import { QUOTE_SOURCE } from 'src/Types/Enums';
import { CustomQuote } from 'src/Types/Interfaces';
import withTimeout from 'src/Utils/withTimeout';

const REQUEST_TIMEOUT_MS = 8000;

export interface Quote {
	content: string;
	author: string;
}

/**
 * Fetches a random quote from the Quoteable API. Returns `null` rather
 * than throwing on a network failure, a non-2xx response, a timeout, or an
 * unexpected response shape, so a failed fetch is indistinguishable from
 * "no quote yet" to the caller.
 */
const fetchQuoteableQuote = async (): Promise<Quote | null> => {
	try {
		const response = await withTimeout(
			requestUrl({ url: 'https://api.quotable.io/random', throw: false }),
			REQUEST_TIMEOUT_MS
		);

		if (response.status !== 200) {return null;}

		const data: unknown = await response.json;

		if (
			data &&
			typeof data === 'object' &&
			'content' in data &&
			'author' in data &&
			typeof data.content === 'string' &&
			typeof data.author === 'string'
		) {
			return { content: data.content, author: data.author };
		}

		return null;
	} catch {
		return null;
	}
};

/**
 * Picks a random quote from the user's custom quotes. Returns `null`
 * instead of throwing when there are no custom quotes configured, which is
 * an ordinary state (an empty list, or a fresh install), not an error.
 */
const pickCustomQuote = (customQuotes: CustomQuote[]): Quote | null => {
	if (customQuotes.length === 0) {return null;}

	const randomQuote =
		customQuotes[Math.floor(Math.random() * customQuotes.length)];

	return { content: randomQuote.text, author: randomQuote.author };
};

/**
 * Based on the configured quoteSource, gets a random quote from Quoteable,
 * a custom quote, or both. Returns `null` on any failure or empty-data
 * case (network failure, no custom quotes configured) - a predictable
 * fallback the caller can render as "no quote" rather than a partially
 * populated or malformed quote object.
 * @param quoteSource
 * @param customQuotes
 */
const getQuote = (
	quoteSource: QUOTE_SOURCE,
	customQuotes: CustomQuote[]
): Promise<Quote | null> => {
	let actualQuoteSource = quoteSource;

	// If set to both, pick one of the two at random
	if (quoteSource === QUOTE_SOURCE.BOTH) {
		actualQuoteSource = [QUOTE_SOURCE.QUOTEABLE, QUOTE_SOURCE.MY_QUOTES][
			Math.floor(Math.random() * 2)
		];
	}

	if (actualQuoteSource === QUOTE_SOURCE.QUOTEABLE) {
		return fetchQuoteableQuote();
	} else if (actualQuoteSource === QUOTE_SOURCE.MY_QUOTES) {
		return Promise.resolve(pickCustomQuote(customQuotes));
	}

	return Promise.resolve(null);
};

export default getQuote;
