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

- [x] Add `engines.node` to `package.json` with the agreed Node 24+ range. `>=24`.
- [x] Upgrade `@types/node` to match Node 24. `^24.9.2`.
- [x] Upgrade TypeScript, esbuild, React typings, and ESLint packages as a coordinated update. TypeScript held at **5.9.3**, not the newly-GA'd TypeScript 7 — `typescript-eslint`'s peer range is `<6.1.0` and a GitHub issue requesting TS7 support was closed "not planned" (blocked on TS7's stable programmatic API, expected in 7.1). **Decision: split setup.** `typescript` 5.9.3 stays the source of truth for `npm run typecheck` and for ESLint's type-aware rules; `@typescript/native-preview` (the `tsgo` binary) added as a second, non-gating `npm run typecheck:fast` script — not wired into `build` or CI. Revisit swapping to TS7 for real once `typescript-eslint`/`eslint-plugin-obsidianmd` support it. esbuild bumped 0.19.8 → 0.28.2; forced a coordinated bump of `esbuild-sass-plugin` 2.16.0 → 3.7.0, which changed its sass engine dependency from bundled pure-JS `sass` to a peer dependency on `sass-embedded` (native binary, added as an explicit devDependency) — a real environment-size/platform-binary tradeoff, not just a version bump. React/`@types/react`/`@types/react-dom` held at latest **18.x** (18.3.x), not bumped to 19, since only typings were in scope here, not a React major migration.
- [x] Add the flat-config dependencies imported by `eslint.config.js`: `eslint`, `@stylistic/eslint-plugin`, and `eslint-plugin-obsidianmd` at compatible versions. None of these were actually installed before this pass — `eslint.config.js` imported packages that weren't in `package.json` at all, so `npm run lint` could not have run previously. Also required, not anticipated at the outset: `typescript-eslint` (unified meta-package), `@eslint/js`, and `@eslint/json` — all are peer dependencies of `eslint-plugin-obsidianmd` that its own `package.json` declares but its README doesn't mention installing. `@eslint/json` had to be pinned to the **exact** version obsidianmd's peer range specifies (`0.14.0`), and `@eslint/js` pinned to `^9.30.1` rather than its own latest (`10.0.1`) — obsidianmd 0.4.2 hasn't updated its peer range for ESLint 10 yet, even though ESLint 10 itself is used at the top level without issue.
- [x] Update the `obsidian` package to the current API declarations used for implementation. Was pinned to the literal floating string `"latest"` (no version pin at all — nondeterministic across installs/CI runs); now pinned to `^1.13.1`.
- [x] Remove the direct `electron` dependency after runtime Electron usage is gone. **Sequencing note:** originally scoped to happen after §4's vault-adapter rebuild. Pulled forward and done now instead, as an explicit stopgap decision, because `npm audit` flagged 2 high-severity CVEs against the pinned `electron@25.8.1`. The dependency and its `fs`/`path`/`electron` runtime imports are fully removed from `main.ts` and `src/Settings/Settings.ts`, but the three features they backed are **disabled, not migrated**: OS-folder background sync (`syncLocalBackgroundsFromDirectory()`, deleted), the "Browse" folder picker, and the "Add local image" file picker. A settings-tab notice now tells anyone with a pre-existing `localBackgroundsDirectory` value that the feature is temporarily unavailable and points them at "Add vault image" in the meantime. **§4 still needs to build the real vault-relative replacement from scratch** — this was a removal, not a head start on the migration. `npm audit` now reports 0 vulnerabilities.
- [x] Add package scripts for `typecheck`, `lint`, and tests. `typecheck` and `lint` added (plus `typecheck:fast` for the tsgo split, see above). **Test script still open** — no test runner has been chosen or wired up yet; that's §9.
- [x] Make `build` run typecheck and the production bundle in sequence. `build` runs `pnpm run typecheck && node esbuild.config.js production` (updated from `npm run` when pnpm was adopted for real, later in this section; `esbuild.config.mjs` → `.js` rename happened later still — see the target/output-path entry below).
- [x] Update `eslint.config.js` to lint `.ts`, `.tsx`, and intentionally selected build files. `.tsx` was missing from the files glob entirely — React components were never actually being linted.
- [x] Correct stale flat-config ignore entries for `.mjs` files and generated output. At the time: `esbuild.config.js`/`version-bump.js` in the ignore list corrected to their real `.mjs` names; `dist/**` added (wasn't ignored at all before). **Superseded later in this section**: both files were subsequently renamed back to `.js` (see the target/output-path entry below, `"type": "module"` in `package.json` makes the `.mjs` extension unnecessary — plain `.js` is ESM project-wide now), so the ignore list points at `.js` names again today, this time because that's genuinely what the files are called, not because of a stale copy-paste.
- [x] Remove `.eslintignore` only after its exclusions are represented in flat config. Confirmed the flat config's `ignores` array already covered everything in it (`node_modules/`, `main.js`); removed.
- [x] Update `tsconfig.json` to include `.ts` and `.tsx` files. `include` was `["**/*.ts"]` only — same blind spot as the ESLint glob above; every `.tsx` file was silently skipped by `tsc` too.
- [x] Remove obsolete TypeScript options such as `baseUrl` and legacy `moduleResolution` if the final import strategy no longer needs them. **Forced, not chosen:** TypeScript 7/`tsgo` hard-errors on `baseUrl` (`TS5102: Option 'baseUrl' has been removed`) regardless of whether the project ever moves to TS7 for real, so it had to go now to keep `typecheck:fast` usable at all. Replaced with the documented equivalent, `paths: { "*": ["./*"] }`, which both `tsc` and esbuild's own tsconfig-aware resolution honor identically — verified no change in either compiler's behavior. `moduleResolution` changed `node` → `bundler` (the modern match for an esbuild-bundled project on TS 5.9+). **This did not touch the actual mixed-alias import style** (`import x from "src/Utils/Observable"` and `import y from "main"` sitting alongside genuine relative imports) that REFACTOR.md flags as the real hazard — only the compiler mechanism underneath it changed. The next line item is still fully open.
- [ ] ~~Choose one import strategy~~ **Moved to §8** — see that section. Resolving it properly means touching import lines across most of the file tree, which is the same work §8's file moves already require; no reason to touch every affected file twice on two different passes.
- [ ] ~~Evaluate `noUnusedLocals` and `noUnusedParameters` after the rename cleanup~~ **Moved to §8** — see that section. Its own stated trigger ("after the rename cleanup") was never really a toolchain-version concern; it's a dead-code sweep, and belongs with §8's "remove dead imports, unused fields... `Function`-typed callbacks" cleanup rather than living in §1 by accident of tsconfig proximity.
- [x] Replace the hard-coded Windows development output path with an environment variable or documented local setting. **Went further than planned, on request**: rather than parameterizing the dev-mode path with an env var, the `outdir` ternary was removed entirely — `esbuild.config.js` (renamed from `.mjs` in this same pass; `package.json`'s `"type": "module"` already makes plain `.js` files ESM project-wide, so the `.mjs` extension trick was pure legacy weight with nothing left to justify it — `version-bump.js` renamed the same way) now always builds to `./dist/`, for both dev and prod. The one-time "point your dev vault's plugin folder at this directory" step (a symlink) is a per-developer, out-of-sandbox action documented alongside the existing disposable-dev-vault convention, not something the build tool needs to know about. This also permanently retires the stale path that pointed at a different, previous plugin's folder (`obsidian-canvas-dailynote`) — that whole branch no longer exists to be wrong.
- [x] Confirm the emitted browser target remains compatible with Obsidian desktop and mobile WebViews. **Settled with real numbers, not left as a guess.** Researched Obsidian's actual current runtime: desktop ships Electron 43.x (modern), but Obsidian's Electron/"installer" version is decoupled from the app's own auto-updater and can lag behind on machines that haven't been manually reinstalled — "whatever's current" isn't a safe floor. Mobile is a WKWebView (iOS)/system WebView (Android) via Capacitor, not Electron at all; Obsidian's own plugin docs flag real engine fragmentation in the wild (e.g. regex lookbehind needs iOS 16.4+). **Decision: ES2020**, applied consistently to `tsconfig.json`'s `target`/`lib` (collapsed from the overlapping `ES5`/`ES6`/`ES7` stack to one canonical `["DOM", "ES2020"]`, per REFACTOR.md's own "don't list overlapping ES versions unnecessarily" guidance) and `esbuild.config.js`'s `target`. This is also just honest about what the codebase already assumed: optional chaining and nullish coalescing are already used pervasively throughout, and §1's `@types/node`-lib-leak finding already meant the *actual* checked lib was silently ES2020 regardless of what was declared. The three previously-disagreeing numbers (declared `ES6`/`ES5-7`, actually-leaked `ES2020`, esbuild's `es2018`) are now one number, agreed everywhere. Full reasoning, including why "current Electron" isn't trustworthy as a floor, is in `REFACTOR-DECISIONS.md`.
- [x] Decide whether to keep JSON package metadata imports or pass the plugin version through the build environment. **Decision: keep the import**, fix the syntax instead of routing around it. `esbuild.config.mjs` (since renamed to `.js`, see above) imported `package.json` via the old `assert { type: "json" }` syntax, which Node 22+ rejects outright (`SyntaxError: Unexpected identifier 'assert'`) — this made `node esbuild.config.mjs production` fail every time it was reached, unconditionally, on any Node version this project now targets. This had never been caught because `npm run build` had never once reached the esbuild stage before this pass (see below). Fixed by switching to the current import-attributes syntax, `with { type: "json" }`.
- [x] Run `npm install` and commit the resulting lockfile changes only with the dependency update. **Superseded — switched to pnpm.** `package-lock.json` deleted, `pnpm@11.24.0` pinned via `packageManager` in `package.json`, `pnpm-lock.yaml` is now the tracked lockfile. Required one piece of real project-specific config, contrary to the assumption that a small single-package project wouldn't need any: `esbuild` and `@parcel/watcher` (a `sass-embedded` transitive dependency) both have build scripts pnpm blocks by default, allowed explicitly via `pnpm-workspace.yaml`'s `allowBuilds` (verified each actually does something before allowing it, rather than approving blindly). Note for anyone touching this later: **pnpm 11 removed the `pnpm` field from `package.json` entirely** — that config now lives only in `pnpm-workspace.yaml`, silently, with no warning if you put it in the old place. All `npm run`/`npm install` references elsewhere in this document and in `package.json` itself (the `build` script's internal call) are now `pnpm` equivalents.
- [x] Run `npm run typecheck`. Clean (`tsc --noEmit --skipLibCheck`, exit 0).
- [x] Run `npm run lint`. Runs for the first time ever this pass (see dependency note above). Mechanical/stylistic findings (193 `@stylistic/quotes`, 4 `@stylistic/indent`) fixed via `eslint --fix`. **Caution documented, not just a footnote:** unscoped `eslint --fix` is not purely mechanical — it also applies "suggestion"-level autofixes for every other enabled rule, not just the ones intended. It silently rewrote 9 `any` → `unknown` (a real, breaking type-strictness change, `@typescript-eslint/no-explicit-any`'s autofix) and stripped one load-bearing `as any` cast entirely (`@typescript-eslint/no-unnecessary-type-assertion`'s autofix), both of which broke `npm run typecheck` immediately after. Caught by running the full pipeline after `--fix` rather than trusting its exit code; both reverted by hand, file by file, confirmed against a clean `git diff`. **For future stylistic-only cleanup passes, scope it explicitly**: `eslint . --fix --fix-type layout` (or `layout,problem`, excluding `suggestion`) to avoid this exact class of surprise recurring in later sections. 342 real errors / 53 warnings remain post-fix, clustered almost entirely around private-API access (`no-unsafe-*`, `no-explicit-any` — §6/§8's job) plus a few smaller, possibly-real findings worth a closer look in their proper sections: `no-floating-promises` (24, unawaited async calls — not previously documented anywhere), `no-deprecated` (18, likely surfaced by the `obsidian` package version bump — worth checking what's now flagged deprecated against the actual API in use), `no-duplicate-enum-values` (2, a real bug if genuine), `no-unsafe-enum-comparison` (12). None of these were investigated or fixed in this pass beyond what's noted below — deliberately left for their respective later sections rather than pulled forward. **Correction, found later in the same section while renaming the `.mjs` build files:** the original 342/53 breakdown was undercounted — it was tallied with a regex (`@[a-z-]+/[a-z-]+`) that only matches scoped rule names, silently missing bare-prefixed ones like `obsidianmd/settings-tab/prefer-setting-definitions` and `depend/ban-dependencies`. Those findings existed the whole time; they just weren't named. One of them is real and easy: `depend/ban-dependencies` flags the `builtin-modules` devDependency as replaceable by Node's own `node:module` (`builtinModules`/`isBuiltin()`), which this project already requires (Node ≥24) — not fixed yet, flagged for whoever picks this up.
- [x] Run `npm run build`. **This is the first time this repository's production build has completed successfully in this branch's history** — every prior attempt in this session failed at the `typecheck &&` step before ever reaching esbuild, which is exactly how two independent, pre-existing, unrelated-to-this-session bugs stayed hidden until now: the JSON-import-assertion failure above, and a stale Sass `@use` path in `styles.scss` (`@use "src/CustomQuotesModel/CustomQuotesModel"`, pointing at a directory that doesn't exist — the real file is `src/Utils/CustomQuotesModel.scss`). Both fixed; `npm run build` now produces `dist/main.js`, `dist/manifest.json`, `dist/styles.css` cleanly from a fresh clean state.

### Findings surfaced during §1 that belong to later sections

These were discovered incidentally while doing toolchain work above, not sought out, and are recorded here plus cross-referenced in their real sections so they aren't lost or duplicated as "new" discoveries later:

- **`@types/node` silently overrides declared `lib`.** `@types/node`'s own `index.d.ts` has a hardcoded `/// <reference lib="es2020" />`, which widens the *actual* checked JS-feature lib to ES2020 the moment `@types/node` is installed at all, regardless of what `tsconfig.json`'s own `lib` array says. This was masking real gaps: `tsc` was quietly checking against ES2020 the whole time; `tsgo` doesn't do this automatic widening (or the automatic `@types/*` inclusion that triggers it) at all without an explicit `"types"` array. Fixed by adding `"types": ["node", "react", "react-dom"]` to `tsconfig.json`, making the explicit inclusion (and therefore the lib-widening) intentional and visible instead of an invisible side effect — this is what the still-open "confirm emitted browser target" item above is about reconciling for real.
- **`tsc` and `tsgo` disagree on strict-family defaults given the identical config.** After the `types` fix, `tsgo` still reported 10 errors `tsc` didn't, on the same `tsconfig.json` — `strictPropertyInitialization` and `strictFunctionTypes` violations. Confirmed this is `tsgo` defaulting parts of `strict` mode to on even though neither `strict` nor those individual flags were set anywhere (temporarily toggling both flags on in `tsc` produced the byte-identical error list). **Decision: turned both on for real**, then fixed all 10 resulting errors rather than deferring them, since deferring would mean shipping a documented-but-unfixed regression with no benefit. Specifics:
  - `main.ts`: `TabCandyPlugin.settings`/`settingsObservable` are set in async `onload()`, not the constructor — safe in practice (Obsidian guarantees `onload()` resolves before anything else touches the instance) but was previously invisible to the compiler. Marked with definite-assignment (`!`) rather than unioned with `undefined`, with a comment explaining why that's safe here.
  - `src/modals/ChooseImageSuggestModal.ts` and `src/modals/ChooseSearchProvider.ts`: both had a `result` field that was write-only — assigned in `onChooseItem`, never read anywhere (delivery already happens via the `onSubmit` callback). Removed outright rather than patched, which is exactly what §8's "Remove... unused modal result fields" already calls for — done early as a side effect of chasing this flag, not a separate pass.
  - `src/Settings/Settings.ts`: **this is the exact bug §5 already names** ("Replace enum-narrowed `Setting` callbacks with string-to-enum validation at the boundary") — confirmed real, not theoretical. Four `Setting.addDropdown().onChange()` callbacks (background theme, time format, bookmark source, quote source) declared their parameter as the settings enum type directly, when Obsidian's actual `DropdownComponent.onChange` signature is `(value: string) => any`. Fixed with a small boundary-validation type guard (`isEnumValue`) added to the top of the file, used at each of the four call sites — reject and no-op if the raw string isn't a real enum member, rather than trusting it silently. **A fifth, differently-shaped bug found in the same sweep**: the "Bookmarks group" dropdown's callback was typed `(value: BOOKMARK_SOURCE)`, but `bookmarkGroup` is a free-form `string` field (arbitrary group titles), not a `BOOKMARK_SOURCE` — the annotation was simply wrong, likely copy-pasted from the sibling dropdown above it, not an enum-validation gap. Fixed by removing the incorrect annotation rather than adding a guard.
  - `React/Components/App/App.tsx`: **a genuine latent runtime bug**, not just a type nicety. The bookmarks render block's `.map()` callback declared its parameter as `(file: TFile)`, but `getBookmarks()` (`React/Utils/getBookmarks.ts`) returns `TAbstractFile[]` — a wider type that, per Obsidian's bookmarks model, can include folders. `TAbstractFile`/`TFolder` don't have `.basename`, only `TFile` does. If a user ever bookmarks a folder, `file.basename` would render as `undefined` today, uncrashed but silently wrong, with zero compiler signal. Fixed by narrowing with an actual `file instanceof TFile` guard on the whole render branch (removing a now-redundant duplicate `instanceof` check that was previously buried inside the `onClick` handler instead of guarding the render). **This directly informs §6's Bookmarks section** — `getBookmarks.ts` itself still returns loosely-`any`-typed data internally (untouched in this pass; §6's "Type bookmark groups and entries instead of using `any` throughout the core path" is still fully open) and this render-level symptom is a preview of exactly the class of bug that adapter is meant to prevent at the source.



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
- [x] Define the new vault-relative background fields, for example `backgroundsFolder` and `backgroundFiles`. Both added to `TabCandySettings`/`DEFAULT_SETTINGS` while fixing the deleted §1 folder-sync feature (see §4). Named exactly as REFACTOR.md proposed.
- [ ] Decide how legacy `localBackgroundsDirectory` and base64 `localBackgrounds` values are handled. **Half-decided.** `localBackgroundsDirectory` (the old OS path) now surfaces a plain "no longer used, set a vault folder instead" notice in Settings rather than pretending to still work — a real, if minimal, decision. `localBackgrounds` (base64 images from the manual "Add vault image" button) is **untouched and still fully active** — it still stores raw image bytes directly in settings, exactly as before. This was a deliberate choice to avoid changing a currently-working feature while fixing a broken one, not an oversight, but it means the actual fork this line item asks about is still open: should "Add vault image" be changed to store just a vault-relative path (like the new folder sync does) instead of base64 bytes, for consistency and to actually satisfy the "no image bytes in settings" goal below? Not decided.
- [ ] Show a one-time migration notice for old OS-folder settings. Partially covered by the same inert notice above, but it's a permanent static message, not a one-time dismissible migration notice with a marker (per REFACTOR.md's "keep a one-time migration marker so the notice isn't repeated"). Real one-time-notice mechanics still open.
- [ ] Do not read legacy OS files or silently copy them into plugin data. Holds true in what exists today — the old `syncLocalBackgroundsFromDirectory()` that read OS files was deleted outright in §1, not preserved in any form.
- [ ] Preserve ordinary display settings and custom quotes during migration.
- [ ] Keep image bytes and fetched quote data out of persisted plugin settings. **True for the new `backgroundFiles` field** (paths only, resolved to a URL only at render time via `getBackgroundResourcePath()` — no bytes ever touch settings). **Still false for the pre-existing `localBackgrounds`** (see above) — base64 image bytes are still written to `data.json` on every manual "Add vault image" click, unchanged from before this session.
- [ ] Add a typed settings store with `get`, `update`, `subscribe`, and persistence, or implement an equally typed narrow alternative.
- [ ] Replace the untyped `Observable`.
- [ ] Ensure unsubscribe removes the subscriber rather than retaining it.
- [ ] Batch or debounce text-setting saves and avoid rebuilding the entire settings screen on each keystroke.
- [ ] Test fresh defaults, partial settings, malformed settings, legacy settings, and repeated migrations.

## 4. Vault-Based Backgrounds And Mobile Support

- [x] Remove runtime imports of Node `fs` and `path` from maintained plugin code. Done in §1 as a stopgap; superseded below — this is now genuinely, permanently true, not just true-until-the-replacement-arrives.
- [x] Remove runtime Electron imports and native file/folder dialogs. Same as above — permanent now, not a stopgap pending a later rebuild.
- [x] Centralize supported image extensions and MIME types, including the intended `jpg`, `jpeg`, `png`, `webp`, and `gif` behavior. `BACKGROUND_IMAGE_EXTENSIONS` added in a new `src/Types/Images.ts`, shared by folder sync and the manual vault image picker — fixes a real pre-existing bug where the two allowed different format lists (folder sync allowed all 5, the manual picker only allowed jpg/png). **MIME types specifically are moot, not skipped**: the chosen implementation (see below) never constructs a `data:` URI or needs a MIME string at all, so there's nothing to centralize there.
- [x] Implement vault-relative folder normalization and validation. `normalizePath()` applied in `src/services/backgrounds.ts`.
- [x] Implement folder discovery with `app.vault.adapter.list(folderPath)`. Implemented in `listBackgroundFilesInFolder()`.
- [x] Filter unsupported files and define the recursive/non-recursive behavior. Filtered by the shared extension list; non-recursive, matching the already-locked §0 decision.
- [ ] Load image bytes with `app.vault.adapter.readBinary(filePath)`. **Deliberately not used for the new folder-sync path** — see the decision note below. Still true for the pre-existing "Add vault image" flow, which already used `app.vault.readBinary(TFile)` (the sibling API, see next line) before this session and is unchanged.
- [x] Use `app.vault.readBinary(TFile)` where a `TFile` is already available and that is simpler. Was already true before this session for the manual "Add vault image" flow (`src/Settings/Settings.ts`) — just never checked off. Not used by the new folder-sync path, which only ever has string paths from `adapter.list()`, never `TFile` objects.
- [ ] Convert binary data to a browser-compatible object URL or data URL outside settings storage. **Superseded by a simpler approach for the new folder-sync path** — see decision note below; no binary conversion happens there at all. **Still genuinely open for the existing manual "Add vault image" flow**, which still converts to a base64 `data:` URI and — worse than what this line item even asks — stores that URI directly in settings rather than "outside settings storage." Unchanged from before this session.
- [ ] Revoke object URLs when backgrounds change and when the view closes. **Not applicable under the approach taken** — see decision note below. No object URLs are created for the new folder-sync path, so there's nothing to revoke. Still not addressed for the manual-add path's base64 storage, which isn't a URL-lifecycle problem but is a related storage-bloat one.
- [x] Cache only vault-relative paths and lightweight metadata. True for the new `backgroundFiles` — paths only. Still false for `localBackgrounds` (base64 bytes), unchanged.
- [ ] Handle missing folders, empty folders, unsupported files, deleted files, renamed files, and read failures gracefully. **Partially done.** Missing folder, empty folder, and read failures are handled (`listBackgroundFilesInFolder()` catches and degrades to an empty list rather than throwing, matching the old fs-based version's graceful-failure behavior). **Not yet handled:** a file that's deleted or renamed *after* a sync — `backgroundFiles` would still list its old path until the next sync runs, and `getBackgroundResourcePath()` would happily generate a URL that resolves to nothing (a broken image, not a crash, but not "gracefully handled" either). No `create`/`modify`/`delete`/`rename` event listening exists yet (see below).
- [x] Make "Sync now" available on desktop and mobile. No `isMobile` gate anywhere in the new settings UI or the sync method — this was the entire point of the rebuild.
- [ ] Replace the OS folder picker with a vault-folder chooser. **Half done.** The OS-native folder dialog is gone, replaced with a plain text field for typing a vault-relative path — functional, but not the fuzzy-suggest vault-folder chooser REFACTOR.md actually describes ("an Obsidian suggest modal or a small settings control backed by `adapter.list()`"). A typo'd path just silently syncs zero files rather than being caught at input time. Building a real folder-suggest modal is still open.
- [x] Expand the vault image picker to every supported image format. `ChooseImageSuggestModal` now filters against the same shared `BACKGROUND_IMAGE_EXTENSIONS` list as folder sync, so it picks up `webp`/`gif` it previously rejected.
- [ ] Consider vault create/modify/delete/rename events for cache invalidation. Not implemented — `backgroundFiles` only refreshes on plugin load or an explicit "Sync now" click, same event model the old OS-folder version had (reload/restart/manual button), just now vault-relative. Live invalidation on vault file events is still open.
- [ ] Test with a synced vault on desktop. Not possible from this sandbox — no real Obsidian runtime available to verify against. `pnpm run typecheck`/`typecheck:fast`/`lint`/`build` all pass, and the code paths were reasoned through against the installed `obsidian` type declarations, but that's not the same as an actual desktop verification.
- [ ] Test with the same synced vault on mobile. Same caveat as above — genuinely not verified, only reasoned to be mobile-safe because nothing in the new code touches `fs`, `path`, `electron`, or checks `isMobile`.
- [ ] Test after adding, modifying, renaming, deleting, and syncing image files. Not tested for the same reason; the renamed/deleted-file gap noted above is exactly the kind of thing this test would need to catch.

### Decision: `getResourcePath()` instead of `readBinary()` + object URLs, for the folder-sync path specifically

REFACTOR.md's original sketch for background loading was `adapter.readBinary(filePath)` → convert the returned `ArrayBuffer` to an object URL → revoke it on background change/view close. The folder-sync implementation actually built uses `app.vault.adapter.getResourcePath(path)` instead, which Obsidian provides specifically to turn a vault-relative path into a URL that's directly usable in an `<img src>` or CSS `background-image` — no byte-reading, no `Blob`/`URL.createObjectURL` construction, and therefore no revocation lifecycle to manage at all. This satisfies every actual goal those line items were chasing (no image bytes in settings, mobile-safe, no memory/lifecycle leak) with less code and no cleanup surface to get wrong. The `readBinary`-based line items above are marked as superseded rather than done, since the literal API named in the plan isn't what's used — but the outcome those items exist to achieve is fully met for this specific path.



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
- [x] Replace enum-narrowed `Setting` callbacks with string-to-enum validation at the boundary. **Confirmed real and fixed for the 4 genuine cases** (background theme, time format, bookmark source, quote source dropdowns in `src/Settings/Settings.ts`) via a boundary-validation type guard — found while chasing an unrelated `tsgo`/`tsc` strictness discrepancy in §1, not sought out separately. See §1's "Findings surfaced" note for the full detail, including a 5th, differently-shaped bug (a mistyped, not just unvalidated, `bookmarkGroup` callback) found in the same sweep.
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
- [ ] Type bookmark groups and entries instead of using `any` throughout the core path. **Still fully open**, but a concrete preview of why it matters was found in §1: `getBookmarks.ts` returns `TAbstractFile[]` (bookmarks can be folders, not just files), and a consuming render callback in `App.tsx` was trusting it as `TFile[]` without narrowing — `TAbstractFile`/`TFolder` don't have `.basename`, so a bookmarked folder would have rendered as `undefined` today. That one render-site symptom was patched with an `instanceof TFile` guard as a stopgap, but `getBookmarks.ts` itself is untouched and still loosely typed internally (`any[]` in `flattenBookmarks`, `getBookmarksByGroupName`, `flattenBookmarkGroups`) — this item is the real fix, not the stopgap.
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
- [ ] Remove dead imports, unused fields, unused result properties, and `Function`-typed callbacks. **Partially done, incidentally.** The two unused modal `result` fields named explicitly in this line item (`ChooseImageSuggestModal`, `ChooseSearchProvider`) were already removed in §1 while chasing a `strictPropertyInitialization` error — found because a compiler flag flagged them as uninitialized, then confirmed via a repo-wide grep that `.result` was never read anywhere, so removed rather than initialized. The `Function`-typed callback part of this line is still fully open: `src/Utils/Observable.ts`'s `subscribers: Function[]` and the two matching `Function`-typed props in `src/modals/ConfirmModal.ts`/`CustomQuotesModel.ts` are untouched (these surfaced as `@typescript-eslint/no-unsafe-function-type` lint findings in §1 but were deliberately left for this section rather than pulled forward).
- [ ] Keep `screenshots/` and release documentation unless there is a separate product decision to remove them.
- [ ] Do not delete, rename, or lint-scope `updates.ts` as part of this work.
- [ ] Update esbuild entry points and import paths after moves.
- [ ] Run typecheck immediately after structural moves.
- [ ] Choose one import strategy: relative imports or one documented alias configuration. **Moved here from §1** — this is the real fork behind `tsconfig.json`'s `baseUrl` → `paths` swap in §1 (forced early by `tsgo` hard-erroring on `baseUrl`, not chosen as an architecture decision). The actual mixed style — bare imports like `"src/Utils/Observable"` and `"main"` sitting alongside genuine relative imports — is untouched and belongs here, where files are moving anyway.
- [ ] Evaluate `noUnusedLocals` and `noUnusedParameters`. **Moved here from §1** — its own stated trigger ("after the rename cleanup") always pointed here, not at toolchain version work. Natural pairing with the `Function`-typed-callback/dead-field sweep above: flip the flag, fix what it finds, one pass — same pattern already used for `strictPropertyInitialization`/`strictFunctionTypes` in §1.

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
- [ ] Triage the lint findings deliberately deferred from §1 rather than pulled forward, now that `npm run lint` actually runs for the first time: `no-floating-promises` (24 — unawaited async calls, not previously documented anywhere; check whether any are real fire-and-forget bugs like an unhandled `saveSettings()` rejection, or just event handlers that don't need awaiting), `no-deprecated` (18 — likely surfaced by bumping the `obsidian` types package from an unpinned `"latest"` to `^1.13.1`; check what's now flagged against the current API), `no-duplicate-enum-values` (2 — a real bug if genuine, not investigated), `no-unsafe-enum-comparison` (12 — may already be resolved by §5's enum-boundary-validation fix, may not; re-check count after that lands). None of these were investigated in §1 beyond counting and bucketing them.
- [ ] Add CI jobs for Node 24+, typecheck, lint, tests, and production build.
- [ ] Ensure CI never requires an Obsidian desktop or Electron runtime for unit tests.
- [ ] Keep a manual desktop/mobile test matrix for APIs that cannot be fully mocked.

## 10. Release And Documentation

- [ ] Update `manifest.json` version and minimum Obsidian version.
- [ ] Update `manifest-beta.json` consistently.
- [ ] Update `versions.json` for backward-compatible version/minimum-version mappings.
- [ ] Verify the release workflow uses the approved plugin id and output paths. No workflow files currently exist — removed and deferred; see §9's CI item.
- [ ] Confirm the release artifact contains `manifest.json`, bundled `main.js`, and compiled styles.
- [ ] Update README setup instructions for Node 24+.
- [ ] Update README background instructions to describe vault folders and mobile support.
- [ ] Remove claims that local computer folders are supported if that feature is removed.
- [ ] Document migration behavior for existing users.
- [ ] Document desktop and mobile verification results.
- [ ] Review screenshots and alt text for old branding.
- [ ] Check the community plugin listing requirements before publishing.

## 11. Final Audit And Sign-Off

- [ ] Run `pnpm run typecheck` successfully.
- [ ] Run `pnpm run lint` successfully.
- [ ] Run the full test suite successfully.
- [ ] Run `pnpm run build` successfully.
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