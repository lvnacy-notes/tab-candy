/**
 * Type guard for validating a raw string (e.g. from a DropdownComponent's
 * onChange, which Obsidian types as (value: string) => any regardless of
 * what options were added, or from data.json, which is arbitrary user/disk
 * data) against a specific settings enum before it's trusted as that
 * enum's type. Boundary validation instead of an unchecked cast, per the
 * refactor's settings-hardening plan.
 *
 * Shared by src/settings/SettingsTab.ts (live dropdown callbacks) and
 * src/settings/normalizeSettings.ts (load-time validation) so both
 * boundaries enforce the same rule with one implementation.
 */
export default function isEnumValue<T extends Record<string, string>>(
	enumObject: T,
	value: string
): value is T[keyof T] {
	return (Object.values(enumObject)).includes(value);
}
