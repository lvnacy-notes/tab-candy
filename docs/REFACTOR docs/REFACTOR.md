# Tab Candy Refactor Plan

Status: recommendations only. No source code changes are included in this document.

This plan is based on the current repository and the official Obsidian Developer Docs at [docs.obsidian.md/Home](https://docs.obsidian.md/Home), with the official sample plugin consulted only for build and esbuild conventions.

## Goals

- Complete the Beautitab -> Tab Candy rename without breaking the existing plugin installation unnecessarily.
- Remove desktop-only runtime assumptions and make the background workflow work on desktop and mobile.
- Keep React as the presentation layer while reducing file and folder sprawl.
- Replace fragile private API access with public APIs or isolated optional integrations.
- Move the toolchain to Node 24+ while keeping the bundled plugin browser/WebView-compatible.
- Make linting, type-checking, builds, and release validation explicit and repeatable.

## Current Findings

### Branding rename is incomplete

The old name appears in maintained project files and should be raised before implementation:

- [x] `manifest.json` and `manifest-beta.json`: plugin id and display name are still `beautitab` / `Beautitab`. ✅ Changed to `tabcandy` / `Tab Candy` respectively.
- [x] `package.json` and `package-lock.json`: package name is still `obsidian-beautitab`. ✅ Updated to `tabcandy`; `package-lock.json` removed: `pnpm` will be the new package manager moving forward.
- [x] `README.md`: title, installation URL, prose, and image alt text still use Beautitab. ✅ Updated. The README as a whole will require a complete and total update still.
- [x] `.github/workflows/*.yml`: release paths still use `obsidian-beautitab`. ✅ Name has been updated, though workflows may be entirely rewritten.
- [x] `React/Components/App/App.tsx`, `React/Utils/getBookmarks.ts`, and modals still contain `BeautitabPlugin` and `BeautitabPluginSettings` identifiers. ✅ Updated. But holy fuck will these need work.
- [x] CSS selectors in `styles.scss`, `React/Components/App/App.scss`, and `src/Settings/Settings.scss` still use `beautitab`. ✅ Updated.
- [ ] Mixed naming already exists: `TabCandyPlugin`, `TabCandyPluginSettings`, `TAB_CANDY_REACT_VIEW`, and `tabcandy`. See "Recommended Policy" below.

Recommended policy:

- Use `tab-candy` for repository/package/release directory names where a hyphen is valid.
- Use `tabcandy` for the immutable Obsidian plugin id.
- Use `TabCandyPlugin`, `TabCandySettings`, `TabCandyView`, and `tabcandy-*` or `tabcandy-*` CSS consistently.
- Treat `updates.ts` as intentional comparison material. It is excluded from deletion, rename, lint, and architecture recommendations unless its role changes later.

### Runtime portability problems

The maintained runtime imports Node `fs` and `path` in `main.ts` and `src/Settings/Settings.ts`, and imports Electron for a native folder/file picker. The code attempts to hide parts of this behind `isMobile` checks, but top-level runtime imports and desktop-only behavior still make mobile support brittle. The plugin manifest correctly says it is not desktop-only, so the implementation and manifest currently disagree in spirit.

Local images are converted to base64 and stored in plugin settings. This makes `data.json` grow with every image, duplicates image data, increases save cost, and makes vault sync less useful.

## Mobile and Vault Background Redesign

### New setting model

Replace the OS path setting and embedded image array with vault-relative references:

```ts
backgroundsFolder: string;       // e.g. "Assets/Tab Candy"
backgroundFiles: string[];       // vault-relative paths, not image bytes
```

### Public vault adapter flow

Use the public vault adapter API documented by Obsidian:

1. Store a normalized vault-relative folder path, never an absolute filesystem path.
2. Call `app.vault.adapter.list(folderPath)` to obtain files and subfolders.
3. Filter returned file paths by a centralized image-extension/MIME table.
4. Decide explicitly whether the feature is non-recursive or recursive. Non-recursive matches current behavior; recursive traversal should be implemented only if needed.
5. Call `app.vault.adapter.readBinary(filePath)` when a selected image needs to be displayed.
6. Convert the returned `ArrayBuffer` to a browser-compatible object URL or data URL outside settings storage.
7. Revoke object URLs when the view is closed or the background changes.
8. Cache only vault paths and lightweight metadata. Do not save image bytes in plugin data.

`app.vault.readBinary(TFile)` is also a supported option when a `TFile` is already available. The adapter is the appropriate choice for a user-selected folder path and is explicitly cross-platform for vault files.

### UI behavior

- Replace the Electron native directory picker with a vault-folder chooser implemented with an Obsidian suggest modal or a small settings control backed by `adapter.list()`.
- Replace the desktop-only "Add local image" control with the existing vault image picker, expanded to include the supported image formats.
- Make "Sync now" available on every platform.
- Show a clear empty state when the configured folder does not exist or contains no supported images.
- Handle missing, renamed, unreadable, and deleted vault files without failing the whole view.
- Avoid a full settings redraw for every field change; update the setting and save once per committed interaction.
- Consider listening for vault `create`, `modify`, `delete`, and `rename` events and invalidating the background cache instead of requiring a reload.

## Current Obsidian API Review

The official source of truth for API behavior is [Obsidian Developer Docs](https://docs.obsidian.md/Home). The current code should be updated against the installed `obsidian` type package as part of the refactor, but the following changes are the important architectural consequences.

### Views

The current `ReactView` extends `FileView` even though Tab Candy is not a file-backed view. The official Views guidance recommends extending `ItemView` for a custom view that displays plugin content.

Recommended changes:

- Change the view base class to `ItemView`.
- Keep a stable exported view type constant.
- Implement `getViewType()`, `getDisplayText()`, `getIcon()`, `onOpen()`, and `onClose()` with current types.
- Clear the content element before mounting React.
- Unmount React in `onClose()`.
- Do not keep global view-instance references. Obsidian can call the view factory more than once; use `workspace.getLeavesOfType()` when access to existing views is needed.
- Add an explicit activation command or helper that reuses an existing leaf, creates one when necessary, and calls `workspace.revealLeaf()`.
- Confirm whether hijacking every empty leaf on `layout-change` is still the desired product behavior. It is broad, can surprise users, and should be replaced by a narrowly scoped command or a carefully guarded activation path if possible.

### Lifecycle and cleanup

The public Plugin lifecycle provides registration helpers that should own cleanup:

- Use `this.registerEvent(this.app.workspace.on(...))` for Obsidian events.
- Use `this.registerDomEvent(...)` for window/document/element listeners that outlive a render.
- Use `this.registerInterval(...)` for plugin-owned intervals.
- Ensure React effects clean up timers and subscriptions when the view unmounts.

The current view timer is cleaned up by React, but the custom settings subscription adds unnecessary lifecycle complexity and has a broken unsubscribe predicate. Prefer a typed settings store with a correct unsubscribe function, or move settings updates behind a plugin service and React state boundary.

### Vault and files

Use public vault APIs and explicit types:

- `vault.getFiles()` or `vault.getMarkdownFiles()` for recent-file data.
- `vault.getAbstractFileByPath()` when resolving a stored path.
- `vault.adapter.list()` and `vault.adapter.readBinary()` for vault-folder image discovery and loading.
- `TFile` checks only where the API returns `TAbstractFile` unions.

The current recent-file calculation mutates the array returned by a derived computation with `sort()`. Copy before sorting, or sort a new array in a data service.

### Settings and persistence

`Plugin.loadData()` and `Plugin.saveData()` remain the correct plugin-data persistence boundary. Add a settings schema/version and normalize loaded data so old or partial settings cannot cause runtime errors.

Use the current `Setting` callback types. Several dropdown callbacks currently narrow the callback value directly to enums even though the Obsidian component callback is typed as a string. Convert and validate at the boundary instead of suppressing the type error.

### Modals and UI

The current use of `Modal`, `FuzzySuggestModal`, `Setting`, `createEl`, and vault file APIs is aligned with the public UI model. Modernize types and cleanup rather than replacing these with a new UI framework.

For icons, prefer the public icon helpers and DOM APIs documented by Obsidian. If React requires serialized icon markup, isolate that bridge in one component and verify that it remains compatible with the current icon API; avoid broad `dangerouslySetInnerHTML` use.

### Commands and search providers

The code reads `this.app.commands.commands` to enumerate provider commands and uses `@ts-ignore`. That command registry is not a stable public integration contract.

Recommended options, in order:

1. Define Tab Candy's supported provider list as explicit command ids and let users enter/select from that list.
2. Add a small optional integration adapter per provider, each checking availability without exposing the private command registry to the rest of the app.
3. Prefer a public command-execution path from the current API typings. If the installed typings do not expose a safe availability check, do not cast private objects globally; show a Notice and fail gracefully.
4. Keep `switcher:open` as the built-in default because it is a known Obsidian command, but validate that it remains available at runtime.

### Bookmarks

`internalPlugins.plugins.bookmarks.instance.items` is a private core-plugin implementation detail. It can change independently of the public API and currently can throw when Bookmarks is unavailable or disabled.

Choose one explicit product decision:

- Remove the bookmarks feature to eliminate private API dependence; or
- Keep it as an optional compatibility adapter, guarded by feature detection and isolated from React/settings; or
- Replace it when Obsidian exposes a supported bookmarks API.

The adapter must return an empty list rather than throw when the core plugin is absent, and tests should cover disabled/missing bookmarks.

### Mobile emulation

`app.emulateMobile()` is development-only and accessed with `@ts-ignore`. Keep mobile testing as a build/test concern, not as production plugin behavior. Remove the runtime emulation block from the shipped plugin entry point and use an external development workflow if emulation is still useful.

### Network requests

Keep `requestUrl()` for external quote/version requests because it is the Obsidian-compatible request boundary. Add error handling, timeouts or cancellation where supported, and avoid making plugin startup depend on a successful version check. Cache or defer the version check so a network failure cannot delay view registration.

## Proposed Structure

The current layout is shallow in some places but fragmented by implementation detail: a single large React component owns data access, timers, network calls, navigation, keyboard behavior, and rendering; several one-file directories add navigation cost without creating useful boundaries.

Proposed structure:

```text
src/
  main.ts                 # Plugin lifecycle, registration, activation
  view.tsx                # ItemView host and React mount/unmount
  app/
    App.tsx               # Composition root for the screen
    components.tsx        # Small presentational pieces, if needed
    hooks.ts              # Timer, settings, background lifecycle hooks
    styles.scss           # App styles, or keep one root stylesheet
  services/
    backgrounds.ts        # Vault discovery, binary loading, URL lifecycle
    bookmarks.ts          # Optional guarded integration
    commands.ts           # Provider command policy and execution
    quotes.ts             # Quote source orchestration
    settings.ts           # Defaults, normalization, persistence
  settings.ts             # PluginSettingTab and setting controls
  modals.ts               # Small related modals, unless a modal becomes large
  types.ts                # Shared settings/domain types and enums
  main.scss              # Plugin-level styles, if separate from app styles
```

This is a target shape, not a requirement to merge every file immediately. A good first pass can use `src/app`, `src/services`, and `src/ui` only, with one file per meaningful boundary rather than one directory per file.

### React boundary

Keep React responsible for rendering and user interaction. Move these responsibilities out of `App.tsx`:

- vault file discovery and background URL management;
- recent-file and bookmark queries;
- quote loading and error state;
- command-provider availability and execution;
- settings normalization/subscription;
- time formatting/ticking;
- icon adaptation.

The app should receive a small typed model and callbacks, making it possible to test rendering without constructing a full Obsidian `App`.

Use focused components only where they clarify behavior: `SearchButton`, `RecentFiles`, `Bookmarks`, `Quote`, and `BackgroundSurface` are reasonable boundaries. Do not split every text block into a component.

## What to Abstract, Combine, or Remove

### Worth abstracting

- A typed `SettingsStore` with `get`, `update`, `subscribe`, and persistence. It replaces the untyped `Observable` and centralizes normalization/save behavior.
- A `BackgroundService` that owns vault-path discovery, binary conversion, caching, and URL cleanup.
- A `CommandService` that owns provider configuration, availability checks, and execution.
- A small `Result`/fallback strategy for quote and bookmark loading so UI code receives predictable values.
- A shared `IMAGE_TYPES` map used by vault selection, folder sync, MIME generation, and validation.

### Combine

- `src/Types/Enums.ts` and `src/Types/Interfaces.ts` into a single `types.ts` unless the type surface grows substantially.
- `src/Utils/capitalizeFirstLetter.ts` into the settings option-label helper; it does not need a standalone directory.
- `getTime.ts` and `getTimeOfDayGreeting.ts` into a small time utility module if they remain independent pure functions.
- The related image, search-provider, confirm, and custom-quote modal files into `modals.ts` only while they remain small. Keep a separate file when a modal gains substantial behavior.
- `React/Context/ObsidianAppContext.ts` can be removed if the view passes a typed service/model into React. A context is justified only if many descendants need the same dependency.

### Remove or trim

- Node `fs`, Node `path`, and Electron from runtime code. `path` in esbuild configuration is fine because that file is build tooling.
- Native desktop folder/file selection. It is incompatible with the vault-first mobile requirement.
- Base64 image bytes in plugin settings.
- The custom `Observable` once the typed settings store exists. Its current unsubscribe implementation retains the target callback instead of removing it.
- Broad `@ts-ignore` directives. Each remaining suppression must be isolated, documented by an adapter, and justified by the current public API gap.
- `onunload() {}` if it remains empty; Plugin registration helpers should own lifecycle cleanup.
- `FileView` for the non-file Tab Candy view.
- The startup version check as a blocking operation. Make it best-effort and deferred.
- Unused `settings` state in `ChooseImageSuggestModal`, unused modal result fields, and `Function`-typed callbacks. Use precise function types.
- Repeated setting update/save/display blocks. Add a typed update helper that updates the store and refreshes only when a conditional setting section actually changes.

Do not remove `screenshots/` or rewrite the README merely to reduce file count. They are release/documentation assets, although README branding and stale claims must be corrected during the rename.

## Node 24+ and Build Tooling

Node 24+ is a development/build prerequisite, not a runtime API exposed to the plugin. The bundled code must run in Obsidian's Electron desktop renderer and mobile sandboxed WebView.

Recommended changes:

- Declare the supported toolchain in `package.json` with an `engines.node` range such as `>=24` and document it in the README/contributor notes.
- Update `@types/node` to a Node 24-compatible version.
- Upgrade TypeScript, esbuild, React type packages, and lint packages as a coordinated dependency update; do not update only one package in isolation.
- Remove the direct `electron` dependency once runtime Electron APIs are gone. Keep `electron` external only if another supported build-time/runtime integration genuinely requires it.
- Keep `obsidian` as a development dependency and update it deliberately against the current API declarations.
- Review `target: "es2018"` against the minimum Obsidian desktop/mobile WebView support. Node 24 does not mean the plugin can emit Node-only or desktop-only syntax; choose the browser target based on Obsidian compatibility.
- Replace JSON import assertions if the selected Node/toolchain version requires import attributes, or avoid importing package JSON by passing the version through the build environment.
- Remove the hard-coded Windows development output path. Make the development vault/plugin output configurable through an environment variable or a documented local config.
- Keep `main.ts` and `styles.scss` as the only build entry points unless the build intentionally moves to a `src/` entry convention.
- Keep `dist/` and generated `main.js` out of source control unless the release process explicitly requires them.

## ESLint and TypeScript Configuration

`eslint.config.js` is already the flat-config entry point, but `package.json` does not expose a lint script and the config does not lint `.tsx` files.

Recommended package changes:

- Add `"lint": "eslint ."`.
- Add a focused typecheck script, for example `"typecheck": "tsc --noEmit --skipLibCheck"`.
- Make `build` run typecheck followed by the production esbuild build.
- Add a test script once the service boundaries exist.
- Add the flat-config dependencies used by `eslint.config.js`, including `eslint`, `@stylistic/eslint-plugin`, and `eslint-plugin-obsidianmd`, at compatible versions.
- Update the `files` globs to include `**/*.tsx` and the relevant `.mjs` build files, or intentionally ignore build-only files with a clear reason.
- Replace stale ignore names such as `esbuild.config.js` and `version-bump.js` with the actual `.mjs` names.
- Remove `.eslintignore` after confirming the flat config contains all intended ignores; ESLint flat config does not use the legacy ignore file in the same way.
- Configure the parser project for the actual TypeScript files and avoid linting generated output.

Recommended TypeScript cleanup:

- Include both `**/*.ts` and `**/*.tsx`.
- Remove obsolete `baseUrl` if it is not required by the final import strategy.
- Replace legacy `moduleResolution: "node"` with the resolution mode appropriate to the final TypeScript version and bundler.
- Consider `noEmit: true`, `noUnusedLocals`, and `noUnusedParameters` after the initial rename cleanup.
- Prefer relative imports or one documented alias strategy. The current mix of `main`, `src`, `React`, and `Views` aliases makes moving files risky.
- Align `lib` and JSX settings with the actual browser/WebView target instead of listing overlapping ES versions unnecessarily.

## Settings and Data Model Hardening

- Add `settingsVersion` and a pure normalization function.
- Validate enum values and provider objects loaded from `data.json`.
- Clone or replace arrays during updates so React sees stable, intentional state transitions.
- Debounce or batch saves for text inputs; avoid saving and rebuilding the entire settings screen on every keystroke.
- Keep persisted data small: preferences, vault-relative paths, and custom quote text only.
- Ensure an empty custom quote list falls back safely instead of selecting from an empty array.
- Keep external URLs and fetched quote data out of persisted settings unless there is a clear cache policy.

## Test and Validation Plan

Before implementation is considered complete:

- Run `npm run typecheck` and `npm run lint` in CI.
- Add unit tests for settings defaults, enum validation, image-extension/MIME mapping, bookmark flattening, and quote fallback behavior.
- Add service tests with a fake vault adapter covering `list`, `readBinary`, missing folders, nested folders, unsupported files, deleted files, and binary conversion cleanup.
- Add React tests for loading, empty, error, and populated states; settings updates; keyboard search; and view unmount cleanup.
- Manually test current Obsidian desktop and mobile builds with a vault-synced image folder.
- Test a vault where the Bookmarks core plugin is disabled.
- Test plugin reload, view recreation, multiple leaves, and closing/reopening the view.
- Test fresh install and upgrade from the current settings shape.
- Run a repository-wide search for `Beautitab`, `beautitab`, `obsidian-beautitab`, `fs`, `path`, `electron`, `internalPlugins`, and `@ts-ignore` after implementation. Exclude `updates.ts` from this audit by design.

## Suggested Implementation Order

1. Confirm the final plugin id policy and complete the maintained-code rename.
2. Update dependencies, Node engine declaration, scripts, ESLint flat config, and TypeScript inclusion.
3. Add settings versioning and a typed settings store.
4. Replace OS-folder/Electron/base64 background handling with vault adapter services and vault-relative settings.
5. Convert the custom view from `FileView` to `ItemView` and make activation/recreation lifecycle-safe.
6. Isolate or remove private bookmarks and command-registry integrations.
7. Split the React composition root into data services/hooks and a few meaningful presentational components.
8. Add focused unit/component tests and CI validation.
9. Update README, screenshots/alt text, release workflows, manifest metadata, and `versions.json` as applicable.
10. Validate on desktop and mobile before publishing a new minimum Obsidian version.

## Definition Of Done

- No maintained runtime path imports Node filesystem or Electron APIs.
- Background images are discovered and read from vault-relative paths through the Obsidian vault adapter and work on mobile.
- Plugin settings contain no embedded image bytes.
- No unguarded private Obsidian API access remains in the core path.
- The view uses the public custom-view lifecycle and survives recreation.
- The maintained codebase contains no accidental Beautitab branding.
- `updates.ts` remains untouched as comparison material.
- Node 24+ is documented and enforced for development tooling, while output remains compatible with Obsidian's desktop renderer and mobile WebView.
- Type-check, lint, build, and focused tests run from documented package scripts.
- Upgrade, fresh-install, reload, and mobile scenarios have been manually verified.

## API References

- [Obsidian Developer Docs Home](https://docs.obsidian.md/Home)
- [Build a plugin](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Views](https://docs.obsidian.md/Plugins/User+interface/Views)
- [Official TypeScript API definitions](https://github.com/obsidianmd/obsidian-api)
- [Official sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin) (consulted for esbuild/build configuration only)
