This spec governs how tests get written for Tab Candy. When a setting, background theme, quote source, or bookmark integration gets dreamed up, this document guides where the tests go, what they mock, what "done" looks like, and what isn't worth testing at all.

## Contents

```toc
```

## Philosophy
---

**Minimal overhead. Maximum confidence where it actually matters.**

Coverage numbers are vanity. A file can sit at 100% and still let a real regression through if that 100% is spread evenly across things nobody would notice breaking. What matters is that a short list of genuinely load-bearing behaviors — named below, not inferred from which folder a file lives in — are tested hard enough that a regression cannot hide. Everything else is supplementary: useful, but not load-bearing, and doesn't need the same bar.

### Load-bearing behaviors

- **Settings survive malformed or legacy data without corrupting the user's config.** `normalizeSettings.ts` is the thing standing between a bad `settings.json` and a plugin that loads clean anyway. Every fallback path, every field left over from an old version, every missing field — this is the single highest-consequence file in the codebase. Get it wrong once and it isn't the plugin that looks broken, it's the user's data.
- **The settings store's subscribe/unsubscribe doesn't leak or double-fire.** Load-bearing by definition, not because "settings store" is a category that earns coverage.
- **Background resolution degrades gracefully on a vault someone actually has.** Missing folder, a file deleted mid-session, a malformed nested structure, an unsupported extension. Get this wrong and the plugin doesn't just show a broken image — the view can hang.
- **View lifecycle doesn't leak React roots on repeated open/close.** `TabCandyView`'s `onClose()` actually unmounting, across open → close → reopen and multiple leaves.
- **Private-API access in `bookmarks.ts`/`commands.ts` fails closed, not open.** These touch undocumented Obsidian internals that can shift shape on any update with zero warning. A regression here isn't "a test failed in CI," it's "the plugin explodes on someone's Tuesday update" — the surface most likely to break for reasons entirely outside this codebase's control, which is exactly why it earns the same weight as everything else on this list.

Everything else — a quote fetching correctly, the clock format switching, which CSS class a background theme applies — is real, worth testing, but supplementary. It gets covered because it's cheap to cover once the fakes exist, not because it earns its own coverage target.

### Trust boundaries — test our usage, not the dependency

- We test what our code does with Obsidian's API, never Obsidian's own behavior. `obsidian-test-mocks` is separately, thoroughly covered on its own; that's not ours to re-verify.
- We test what our code does with React, never React itself.
- We test our parsing/handling of a vault's file listing, never the underlying filesystem/adapter behavior a real Obsidian install provides.

## Toolchain
---

### Test runner: Vitest

Vitest is ESM-native, which matters here because this project is `"type": "module"` end to end — no transpilation shims, no CommonJS interop layer fighting the rest of the toolchain. It ships with everything a test suite in this spec actually needs bundled into one dependency rather than assembled from parts: `expect`-style assertions, `vi.fn()`/`vi.useFakeTimers()` for the mocking and fake-timer work Methodology already requires, a jsdom-backed environment for the React hook/component tests, and native V8 coverage for the Ratchet — one install, not a runner plus an assertion library plus a mocking library plus a coverage instrumenter stitched together by hand.

The bigger reason is architectural: Vitest runs on the same engine as the build tool. Once Vite is doing the actual `main.js` build (see below), picking Vitest means the whole toolchain shares one transform/bundler stack instead of running two — the test suite isn't dragging in a second, unrelated pipeline just to execute `*.test.ts` files. It also happens to be the natural pairing for `obsidian-test-mocks`, which ships a native Vitest setup file (`obsidian-test-mocks/vitest-setup`) with zero adapter work required.[^runner-alternatives]

### Build tool: Vite (library mode), replacing esbuild

Current Vite (8.x) dropped esbuild and Rollup as hard dependencies in favor of Rolldown and Oxc — esbuild is now optional-only in Vite's own tree — so putting Vite under both the build and the test runner is a genuine one-for-one swap, not a second bundler stacked on the one already there.

- Vite library mode (`build.lib`, `formats: ['cjs']`) replaces `esbuild.config.js` for producing `main.js`. Externals (`obsidian`, `electron`, Node builtins) move to `build.rolldownOptions.external` — same list, different config key.
- `esbuild-sass-plugin` is dropped; Vite has Sass support built in (needs `sass`/`sass-embedded`, already a devDependency — a net dependency removal, not a swap).
- `esbuild-copy-static-files` is dropped in favor of a small hand-written postbuild script copying `manifest.json`/`styles.css` next to `main.js`.
- If the migration hits a wall during implementation, the accepted fallback is reverting the build to esbuild while keeping Vitest for tests regardless — the two are separable decisions being made together, not one that stands or falls as a unit.
- Because `build` already gates on a full-repo `tsc --noEmit` pass, a type-broken test file blocks `pnpm build` exactly like type-broken source does. This is intentional, not a side effect. Test files import `describe`/`it`/`expect` explicitly from `'vitest'` rather than relying on global-injection mode, so nothing needs to change in `tsconfig.json`'s `types` array to support it.

### Fake Obsidian layer: `obsidian-test-mocks`

The `obsidian` npm package is types-only — zero runtime implementation. Rather than hand-roll `App`/`Vault`/`TFile`/adapter fakes, Tab Candy uses [`obsidian-test-mocks`](https://github.com/mnaoumov/obsidian-test-mocks):

- Mocks the entire `obsidian.d.ts` surface, including the prototype extensions Obsidian bolts onto DOM/JS builtins (`Element.prototype.addClass`, `Array.prototype.remove`, etc.) — exactly what a hand-rolled fake would quietly miss.
- Ships a native Vitest setup file (`obsidian-test-mocks/vitest-setup`).
- `App.createConfigured__({ files: {...} })` builds a fully wired in-memory vault from a plain object, covering the fake-adapter work `backgrounds.ts`'s test cases need without building it from scratch.
- Its `obsidian-typings` bridge covers `WorkspaceLeaf`'s types, so no separate fake `WorkspaceLeaf` builder is needed for view-lifecycle tests.
- Author: Michael Naumov (`mnaoumov`), an officially credited contributor to Obsidian's community plugin-review tooling, and maintainer of `obsidian-typings`/`obsidian-dev-utils`. Not a core Obsidian app developer, but a highly credible source for this specific API surface.
- **Accepted risk**: a small project (single maintainer, modest adoption at time of writing). Revisit if it goes stale.
- `src/test/fakes.ts` narrows to just `buildSettings()` and the shared malformed-private-registry fixtures (below) — the things that are actually Tab Candy-specific and this library has no opinion on. Everything Obsidian-shaped comes from `obsidian-test-mocks` instead.

## Structure
---

### Test file placement: hybrid

- **Co-located** (`backgrounds.ts` + `backgrounds.test.ts`, same folder) is the default for the large majority of test files — pure functions, services tested against `obsidian-test-mocks` in isolation, hooks, component tests.
- **Centralized** in `src/test/integration/` for the small number of tests that genuinely exercise more than one collaborating piece and assert on the *combined* behavior — `TabCandyView` open/close/reopen across multiple leaves, a full settings-save-then-reload-then-render round trip.
- **The discriminator**: a test belongs in `src/test/integration/` if it wires together fakes for more than one service/hook *and* the assertion is about the emergent behavior of that combination, regardless of which single source file it's nominally "about." Everything else stays co-located, even for a file that happens to import several modules, if the fakes and the assertion stay scoped to that one file's own contract.
- `src/test/fakes.ts` is shared by both co-located tests and the integration folder.
- One Vitest config glob (`src/**/*.test.{ts,tsx}`) covers both locations at once — no special-casing needed.

### `commands.ts`/`bookmarks.ts` private-registry fixtures

Both files touch the same undocumented private surface (`commands.commands`, `plugins.plugins`, `internalPlugins.plugins`) and share the same "fails closed, not open" requirement from the load-bearing list. The malformed-shape cases — missing registry, a malformed entry, `executeCommandById` throwing — live as a small shared addition to `src/test/fakes.ts` rather than duplicated per test file.

This isn't a from-scratch mock: whatever base `App` `obsidian-test-mocks` provides is still the foundation. The malformed-shape fixtures are that base with specific private-registry properties deliberately stripped or corrupted — no general-purpose mock library ships "intentionally broken" as a feature, so this was never contingent on what the library covers.

## Coverage: the Ratchet
---

Percentage thresholds are the industry-standard shape of a "coverage gate" — every mainstream tool (Istanbul/c8, Vitest's `coverage.thresholds`, Codecov, Coveralls) works this way, and there's no widely-used tool that mechanically enforces "did you test these specific named behaviors." That's not generically automatable, which is why the load-bearing-behaviors list is a human/PR-review checklist (see "When to expand the suite" below), not something CI checks unattended.

An arbitrary fixed target — soft or hard — would smuggle "the percentage means quality" back into CI after this spec spent its opening section arguing against exactly that. Instead:

- **Coverage cannot drop below its existing baseline.** No invented target, just "don't silently backslide."
- **CI has two independent hard gates.** Test failures always fail CI, unconditionally — a red test is a red build regardless of coverage. The Ratchet fails CI if coverage drops below baseline, independent of whether tests passed — this catches things like a well-tested file being deleted, which wouldn't fail any test but would silently shrink the safety net. Both gates must be green.

## Methodology
---

### React component tests: one case per branch, not per prop combination

A state is "meaningful" if it corresponds to a distinct branch in the component's own logic — a conditional, a ternary, a class toggle, a different DOM shape. Data variation *within* a branch isn't a new state.

1. One case per logical branch, not per prop-value combination.
2. Boolean combinators (`&&`, `||`) need enough cases to prove *each* operand can independently gate the outcome — not the full truth table. `QuoteDisplay` renders on `quote && show`: both true (renders), quote null (suppressed), show false (suppressed) — three cases, not the four a full truth table would suggest, since "quote null AND show false" doesn't exercise anything the other two don't already cover independently.
3. Don't test prop combinations that can't occur from real call sites, even if the type system technically allows them. `BackgroundSurface`'s `transparent`/`transparentWithShadows` flags are only ever mutually exclusive in practice (`App.tsx` derives both from one enum comparison) — the combination that never happens doesn't get a test.

Worked examples from the real components:

- `SearchButton`'s `iconFirst` flag changes actual render order — a real branch, two cases. `label`/`className`/`textClassName` are interpolated strings with zero branching on them — one representative value each is enough.
- `RecentFiles`/`Bookmarks` map over an array with no branch on length — empty (renders the empty wrapper) and populated (items render, `onOpen` fires with the right file) are the two states. Array length past that doesn't matter.
- `Icon` has no JSX branching at all, but a real DOM side effect (clears children, appends via `getIcon()`, keyed on the `name` prop). Its meaningful states are: icon resolves to a real element; icon name doesn't resolve (no throw, no stale DOM left behind); the `name` prop changing swaps the icon rather than appending alongside the old one.
- `BackgroundSurface`: each theme flag's class toggle tested independently, background-present vs. background-absent for the inline style, and that `onKeyDown` fires through.

### Settings test-data builder

`TabCandySettings` is roughly two dozen fields and growing. `buildSettings(overrides: Partial<TabCandySettings> = {})` lives in `src/test/fakes.ts`, spread over `DEFAULT_SETTINGS`, so a new settings field requires updating one factory, not every test file that constructs settings.

### No snapshot testing

Banned outright. Explicit assertions only, even when it's more typing. A snapshot diff tells you *something* changed, not whether it's correct.

### Async / timers

Fake timers (`vi.useFakeTimers()`) everywhere a debounce or interval is under test — `debounce.ts`, `useClock`, the debounced folder re-sync in `backgrounds.ts`. No real `setTimeout` waits in the suite; a suite that takes 30 seconds because of real timers is a suite people start skipping.

### Naming / structure conventions

- `describe()` per exported function/hook/class; `it()` written as a sentence describing behavior ("returns an empty array when the folder doesn't exist"), not a fragment.
- Arrange/act/assert layout inside every test body, with a blank line between each section.
- No `any` in test files. If a fake needs a shape TypeScript can't infer cleanly, the fake needs a proper type — that's not a rule that relaxes the moment `describe(` shows up.

## What's Not Tested
---

### Deliberately not tested (permanent — trust-boundary exclusions)

- Obsidian's own internals — see Trust Boundaries above.
- CSS/visual output. No visual regression tooling in scope.
- Trivial wrappers — a function that's `return someOtherThing(arg)` with no branching, no state, no error handling isn't worth a dedicated test. Trust the thing it wraps.

### Known gaps (accepted — revisit if a bug actually surfaces here)

Distinct from the permanent exclusions above: things not tested *yet*, not things decided never to test. This table gets filled in as real gaps are identified, not invented speculatively.

| Gap | Reason |
|:----|:-------|
| _(none logged yet)_ | |


## When to Expand the Suite
---

- **Mandatory: a bug fix ships with a test that would have caught it.** No exceptions for "it was a one-liner" — one-liner bugs are the most embarrassing to repeat. Name the test after what it's catching (`normalizeSettings_drops_unknown_legacy_field`), not after an issue number.
- **Mandatory: a new setting, background theme, quote source, or bookmark source ships with a `normalizeSettings.ts` case** covering its malformed/missing/legacy-value handling, since that file is the one place on the load-bearing list that grows every time a feature does.
- **Mandatory: touching a shared service** (`backgrounds.ts`, `bookmarks.ts`, `commands.ts`, `SettingsStore.ts`) **means running its existing tests first.** If a change breaks them, decide whether the test encoded the old contract on purpose (fix the test) or caught a real regression (fix the code). Don't just make it pass.
- **Recommended: a test that pins the wrong behavior gets fixed, not worked around.** If a test enforces a misunderstanding of what the code should do, fix the test and the code together.
- **Not worth testing: trivial wrappers** (see above).

## Open Implementation Items
---

Not open design questions — these are settled in principle above and just need hands-on work to pin down:

- CI job structure (single sequential workflow vs. a matrix) and the mechanics of how the Ratchet's coverage baseline is stored and compared run-to-run.
- The concrete `vite.config.ts` library-mode shape, once built against this repo's real esbuild config.
- Whether `eslint-plugin-obsidianmd`'s rules false-positive against test files constructing fake `Setting`/`Modal` instances — verify at the first real test file, not on paper.
- Whether `obsidian-test-mocks` already populates the private `commands`/`plugins`/`internalPlugins` registries at runtime (its `obsidian-typings` bridge covers their *types*, confirmed; runtime population unconfirmed). Doesn't block the malformed-shape fixtures either way, but affects how much of the happy-path setup for `commands.ts`/`bookmarks.ts` tests comes for free.

---

[^runner-alternatives]: Jest was rejected — its ESM story is still friction, and this project is ESM end to end. Node's built-in `node:test` was rejected because its strip-only TypeScript mode hard-errors on `enum`, verified empirically, and `types.ts` is wall-to-wall enums. A bundled meta-toolchain product (Vite+) was also evaluated and rejected: pre-1.0, wants to own Node/package-manager choices already settled elsewhere in this project, and its bundled linter can't yet do the type-aware lint rules already depended on.