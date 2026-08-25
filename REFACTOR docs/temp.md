# Tab Candy Implementation Checklist

Use this checklist alongside [REFACTOR.md](REFACTOR.md). It is ordered by dependency: make the decisions that affect compatibility first, then establish a clean toolchain, migrate data and runtime behavior, restructure the UI, and validate release readiness.

`updates.ts` is comparison material and is intentionally excluded from all rename, cleanup, lint, deletion, and validation work below.

## 0. Decisions And Baseline

Full rationale for every item below is in [REFACTOR-DECISIONS.md](REFACTOR-DECISIONS.md); current-state capture is in [BASELINE.md](BASELINE.md).

- [x] Confirm the final Obsidian plugin id policy. The plugin id is now `tabcandy`; this is a deliberate installation migration.
- [x] Record the supported minimum Obsidian version for the new release based on the APIs actually used. **Decision: `0.15.0`, unchanged** — the newest API in use (`requestUrl`) only requires 0.13.25, and 0.15.0 already clears that.
- [x] Confirm the supported Node range as `>=24` for development and CI. **Confirmed.**
- [x] Decide whether bookmarks remain a feature. If retained, accept that they require a guarded private-API adapter until a supported public API exists. **Decision: retain, behind a guarded adapter** that returns an empty list rather than throwing when Bookmarks is disabled/missing/malformed.
- [x] Decide whether folder scanning is non-recursive, matching current behavior, or recursive. **Decision: non-recursive**, matching current behavior and existing settings copy.
- [x] Decide whether Tab Candy should continue hijacking every empty leaf on `layout-change`. Prefer an explicit activation command unless product requirements say otherwise. **Decision: explicit activation command + reusable `activateView()` helper is mandatory; blanket hijacking becomes an opt-in setting (default on) layered on the same helper**, not a separate uncontrolled code path.
- [x] Create a disposable development vault. Do not develop against the primary vault. **Convention documented** (a vault path outside the repo, e.g. `~/.obsidian-dev-vaults/tab-candy/`, wired through the env var that replaces the hard-coded Windows path in §1). Physical vault creation is a local, out-of-sandbox action item for whoever runs the dev loop.
- [x] Capture a baseline of current behavior: settings, custom quotes, built-in backgrounds, vault images, local images, search providers, bookmarks, recent files, view opening, and reload behavior. **Done — see `BASELINE.md`.**
- [x] Confirm the working tree contains no unrelated changes that should be preserved. Do not use `updates.ts` as a source file for the refactor. **Verified clean**; `updates.ts` does not exist yet on this branch, so nothing under that name is at risk today, but the exclusion rule stands.

## 1. Toolchain And Build

- [ ] Add `engines.node` to `package.json` with the agreed Node 24+ range.
- [ ] Upgrade `@types/node` to match Node 24.
- [ ] Upgrade TypeScript, esbuild, React typings, and ESLint packages as a coordinated update.
- [ ] Add the flat-config dependencies imported by `eslint.config.js`: `eslint`, `@stylistic/eslint-plugin`, and `eslint-plugin-obsidianmd` at compatible versions.
- [ ] Update the `obsidian` package to the current API declarations used for implementation.
- [ ] Remove the direct `electron` dependency after runtime Electron usage is gone.
- [ ] Add package scripts for `typecheck`, `lint`, and tests.
- [ ] Make `build` run typecheck and the production bundle in sequence.
- [ ] Update `eslint.config.js` to lint `.ts`, `.tsx`, and intentionally selected build files.
- [ ] Correct stale flat-config ignore entries for `.mjs` files and generated output.
- [ ] Remove `.eslintignore` only after its exclusions are represented in flat config.
- [ ] Update `tsconfig.json` to include `.ts` and `.tsx` files.
- [ ] Remove obsolete TypeScript options such as `baseUrl` and legacy `moduleResolution` if the final import strategy no longer needs them.
- [ ] Choose one import strategy: relative imports or one documented alias configuration.
- [ ] Evaluate `noUnusedLocals` and `noUnusedParameters` after the rename cleanup.
- [ ] Replace the hard-coded Windows development output path with an environment variable or documented local setting.
- [ ] Confirm the emitted browser target remains compatible with Obsidian desktop and mobile WebViews.
- [ ] Decide whether to keep JSON package metadata imports or pass the plugin version through the build environment.
- [ ] Run `npm install` and commit the resulting lockfile changes only with the dependency update.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.

## 2. Branding And Metadata

- [x] Apply the approved display name, `Tab Candy`, to maintained source and documentation.
- [ ] Apply the approved class and identifier naming convention: `TabCandyPlugin`, `TabCandySettings`, `TabCandyView`, and consistent `tabcandy` or `tab-candy` CSS names.
- [x] Update `manifest.json`.
- [x] Update `manifest-beta.json`.
- [x] Update `package.json`; this repository does not use a tracked `package-lock.json`.
- [x] Update release workflow plugin paths under `.github/workflows/`.
- [ ] Update README title, prose, installation URL, links, and image alt text.
- [x] Update stale comments and modal descriptions that say Beautitab.
- [x] Search maintained files for `Beautitab`, `beautitab`, and `obsidian-beautitab`.
- [x] Review every remaining match and document intentional historical references, if any. Remaining matches are limited to historical attribution and refactor/checklist context.
- [ ] Keep `updates.ts` unchanged even if it contains old branding.

## 3. Settings Schema And Persistence

- [ ] Define a settings schema version.
- [ ] Add a pure `normalizeSettings()` function that merges defaults and validates loaded values.
- [ ] Validate enum-backed settings at the load boundary instead of trusting `data.json`.
- [ ] Validate search provider objects and fall back to the built-in provider when malformed.
- [ ] Define the new vault-relative background fields, for example `backgroundsFolder` and `backgroundFiles`.
- [ ] Decide how legacy `localBackgroundsDirectory` and base64 `localBackgrounds` values are handled.
- [ ] Show a one-time migration notice for old OS-folder settings.
- [ ] Do not read legacy OS files or silently copy them into plugin data.
- [ ] Preserve ordinary display settings and custom quotes during migration.
- [ ] Keep image bytes and fetched quote data out of persisted plugin settings.
- [ ] Add a typed settings store with `get`, `update`, `subscribe`, and persistence, or implement an equally typed narrow alternative.
- [ ] Replace the untyped `Observable`.
- [ ] Ensure unsubscribe removes the subscriber rather than retaining it.
- [ ] Batch or debounce text-setting saves and avoid rebuilding the entire settings screen on each keystroke.
- [ ] Test fresh defaults, partial settings, malformed settings, legacy settings, and repeated migrations.

## 4. Vault-Based Backgrounds And Mobile Support

- [ ] Remove runtime imports of Node `fs` and `path` from maintained plugin code.
- [ ] Remove runtime Electron imports and native file/folder dialogs.
- [ ] Centralize supported image extensions and MIME types, including the intended `jpg`, `jpeg`, `png`, `webp`, and `gif` behavior.
- [ ] Implement vault-relative folder normalization and validation.
- [ ] Implement folder discovery with `app.vault.adapter.list(folderPath)`.
- [ ] Filter unsupported files and define the recursive/non-recursive behavior.
- [ ] Load image bytes with `app.vault.adapter.readBinary(filePath)`.
- [ ] Use `app.vault.readBinary(TFile)` where a `TFile` is already available and that is simpler.
- [ ] Convert binary data to a browser-compatible object URL or data URL outside settings storage.
- [ ] Revoke object URLs when backgrounds change and when the view closes.
- [ ] Cache only vault-relative paths and lightweight metadata.
- [ ] Handle missing folders, empty folders, unsupported files, deleted files, renamed files, and read failures gracefully.
- [ ] Make “Sync now” available on desktop and mobile.
- [ ] Replace the OS folder picker with a vault-folder chooser.
- [ ] Expand the vault image picker to every supported image format.
- [ ] Consider vault create/modify/delete/rename events for cache invalidation.
- [ ] Test with a synced vault on desktop.
- [ ] Test with the same synced vault on mobile.
- [ ] Test after adding, modifying, renaming, deleting, and syncing image files.

## 5. Public Obsidian API And Lifecycle

- [ ] Change the custom view from `FileView` to `ItemView` because Tab Candy is not file-backed.
- [ ] Keep one stable exported view type constant.
- [ ] Implement current `ItemView` lifecycle methods with current typings.
- [ ] Clear the view content element before mounting React.
- [ ] Unmount the React root in `onClose()`.
- [ ] Remove global view-instance assumptions.
- [ ] Use `workspace.getLeavesOfType()` when locating existing Tab Candy views.
- [ ] Add or refine an activation helper that reuses an existing leaf, creates one if necessary, and reveals it.
- [ ] Register Obsidian events with `registerEvent()`.
- [ ] Register long-lived DOM listeners with `registerDomEvent()`.
- [ ] Register plugin-owned intervals with `registerInterval()`.
- [ ] Remove the empty `onunload()` if no explicit cleanup remains.
- [ ] Remove production mobile-emulation code and its `@ts-ignore` usage.
- [ ] Replace enum-narrowed `Setting` callbacks with string-to-enum validation at the boundary.
- [ ] Remove avoidable `@ts-ignore` directives.
- [ ] Run a search for private/internal API usage and classify every remaining match.

## 6. Commands, Bookmarks, And Network Integrations

### Commands

- [ ] Stop enumerating `this.app.commands.commands` from core UI code.
- [ ] Define supported search providers as explicit command ids or isolated provider adapters.
- [ ] Add runtime availability checks that do not expose private registries throughout the app.
- [ ] Keep `switcher:open` as the default only after verifying it through the current API/runtime behavior.
- [ ] Show a clear Notice and fail gracefully when a configured provider is unavailable.

### Bookmarks

- [ ] Decide whether to remove bookmarks, retain them as an optional integration, or replace the implementation when a supported API is available.
- [ ] If retained, isolate all `internalPlugins` access in one guarded adapter.
- [ ] Return an empty result when Bookmarks is disabled, unavailable, malformed, or missing.
- [ ] Type bookmark groups and entries instead of using `any` throughout the core path.
- [ ] Test all-bookmarks, group-bookmarks, nested groups, empty groups, and missing Bookmarks cases.

### Network requests

- [ ] Keep `requestUrl()` as the external request boundary.
- [ ] Make quote failures return a predictable fallback state.
- [ ] Make version checking best-effort and non-blocking for plugin startup.
- [ ] Add appropriate error handling and cancellation/timeout behavior supported by the current API.
- [ ] Avoid making view registration depend on network availability.

## 7. React Restructure

- [ ] Reduce `App.tsx` to a composition root and presentation orchestration.
- [ ] Move background discovery/loading and URL cleanup into a background service or hook.
- [ ] Move recent-file queries into a typed data service or hook.
- [ ] Move bookmarks behind the bookmark adapter.
- [ ] Move quote loading, error, and loading state into a quote service or hook.
- [ ] Move command-provider availability and execution behind a command service.
- [ ] Move time ticking and formatting into a focused hook or pure utility.
- [ ] Isolate icon adaptation in one component.
- [ ] Remove the context if the view can pass a small typed model and callbacks directly.
- [ ] Keep only meaningful presentational boundaries, such as `SearchButton`, `RecentFiles`, `Bookmarks`, `Quote`, and `BackgroundSurface`.
- [ ] Avoid creating a component for every small text block.
- [ ] Replace `dangerouslySetInnerHTML` where practical; otherwise isolate and constrain it.
- [ ] Ensure keyboard search behavior works with mobile and desktop input expectations.
- [ ] Test loading, empty, error, and populated render states.
- [ ] Test view unmount, settings updates, timer cleanup, and background cleanup.

## 8. Consolidate The File Structure

- [ ] Move maintained source under a coherent `src/` structure.
- [ ] Choose a small number of meaningful areas, such as `app`, `services`, `ui`, `settings`, and `types`.
- [ ] Combine `Enums.ts` and `Interfaces.ts` into `types.ts` if the type surface remains small.
- [ ] Combine tiny time utilities if doing so improves discoverability.
- [ ] Fold the capitalization helper into the settings option-label code if it has no other meaningful consumer.
- [ ] Keep modals separate only when their behavior warrants it; otherwise group related small modals.
- [ ] Remove the context when it no longer provides a useful dependency boundary.
- [ ] Remove the custom `Observable` after the settings store migration is complete.
- [ ] Remove dead imports, unused fields, unused result properties, and `Function`-typed callbacks.
- [ ] Keep `screenshots/` and release documentation unless there is a separate product decision to remove them.
- [ ] Do not delete, rename, or lint-scope `updates.ts` as part of this work.
- [ ] Update esbuild entry points and import paths after moves.
- [ ] Run typecheck immediately after structural moves.

## 9. Tests And CI

- [ ] Add unit tests for settings defaults and normalization.
- [ ] Add unit tests for settings migration and legacy data handling.
- [ ] Add unit tests for enum/provider validation.
- [ ] Add unit tests for image-extension and MIME mapping.
- [ ] Add fake-adapter tests for `list()` and `readBinary()`.
- [ ] Test missing folders, nested folders, unsupported files, unreadable files, and deleted files.
- [ ] Test object URL creation and revocation.
- [ ] Add quote fallback and network-failure tests.
- [ ] Add bookmark flattening and disabled-plugin tests, if bookmarks remain.
- [ ] Add React tests for major display states and user actions.
- [ ] Add view lifecycle tests for open, close, recreate, and multiple leaves.
- [ ] Add CI jobs for Node 24+, typecheck, lint, tests, and production build.
- [ ] Ensure CI never requires an Obsidian desktop or Electron runtime for unit tests.
- [ ] Keep a manual desktop/mobile test matrix for APIs that cannot be fully mocked.

## 10. Release And Documentation

- [ ] Update `manifest.json` version and minimum Obsidian version.
- [ ] Update `manifest-beta.json` consistently.
- [ ] Update `versions.json` for backward-compatible version/minimum-version mappings.
- [ ] Verify the release workflow uses the approved plugin id and output paths.
- [ ] Confirm the release artifact contains `manifest.json`, bundled `main.js`, and compiled styles.
- [ ] Update README setup instructions for Node 24+.
- [ ] Update README background instructions to describe vault folders and mobile support.
- [ ] Remove claims that local computer folders are supported if that feature is removed.
- [ ] Document migration behavior for existing users.
- [ ] Document desktop and mobile verification results.
- [ ] Review screenshots and alt text for old branding.
- [ ] Check the community plugin listing requirements before publishing.

## 11. Final Audit And Sign-Off

- [ ] Run `npm run typecheck` successfully.
- [ ] Run `npm run lint` successfully.
- [ ] Run the full test suite successfully.
- [ ] Run `npm run build` successfully.
- [x] Search maintained files for `Beautitab`, `beautitab`, and `obsidian-beautitab`; review every match. Remaining matches are intentional historical attribution and refactor/checklist context.
- [ ] Search maintained runtime files for `fs`, `path`, `electron`, and Node-only globals.
- [ ] Search maintained runtime files for `internalPlugins`, private command registries, and `@ts-ignore`.
- [ ] Verify `updates.ts` was not modified by the refactor.
- [ ] Verify no image bytes are stored in plugin settings after migration.
- [ ] Verify vault images work on desktop and mobile.
- [ ] Verify plugin reload and view recreation do not leak timers, subscriptions, or object URLs.
- [ ] Verify missing optional integrations fail gracefully.
- [ ] Verify fresh installation and upgrade from the abandoned version.
- [ ] Verify multiple view leaves and closing/reopening behavior.
- [ ] Verify release artifacts in a clean install.
- [ ] Record the final supported Node and minimum Obsidian versions.
- [ ] Publish only after the manual desktop/mobile matrix is green.

## Suggested Milestones

### Milestone 1: Buildable Baseline

Complete sections 0, 1, and 2. The renamed project should type-check, lint, build, and have a documented plugin-id decision.

### Milestone 2: Mobile-Safe Data Layer

Complete sections 3 and 4. Vault-relative backgrounds, settings migration, and binary loading should work without Node or Electron runtime APIs.

### Milestone 3: API-Safe Runtime

Complete sections 5 and 6. The custom view should use `ItemView`, lifecycle cleanup should be explicit, and private integrations should be isolated or removed.

### Milestone 4: Smaller React Surface

Complete sections 7 and 8. React should render typed data through meaningful boundaries, with the source tree reduced to a few coherent areas.

### Milestone 5: Release Candidate

Complete sections 9, 10, and 11. Automated checks, manual desktop/mobile validation, migration testing, and release documentation should all be complete.