import { App, Notice } from 'obsidian';

/**
 * Executes an Obsidian command by id (formatted as "pluginId:command",
 * Obsidian's own command-id convention) if the plugin or core feature that
 * owns it is currently enabled. Shows a Notice instead of executing it if
 * that plugin isn't enabled - used for the search-provider commands
 * configurable in Tab Candy's settings, which can point at any installed
 * community plugin or core feature.
 */
export function executeEnabledPluginCommand(app: App, command: string): void {
	const pluginID = command.split(':')[0];
	//@ts-ignore
	const { plugins } = app.plugins;
	//@ts-ignore
	const internalPlugins = app.internalPlugins.plugins;

	if (plugins[pluginID] || internalPlugins[pluginID]?.enabled) {
		//@ts-ignore
		app.commands.executeCommandById(command);
	} else {
		new Notice(
			`Plugin ${pluginID} is not enabled. Please enable it in the settings.`
		);
	}
}
