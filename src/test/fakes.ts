import { App } from 'obsidian';
import { App as AppMock } from 'obsidian-test-mocks/obsidian';
import { DEFAULT_SETTINGS } from '../settings/defaultSettings';
import { TabCandySettings } from '../types';

/**
 * Builds a fully-wired in-memory vault via obsidian-test-mocks'
 * `App.createConfigured__()`, then converts it to the real `obsidian`
 * package's `App` type via its own `asOriginalType__()` bridge method.
 *
 * obsidian-test-mocks' own `App` mock class doesn't structurally match
 * the real `obsidian` package's published `App` interface (e.g. its
 * `WorkspaceLeaf.view` is typed `View | null`, where the real `obsidian`
 * package types it as non-null `View`) - passing the mock class straight
 * into production code typed against the real `App` fails `tsc`, even
 * though it's the same object at runtime. `asOriginalType__()` is
 * obsidian-test-mocks' own sanctioned answer to exactly this mismatch, so
 * every test builds its app through this one helper rather than each
 * file reaching for `App.createConfigured__` (and the mismatch) directly.
 */
export function createConfiguredApp(
	options: Parameters<typeof AppMock.createConfigured__>[0] = {}
): App {
	return AppMock.createConfigured__(options).asOriginalType__();
}

/**
 * Settings test-data builder (Testing Specification, "Settings test-data
 * builder"): spreads overrides over DEFAULT_SETTINGS so a new settings
 * field requires updating this one factory, not every test file that
 * constructs settings.
 */
export function buildSettings(
	overrides: Partial<TabCandySettings> = {}
): TabCandySettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

/**
 * `commands.ts`/`bookmarks.ts` private-registry fixtures (Testing
 * Specification, "commands.ts/bookmarks.ts private-registry fixtures").
 *
 * Both files touch the same undocumented private `App` surface
 * (`commands.commands`, `plugins.plugins`, `internalPlugins.plugins`) and
 * share the "fails closed, not open" requirement from the load-bearing
 * list, so the malformed-shape fixtures live here once rather than
 * duplicated per test file.
 *
 * obsidian-test-mocks wraps `App` in a strict proxy: reading any property
 * that was never explicitly assigned throws a descriptive error rather
 * than returning `undefined` (obsidian-test-mocks' own "Strict Mocks"
 * design). Real Obsidian's `App` always has `commands`/`plugins`/
 * `internalPlugins` present, even when empty, so every setter below
 * assigns something - `undefined` included - and never leaves a property
 * truly untouched. Passing `undefined` models the realistic "this
 * specific registry didn't come back the shape we expected" case that
 * `commands.ts`/`bookmarks.ts`'s own optional chaining is meant to catch;
 * the strict proxy's throw-on-unassigned-access is reserved for
 * `withEmptyPrivateRegistries()` not having been called at all, which
 * isn't a case either file's production code claims to survive.
 */

export interface FakeBookmarksPlugin {
	enabled?: boolean;
	instance?: { items?: unknown };
}

export interface FakeCommandsRegistry {
	commands: Record<string, FakeRegisteredCommand | undefined>;
	executeCommandById: (id: string) => boolean;
}

export interface FakeRegisteredCommand {
	id: string;
	name: string;
}

export function setCommandsRegistry(
	app: App,
	registry: FakeCommandsRegistry | undefined
): void {
	(
		app as unknown as { commands: FakeCommandsRegistry | undefined }
	).commands = registry;
}

export function setInternalPluginsRegistry(
	app: App,
	plugins: Record<string, FakeBookmarksPlugin | undefined> | undefined
): void {
	(
		app as unknown as {
			internalPlugins:
				| { plugins: Record<string, FakeBookmarksPlugin | undefined> }
				| undefined;
		}
	).internalPlugins = plugins === undefined ? undefined : { plugins };
}

export function setPluginsRegistry(
	app: App,
	plugins: Record<string, unknown> | undefined
): void {
	(
		app as unknown as {
			plugins: { plugins: Record<string, unknown> } | undefined;
		}
	).plugins = plugins === undefined ? undefined : { plugins };
}

/**
 * Assigns empty-but-present `commands`/`plugins`/`internalPlugins`
 * registries to `app`, so a test can then override just the one registry
 * relevant to it via the setters above without also having to hand-build
 * the other two just to satisfy the strict proxy.
 */
export function withEmptyPrivateRegistries(app: App): App {
	setCommandsRegistry(app, { commands: {}, executeCommandById: () => true });
	setPluginsRegistry(app, {});
	setInternalPluginsRegistry(app, {});
	return app;
}