import { App, Notice } from 'obsidian';
import { SearchProvider } from '../Types/Interfaces';

/**
 * The private, unpublished runtime shape of `App` that backs command
 * execution/enumeration and plugin-enablement checks. None of `commands`,
 * `plugins`, or `internalPlugins` are part of the public `App` typings -
 * this interface exists only to give the casts below a narrow, explicit
 * type instead of leaving the access as `any`, and every access to any of
 * these three properties anywhere in the codebase goes through this file.
 */
interface AppWithPrivateRegistries extends App {
	commands: {
		commands: Record<string, RegisteredCommand | undefined>;
		executeCommandById(id: string): boolean;
	};
	plugins: {
		plugins: Record<string, unknown>;
	};
	internalPlugins: {
		plugins: Record<string, { enabled?: boolean } | undefined>;
	};
}

/**
 * A single entry in Obsidian's private command registry.
 */
interface RegisteredCommand {
	id: string;
	name: string;
}

const withPrivateRegistries = (app: App): AppWithPrivateRegistries =>
	app as AppWithPrivateRegistries;

/**
 * Whether a plugin (community or core) is currently enabled, checking both
 * registries since a search-provider id configured in settings could name
 * either kind. Returns false rather than throwing if either registry is
 * missing or malformed.
 */
const isPluginEnabled = (app: App, pluginId: string): boolean => {
	const { plugins, internalPlugins } = withPrivateRegistries(app);

	return Boolean(
		plugins?.plugins?.[pluginId] ??
			internalPlugins?.plugins?.[pluginId]?.enabled
	);
};

/**
 * Executes an Obsidian command by id (formatted as "pluginId:command",
 * Obsidian's own command-id convention) if the plugin or core feature that
 * owns it is currently enabled. Shows a Notice and fails gracefully,
 * rather than throwing, if the plugin isn't enabled or the private command
 * registry doesn't behave as expected - used for the search-provider
 * commands configurable in Tab Candy's settings, which can point at any
 * installed community plugin or core feature.
 */
export function executeEnabledPluginCommand(app: App, command: string): void {
	const pluginID = command.split(':')[0];

	if (!isPluginEnabled(app, pluginID)) {
		new Notice(
			`Plugin ${pluginID} is not enabled. Please enable it in the settings.`
		);
		return;
	}

	try {
		const executed =
			withPrivateRegistries(app).commands.executeCommandById(command);
		if (!executed) {
			new Notice(`Could not run the "${command}" command.`);
		}
	} catch {
		new Notice(`Could not run the "${command}" command.`);
	}
}

/**
 * Lists commands registered by any of the given plugin ids as candidate
 * search providers, reading Obsidian's private command registry once here
 * so UI code (the search-provider picker modal) never touches it directly.
 * Returns an empty list rather than throwing if the registry is missing or
 * malformed.
 */
export function listSearchProviderCommands(
	app: App,
	allowedPluginIds: string[]
): SearchProvider[] {
	const commands = withPrivateRegistries(app).commands?.commands;

	if (!commands || typeof commands !== 'object') {return [];}

	return Object.entries(commands)
		.filter(([commandId]) =>
			allowedPluginIds.includes(commandId.split(':')[0])
		)
		.map(([commandId, command]) => ({
			command: commandId,
			display: command?.name ?? commandId,
		}));
}
