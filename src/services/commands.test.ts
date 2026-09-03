import {
	describe,
	expect,
	it,
	vi
} from 'vitest';
import {
	createConfiguredApp,
	setCommandsRegistry,
	setInternalPluginsRegistry,
	setPluginsRegistry,
	withEmptyPrivateRegistries,
} from '../test/fakes';
import { executeEnabledPluginCommand, listSearchProviderCommands } from './commands';

function buildApp() {
	return withEmptyPrivateRegistries(createConfiguredApp({ files: {} }));
}

describe('executeEnabledPluginCommand', () => {
	it('executes the command when the plugin is enabled via the community plugins registry', () => {
		const app = buildApp();
		setPluginsRegistry(app, { 'quick-switcher-plus': {} });
		const executeCommandById = vi.fn().mockReturnValue(true);
		setCommandsRegistry(app, { commands: {}, executeCommandById });

		executeEnabledPluginCommand(app, 'quick-switcher-plus:open');

		expect(executeCommandById).toHaveBeenCalledWith(
			'quick-switcher-plus:open'
		);
	});

	it('executes the command when the plugin is enabled via the internal plugins registry', () => {
		const app = buildApp();
		setInternalPluginsRegistry(app, { switcher: { enabled: true } });
		const executeCommandById = vi.fn().mockReturnValue(true);
		setCommandsRegistry(app, { commands: {}, executeCommandById });

		executeEnabledPluginCommand(app, 'switcher:open');

		expect(executeCommandById).toHaveBeenCalledWith('switcher:open');
	});

	it('does not execute the command when the plugin is registered in neither registry', () => {
		const app = buildApp();
		const executeCommandById = vi.fn().mockReturnValue(true);
		setCommandsRegistry(app, { commands: {}, executeCommandById });

		executeEnabledPluginCommand(app, 'not-installed:open');

		expect(executeCommandById).not.toHaveBeenCalled();
	});

	it('does not execute the command when the internal plugin is registered but disabled', () => {
		const app = buildApp();
		setInternalPluginsRegistry(app, { switcher: { enabled: false } });
		const executeCommandById = vi.fn().mockReturnValue(true);
		setCommandsRegistry(app, { commands: {}, executeCommandById });

		executeEnabledPluginCommand(app, 'switcher:open');

		expect(executeCommandById).not.toHaveBeenCalled();
	});

	it('does not throw when the plugins registry itself is missing', () => {
		const app = buildApp();
		setPluginsRegistry(app, undefined);
		setInternalPluginsRegistry(app, undefined);
		const executeCommandById = vi.fn();
		setCommandsRegistry(app, { commands: {}, executeCommandById });

		expect(() =>
			executeEnabledPluginCommand(app, 'anything:open')
		).not.toThrow();
		expect(executeCommandById).not.toHaveBeenCalled();
	});

	it('does not throw when executeCommandById itself throws', () => {
		const app = buildApp();
		setPluginsRegistry(app, { 'quick-switcher-plus': {} });
		setCommandsRegistry(app, {
			commands: {},
			executeCommandById: () => {
				throw new Error("Obsidian's private command shape changed");
			},
		});

		expect(() =>
			executeEnabledPluginCommand(app, 'quick-switcher-plus:open')
		).not.toThrow();
	});

	it('does not throw when executeCommandById returns false (command id not found)', () => {
		const app = buildApp();
		setPluginsRegistry(app, { 'quick-switcher-plus': {} });
		const executeCommandById = vi.fn().mockReturnValue(false);
		setCommandsRegistry(app, { commands: {}, executeCommandById });

		expect(() =>
			executeEnabledPluginCommand(app, 'quick-switcher-plus:open')
		).not.toThrow();
		expect(executeCommandById).toHaveBeenCalledWith(
			'quick-switcher-plus:open'
		);
	});

	it('does not throw when the commands registry itself is missing', () => {
		const app = buildApp();
		setPluginsRegistry(app, { 'quick-switcher-plus': {} });
		setCommandsRegistry(app, undefined);

		expect(() =>
			executeEnabledPluginCommand(app, 'quick-switcher-plus:open')
		).not.toThrow();
	});
});

describe('listSearchProviderCommands', () => {
	it('returns an empty list when the commands registry is missing', () => {
		const app = buildApp();
		setCommandsRegistry(app, undefined);

		const result = listSearchProviderCommands(app, ['quick-switcher-plus']);

		expect(result).toEqual([]);
	});

	it('returns an empty list when the commands map is malformed (not an object)', () => {
		const app = buildApp();
		setCommandsRegistry(app, {
			// @ts-expect-error -- deliberately malformed to model an Obsidian internals shift
			commands: 'not an object',
			executeCommandById: () => true,
		});

		const result = listSearchProviderCommands(app, ['quick-switcher-plus']);

		expect(result).toEqual([]);
	});

	it('returns only commands belonging to an allowed plugin id', () => {
		const app = buildApp();
		setCommandsRegistry(app, {
			commands: {
				'quick-switcher-plus:open': {
					id: 'quick-switcher-plus:open',
					name: 'Open switcher',
				},
				'other-plugin:open': { id: 'other-plugin:open', name: 'Open other' },
			},
			executeCommandById: () => true,
		});

		const result = listSearchProviderCommands(app, ['quick-switcher-plus']);

		expect(result).toEqual([
			{ command: 'quick-switcher-plus:open', display: 'Open switcher' },
		]);
	});

	it('falls back to the command id as the display name when a command entry has no name', () => {
		const app = buildApp();
		setCommandsRegistry(app, {
			commands: {
				'quick-switcher-plus:open': undefined,
			},
			executeCommandById: () => true,
		});

		const result = listSearchProviderCommands(app, ['quick-switcher-plus']);

		expect(result).toEqual([
			{
				command: 'quick-switcher-plus:open',
				display: 'quick-switcher-plus:open',
			},
		]);
	});

	it('matches against multiple allowed plugin ids', () => {
		const app = buildApp();
		setCommandsRegistry(app, {
			commands: {
				'plugin-a:cmd': { id: 'plugin-a:cmd', name: 'A' },
				'plugin-b:cmd': { id: 'plugin-b:cmd', name: 'B' },
				'plugin-c:cmd': { id: 'plugin-c:cmd', name: 'C' },
			},
			executeCommandById: () => true,
		});

		const result = listSearchProviderCommands(app, ['plugin-a', 'plugin-c']);

		expect(result).toEqual([
			{ command: 'plugin-a:cmd', display: 'A' },
			{ command: 'plugin-c:cmd', display: 'C' },
		]);
	});

	it('returns an empty list when no allowed plugin ids are given', () => {
		const app = buildApp();
		setCommandsRegistry(app, {
			commands: {
				'plugin-a:cmd': { id: 'plugin-a:cmd', name: 'A' },
			},
			executeCommandById: () => true,
		});

		const result = listSearchProviderCommands(app, []);

		expect(result).toEqual([]);
	});
});