import {
	describe,
	expect,
	it,
	vi
} from 'vitest';
import { buildSettings } from '../test/fakes';
import SettingsStore from './SettingsStore';

describe('SettingsStore', () => {
	it('get() returns the initial value passed to the constructor', () => {
		const initial = buildSettings({ showTime: true });
		const store = new SettingsStore(initial, async () => {});

		expect(store.get()).toBe(initial);
	});

	describe('update', () => {
		it('merges a partial patch into the current value rather than replacing it', async () => {
			const initial = buildSettings({ showTime: true, showGreeting: true });
			const store = new SettingsStore(initial, async () => {});

			await store.update({ showTime: false });

			expect(store.get()).toEqual({ ...initial, showTime: false });
		});

		it('produces a new object reference rather than mutating the previous value in place', async () => {
			const initial = buildSettings();
			const store = new SettingsStore(initial, async () => {});

			await store.update({ showTime: false });

			expect(store.get()).not.toBe(initial);
		});

		it('replaces an array field wholesale rather than merging its contents', async () => {
			const initial = buildSettings({ backgroundFiles: ['a.png', 'b.png'] });
			const store = new SettingsStore(initial, async () => {});

			await store.update({ backgroundFiles: ['c.png'] });

			expect(store.get().backgroundFiles).toEqual(['c.png']);
		});

		it('awaits the persist function with the fully merged value', async () => {
			const initial = buildSettings({ showTime: true });
			const persist = vi.fn().mockResolvedValue(undefined);
			const store = new SettingsStore(initial, persist);

			await store.update({ showTime: false });

			expect(persist).toHaveBeenCalledTimes(1);
			expect(persist).toHaveBeenCalledWith({
				...initial,
				showTime: false,
			});
		});

		it('notifies every subscriber with the new merged value after persisting', async () => {
			const initial = buildSettings({ showTime: true });
			const store = new SettingsStore(initial, async () => {});
			const subscriberOne = vi.fn();
			const subscriberTwo = vi.fn();
			store.subscribe(subscriberOne);
			store.subscribe(subscriberTwo);

			await store.update({ showTime: false });

			const expected = { ...initial, showTime: false };
			expect(subscriberOne).toHaveBeenCalledTimes(1);
			expect(subscriberOne).toHaveBeenCalledWith(expected);
			expect(subscriberTwo).toHaveBeenCalledTimes(1);
			expect(subscriberTwo).toHaveBeenCalledWith(expected);
		});

		it('notifies subscribers only after persist resolves, not before', async () => {
			const initial = buildSettings();
			const callOrder: string[] = [];
			const persist = vi.fn().mockImplementation(() => {
				callOrder.push('persist');
				return Promise.resolve();
			});
			const store = new SettingsStore(initial, persist);
			store.subscribe(() => callOrder.push('subscriber'));

			await store.update({ showTime: false });

			expect(callOrder).toEqual(['persist', 'subscriber']);
		});

		it('does not notify subscribers when persist rejects', async () => {
			const initial = buildSettings();
			const persist = vi.fn().mockRejectedValue(new Error('disk is full'));
			const store = new SettingsStore(initial, persist);
			const subscriber = vi.fn();
			store.subscribe(subscriber);

			await expect(store.update({ showTime: false })).rejects.toThrow(
				'disk is full'
			);
			expect(subscriber).not.toHaveBeenCalled();
		});

		it('applies multiple sequential updates cumulatively', async () => {
			const initial = buildSettings({ showTime: true, showGreeting: true });
			const store = new SettingsStore(initial, async () => {});

			await store.update({ showTime: false });
			await store.update({ showGreeting: false });

			expect(store.get()).toEqual({
				...initial,
				showTime: false,
				showGreeting: false,
			});
		});
	});

	describe('subscribe', () => {
		it('returns an unsubscribe function that stops that specific subscriber from being called again', async () => {
			const store = new SettingsStore(buildSettings(), async () => {});
			const subscriber = vi.fn();
			const unsubscribe = store.subscribe(subscriber);

			unsubscribe();
			await store.update({ showTime: false });

			expect(subscriber).not.toHaveBeenCalled();
		});

		it('leaves other subscribers unaffected when one unsubscribes (the regression this class was built to fix)', async () => {
			const store = new SettingsStore(buildSettings(), async () => {});
			const subscriberOne = vi.fn();
			const subscriberTwo = vi.fn();
			const unsubscribeOne = store.subscribe(subscriberOne);
			store.subscribe(subscriberTwo);

			unsubscribeOne();
			await store.update({ showTime: false });

			expect(subscriberOne).not.toHaveBeenCalled();
			expect(subscriberTwo).toHaveBeenCalledOnce();
		});

		it('does not double-fire a subscriber that was subscribed twice and unsubscribed once', async () => {
			// A Set naturally collapses duplicate function references into a
			// single entry, so subscribing the same callback twice and
			// unsubscribing via either returned handle removes it entirely -
			// asserting that here so a future switch to a list-backed
			// implementation can't silently reintroduce double-firing.
			const store = new SettingsStore(buildSettings(), async () => {});
			const subscriber = vi.fn();
			store.subscribe(subscriber);
			const unsubscribeSecond = store.subscribe(subscriber);

			unsubscribeSecond();
			await store.update({ showTime: false });

			expect(subscriber).not.toHaveBeenCalled();
		});

		it('does nothing (and does not throw) when the unsubscribe function is called more than once', async () => {
			const store = new SettingsStore(buildSettings(), async () => {});
			const subscriber = vi.fn();
			const unsubscribe = store.subscribe(subscriber);

			unsubscribe();
			expect(() => unsubscribe()).not.toThrow();

			await store.update({ showTime: false });
			expect(subscriber).not.toHaveBeenCalled();
		});

		it('does not leak: a subscriber added after an update only receives subsequent updates', async () => {
			const store = new SettingsStore(buildSettings(), async () => {});
			await store.update({ showTime: false });

			const lateSubscriber = vi.fn();
			store.subscribe(lateSubscriber);
			await store.update({ showGreeting: false });

			expect(lateSubscriber).toHaveBeenCalledOnce();
		});
	});
});