import { TabCandySettings } from '../types';

type Subscriber = (settings: TabCandySettings) => void;

/**
 * Typed, narrow settings store: get/update/subscribe and persistence only,
 * replacing the old untyped `any`-based Observable implementation.
 *
 * Also fixes a real bug in Observable.onChange's returned unsubscribe
 * function: it filtered subscribers with `value === callback` (keeping
 * only the matching callback - the exact opposite of removing it), so a
 * component that unsubscribed on unmount would keep receiving updates
 * anyway as long as any other subscriber had also unsubscribed. A Set's
 * `delete` can't get that backwards.
 */
export default class SettingsStore {
	private value: TabCandySettings;
	private readonly subscribers = new Set<Subscriber>();
	private readonly persist: (settings: TabCandySettings) => Promise<void>;

	constructor(
		initial: TabCandySettings,
		persist: (settings: TabCandySettings) => Promise<void>
	) {
		this.value = initial;
		this.persist = persist;
	}

	/**
	 * The current settings value.
	 */
	get(): TabCandySettings {
		return this.value;
	}

	/**
	 * Merge a partial update into the current settings, persist the result,
	 * and notify subscribers - replacing the old repeated "mutate settings
	 * in place, notify the observable, save, redraw" block that appeared
	 * at every setting in the settings tab.
	 *
	 * Always replaces (never mutates) any array/object fields present in
	 * the patch, so subscribers relying on reference equality (e.g. React)
	 * see a real, intentional state transition.
	 */
	async update(patch: Partial<TabCandySettings>): Promise<void> {
		this.value = { ...this.value, ...patch };
		await this.persist(this.value);
		this.subscribers.forEach((subscriber) => subscriber(this.value));
	}

	/**
	 * Subscribe to settings changes. Returns an unsubscribe function that
	 * actually removes the subscriber.
	 */
	subscribe(subscriber: Subscriber): () => void {
		this.subscribers.add(subscriber);
		return () => {
			this.subscribers.delete(subscriber);
		};
	}
}
