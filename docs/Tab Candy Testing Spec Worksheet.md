# Testing Spec — Worksheet

Status: **draft, all core decisions locked.** Final spec filename and
location settled: **`Tab Candy Testing Specification.md`**, in `/docs/`.
What's left is enumerating the actual test cases per file and the CI
implementation details before this worksheet gets converted into that file
— see "Still Needs Discussion" below. Only put something under "Decided"
once it's actually been argued out and confirmed — not the moment I write
it down and nobody objects yet. This doc records decisions and the
reasoning behind them, not a transcript of the conversation.

Why this document exists at all, instead of just writing tests: Tab Candy is
going to keep growing after this refactor lands. Whoever adds the next
feature needs a spec that tells them where the test goes, what it mocks,
what "done" looks like, and what NOT to bother testing.

---

## Philosophy

**Minimal overhead. Maximum confidence where it actually matters.**

**Status: decided.**

Coverage numbers are vanity. A file can be at 100% and still let a real
regression through if the 100% is spread evenly across things nobody would
notice breaking. What matters is that a short list of genuinely load-bearing
behaviors — named below, not inferred from which folder a file lives in —
are tested hard enough that a regression cannot hide. Everything else is
supplementary. Useful, but not load-bearing, and doesn't need the same bar.

### Load-bearing behaviors (the actual list)

- **Settings survive malformed or legacy data without corrupting the user's
  config.** `normalizeSettings.ts` is the thing standing between a bad
  settings.json and a plugin that loads clean anyway. Every fallback path,
  every "field from an old version that no longer matches the type,"
  every missing field — this is the single highest-consequence file in the
  codebase, get it wrong once and it's not the plugin that looks broken,
  it's the user's data.
- **The settings store's subscribe/unsubscribe doesn't leak or double-fire.**
  Already flagged as a file with a real historical bug. Load-bearing by
  definition, not because "settings store" is a category that earns
  coverage.
- **Background resolution degrades gracefully on a vault someone actually
  has.** Missing folder, a file deleted mid-session, a malformed nested
  structure, an unsupported extension. Get this wrong and the plugin
  doesn't just show a broken image — the view can hang.
- **View lifecycle doesn't leak React roots on repeated open/close.**
  `TabCandyView`'s `onClose()` actually unmounting, across open → close →
  reopen and multiple leaves. The "don't silently destroy things" behavior.
- **Private-API access in `bookmarks.ts`/`commands.ts` fails closed, not
  open.** These touch undocumented Obsidian internals that can shift shape
  on any update with zero warning. A regression here isn't "a test failed
  in CI," it's "the plugin explodes on someone's Tuesday update." Deserves
  the same weight as anything else on this list, precisely because it's the
  surface most likely to break for reasons entirely outside this codebase's
  control.

Everything else — a quote fetching correctly, the clock format switching,
which exact CSS class a background theme applies — is real, worth testing,
but supplementary. It gets covered because it's cheap to cover once the
fakes exist, not because it earns its own coverage target.

### Trust boundaries — test our usage, not the dependency

- We test what our code does with Obsidian's API, never Obsidian's own
  behavior. `obsidian-test-mocks` is 100%-covered on its own; that's their
  problem to keep true, not ours to re-verify.
- We test what our code does with React, never React itself.
- We test our parsing/handling of a vault's file listing, never the
  underlying filesystem/adapter behavior a real Obsidian install provides.

This is the same principle Archivist's spec states as "we don't test git
internals, we test our parsing of what git gives back" — worth stating
explicitly here rather than leaving it implicit, since it's the thing that
keeps the fake-Obsidian-layer boundary honest as the plugin grows.

---

## Decided

### Test runner: Vitest

- Rejected: Jest (ESM friction is real), Node's built-in `node:test` (its
  strip-only TS mode hard-errors on `enum` — verified empirically — and
  `types.ts` is wall-to-wall enums).
- Vitest chosen as the plain package, not a bundled meta-toolchain product
  (a wrapper toolchain was evaluated and rejected — pre-1.0, wants to own
  Node/package-manager choices already locked elsewhere, and its bundled
  linter can't yet do the type-aware lint rules §9 already depends on).

### Build tool: migrating off esbuild to Vite (library mode)

- Reopens §1's original esbuild decision. Current Vite (8.x) dropped
  esbuild and Rollup as hard dependencies in favor of Rolldown + Oxc —
  esbuild is now optional-only in Vite's own tree — so putting Vite under
  both the build and the test runner is a genuine one-for-one swap, not
  stacking a second bundler on top of the one already there.
- Vite library mode (`build.lib`, `formats: ['cjs']`) replaces
  `esbuild.config.js` for producing `main.js`. Externals (`obsidian`,
  `electron`, Node builtins) carry over to `build.rolldownOptions.external`
  — same list, different config key.
- `esbuild-sass-plugin` gets dropped — Vite has Sass support built in
  (needs `sass`/`sass-embedded`, already a devDependency).
- `esbuild-copy-static-files` gets dropped in favor of a small hand-written
  postbuild script copying `manifest.json`/`styles.css` next to `main.js`.
- **Risk accepted going in**: if the migration hits a wall, revert the
  build to esbuild and keep Vitest for tests regardless — these are two
  separable decisions being made together, not one that stands or falls as
  a unit.
- **Status: decided to attempt.** First concrete step is standing up
  `vite.config.ts` in library mode and confirming a real, loadable `main.js`
  comes out the other end before anything else in this spec assumes it
  works.

### Fake Obsidian layer: `obsidian-test-mocks`, not a hand-rolled one

The `obsidian` npm package is types-only — zero runtime implementation.
Rather than hand-roll `fakeApp()`/`fakeVaultAdapter()`/`fakeTFile()`
ourselves, use [`obsidian-test-mocks`](https://github.com/mnaoumov/obsidian-test-mocks):

- Mocks the entire `obsidian.d.ts` surface, including the prototype
  extensions Obsidian bolts onto DOM/JS builtins (`Element.prototype.addClass`,
  `Array.prototype.remove`, etc.) — exactly the kind of thing a hand-rolled
  fake quietly misses.
- Ships a native Vitest setup file (`obsidian-test-mocks/vitest-setup`) —
  no friction against the already-decided runner.
- `App.createConfigured__({ files: {...} })` builds a fully wired in-memory
  vault from a plain object — covers the fake-adapter work `backgrounds.ts`'s
  test cases need (missing folder, deleted file, etc.) without us building
  it ourselves.
- Its `obsidian-typings` bridge layer covers `WorkspaceLeaf` too, which
  resolves the earlier open question about needing our own fake
  `WorkspaceLeaf` builder — we don't.
- Author is Michael Naumov (`mnaoumov`) — an officially credited contributor
  to Obsidian's community plugin-review tooling (credited "ESLint Legislator"
  on Obsidian's own credits page), not a core Obsidian app developer, but
  about as credible a source as exists outside the core team for this API
  surface. Also maintains `obsidian-typings`/`obsidian-dev-utils`.
- **Known risk**: small project (7 stars, 1 fork at time of writing),
  single maintainer. Bus-factor risk if he stops touching it — accepted for
  now given the coverage, activity, and documentation quality; revisit if
  the package goes stale.
- `src/test/fakes.ts` narrows to just `buildSettings()` — the one thing
  that's actually TabCandy-specific and this library has no opinion on.
  Everything Obsidian-shaped comes from `obsidian-test-mocks` instead.
- **Status: decided** — discussed and agreed.

### Test file placement: hybrid — co-located units, centralized integration

- **Co-located**: `*.test.ts`/`*.test.tsx` sits directly next to the file
  it tests (`backgrounds.ts` + `backgrounds.test.ts`, same folder). This is
  the default for the large majority of test files — pure functions,
  services tested against `obsidian-test-mocks` in isolation, hooks,
  component smoke tests.
- **Centralized**: `src/test/integration/` holds the small number of tests
  that genuinely exercise more than one collaborating piece and assert on
  the *combined* behavior, not one function's return value —
  `TabCandyView` open/close/reopen across multiple leaves, a full
  settings-save-then-reload-then-render round trip.
- **The discriminator, since "integration" is otherwise a vibe, not a
  rule**: a test belongs in `src/test/integration/` if it wires together
  fakes for more than one service/hook AND the assertion is about the
  emergent behavior of that combination (e.g., "the view doesn't leak a
  React root across three open/close cycles"), regardless of which single
  source file it's nominally "about." Everything else — even a test for a
  file that happens to import three other modules — stays co-located if
  the fakes and the assertion are scoped to that one file's own contract.
- `src/test/fakes.ts` continues to hold `buildSettings()` and any shared
  setup the integration folder needs; both the co-located tests and the
  integration folder pull from it.
- **Why not pure co-location**: Archivist's spec (a real working reference)
  keeps a centralized `tests/unit/` + `tests/integration/` split rather
  than co-locating at all. Some of that is Python/pytest convention that
  doesn't map cleanly onto this ecosystem — co-location is the more
  idiomatic default for Vitest/TS — but the *shape* of their split is worth
  keeping: fast isolated tests stay visibly separate from slower
  cross-cutting ones, rather than a lifecycle test hiding in the same place
  as a one-line pure-function test.
- **Build/config implications, confirmed against this repo's actual
  setup, not assumed**:
  - This repo currently has one `tsconfig.json` (`include: ["**/*.ts",
    "**/*.tsx"]`) and `build` already runs `typecheck` (`tsc --noEmit
    --skipLibCheck`) before bundling. Co-locating tests means that
    typecheck pass now also typechecks every test file on every `build` —
    **intentional, not a side effect**: a type-broken test blocks `pnpm
    build` exactly like type-broken source does, consistent with this
    project's existing strictness.
  - Test files should `import { describe, it, expect } from 'vitest'`
    explicitly rather than relying on Vitest's global-injection mode — this
    means zero changes needed to `tsconfig.json`'s `types` array, since
    nothing needs the ambient globals.
  - Vite's library-mode build follows the real import graph from
    `main.ts`; it doesn't glob `src/` and bundle whatever's sitting there.
    A co-located test file never ends up in `main.js` unless production
    code actually imports it, which it wouldn't. Not a co-location-specific
    risk — every import-graph-based bundler behaves this way.
  - One Vitest config glob (`src/**/*.test.{ts,tsx}`) covers both the
    co-located files and `src/test/integration/` at once — no special-case
    needed for the centralized folder.
  - **Genuinely unresolved, flagged honestly rather than assumed fine**:
    whether `eslint-plugin-obsidianmd`'s rules (sentence-case UI text,
    `Setting()` construction patterns) false-positive against test files
    that construct fake `Setting`/`Modal` instances for testing purposes.
    Verify this when the first real test file gets written, not on paper.
- **Status: decided** — discussed and agreed.

### Coverage enforcement in CI: the Ratchet

- Percentage thresholds (soft or hard) are the actual industry convention
  for "coverage gate" — every mainstream tool (Istanbul/c8, Vitest's
  `coverage.thresholds`, Codecov, Coveralls) works this way. There isn't a
  widely-used tool that mechanically enforces "did you test these specific
  named behaviors" — that's not generically automatable, which is why the
  load-bearing-behaviors list lives in "When to expand the suite" as a
  human/PR-review checklist, not something CI checks unattended.
- Given that, an arbitrary fixed target (soft or hard) would have
  contradicted the Philosophy section's whole point — it would've smuggled
  the "percentage means quality" assumption back in through the CI
  config after we spent a section arguing against it.
- **Decided: a coverage ratchet instead.** No fixed target. Coverage simply
  cannot drop below wherever it already sits. Not "hit some invented
  number," just "don't silently backslide." Uses the same tooling as a
  threshold gate, but doesn't pretend the number itself means quality —
  it's a tripwire for "someone added a chunk of untested code and nobody
  noticed," not a quality bar.
- **CI has two independent hard gates, not one:**
  - Test failures always fail CI. Unconditional — a red test is a red
    build, full stop, regardless of coverage.
  - The Ratchet fails CI if coverage drops below the existing baseline.
    Independent of whether tests passed — catches things like a
    well-tested file getting deleted, which wouldn't fail any test but
    would silently shrink the safety net.
  - Both must be green. Either failing fails the build.
- Implementation mechanics (how the baseline actually gets stored/compared
  in CI) not yet drafted — folds into the still-open "CI job structure"
  item below.
- **Status: decided** — discussed and agreed.

### React component test methodology: one case per branch, not per prop combination

A state is "meaningful" if it corresponds to a distinct branch in the
component's own logic — a conditional, a ternary, a class toggle, a
different DOM shape. Data variation *within* a branch isn't a new state.
Three parts to the actual rule:

1. One case per logical branch, not per prop-value combination.
2. Boolean combinators (`&&`, `||`) need enough cases to prove *each*
   operand can independently gate the outcome — not the full truth table.
   `QuoteDisplay` renders on `quote && show`: both true (renders), quote
   null (suppressed), show false (suppressed) — three cases, not the four
   a full truth table would suggest, since "quote null AND show false"
   doesn't exercise anything the other two don't already cover
   independently.
3. Don't test prop combinations that can't occur from real call sites,
   even if the type system technically allows them. `BackgroundSurface`'s
   `transparent`/`transparentWithShadows` flags are only ever mutually
   exclusive in practice (`App.tsx` derives both from one enum comparison)
   — don't bother with the combination that never actually happens.

Worked against the real components, so this isn't abstract:

- `SearchButton`'s `iconFirst` flag changes actual render order — a real
  branch, two cases. `label`/`className`/`textClassName` are interpolated
  strings with zero branching on them — one representative value each is
  enough; five different label strings is one state tested five redundant
  times, not five states.
- `RecentFiles`/`Bookmarks` map over an array with no branch on length —
  empty (renders the empty wrapper) and populated (items render, `onOpen`
  fires with the right file) are the two states. Array length doesn't
  matter past that.
- `Icon` has no JSX branching at all, but a real DOM side effect (clears
  children, appends via `getIcon()`, keyed on the `name` prop). Its
  meaningful states aren't prop combinations, they're: icon resolves to a
  real element; icon name doesn't resolve (confirm no throw, no stale DOM
  left behind); the `name` prop changing actually swaps the icon rather
  than appending alongside the old one.
- `BackgroundSurface`: each theme flag's class toggle tested independently,
  background-present vs. background-absent for the inline style, and that
  `onKeyDown` fires through — not the full cross-product of all of the
  above.
- **Status: decided** — discussed and agreed.

### `commands.ts`/`bookmarks.ts` private-registry fixtures: shared, not from scratch

This follows directly from the load-bearing behaviors list above (private-API
access "fails closed, not open") rather than being a separate new decision.

- Both files touch the same undocumented private surface
  (`commands.commands`, `plugins.plugins`, `internalPlugins.plugins`) and
  share the identical "fails closed" requirement — the malformed-shape
  cases (missing registry, malformed entry, `executeCommandById` throwing)
  belong as a small shared addition to `src/test/fakes.ts`, not duplicated
  per test file.
- Not "built from scratch": whatever base `App` `obsidian-test-mocks`
  provides is still the foundation. The malformed-shape fixtures are that
  base with specific private-registry properties deliberately stripped or
  corrupted — no general-purpose mock library ships "intentionally broken"
  as a feature, so authoring these ourselves was never contingent on what
  the library covers.
- **Status: decided** — discussed and agreed. Whether `obsidian-test-mocks`
  additionally populates these registries at runtime by default remains
  genuinely unconfirmed (see Still Needs Discussion) — doesn't change the
  above either way.

---

## Proposed (mine — not yet discussed or agreed)

Everything in this section is a starting point I put forward, not something
we've actually talked through. Flag anything you want to argue about.

### Settings test-data builder

- Proposal: `buildSettings(overrides: Partial<TabCandySettings> = {})` in
  `src/test/fakes.ts`, spread over `DEFAULT_SETTINGS`, so a new settings
  field only needs one factory updated, not N test files.

### No snapshot testing

- Proposal: banned outright. Explicit assertions only. A snapshot diff
  tells you something changed, not whether it's correct.

### Async / timers

- Proposal: fake timers (`vi.useFakeTimers()`) everywhere a debounce or
  interval is under test. No real `setTimeout` waits in the suite.

### Naming / structure conventions

- Proposal: `describe()` per exported function/hook/class, `it()` written
  as a sentence describing behavior. Arrange/act/assert layout. No `any` in
  test files.

### Deliberately not tested (permanent — trust-boundary exclusions)

- Obsidian's own internals — see Trust Boundaries above.
- CSS/visual output. No visual regression tooling in scope.
- The native desktop folder/file pickers — removed in §1, nothing to test.
- `updates.ts` — excluded from everything, same as every other section of
  this refactor.
- Trivial wrappers — a function that's `return someOtherThing(arg)` with no
  branching, no state, no error handling isn't worth a dedicated test.
  Trust the thing it wraps. (Borrowed directly from Archivist's spec —
  same reasoning applies here.)

### Known gaps (accepted — revisit if a bug actually surfaces here)

Distinct from the permanent exclusions above: these are things we're not
testing *yet*, not things we've decided never to test. Table gets filled in
as real gaps get identified rather than invented speculatively.

| Gap | Reason |
|:----|:-------|
| _(none logged yet)_ | |

### When to expand the suite

Adapted from Archivist's spec, which states this better than a category
table ever could:

- **Mandatory: a bug fix ships with a test that would have caught it.** No
  exceptions for "it was a one-liner" — one-liner bugs are the most
  embarrassing to repeat. Name the test after what it's catching
  (`normalizeSettings_drops_unknown_legacy_field`), not after an issue
  number.
- **Mandatory: a new setting, background theme, quote source, or bookmark
  source ships with a `normalizeSettings.ts` case covering its
  malformed/missing/legacy-value handling**, since that file is the one
  place on the load-bearing list that grows every time a feature does.
- **Mandatory: touching a shared service (`backgrounds.ts`, `bookmarks.ts`,
  `commands.ts`, `SettingsStore.ts`) means running its existing tests
  first.** If your change breaks them, decide whether the test encoded the
  old contract on purpose (fix the test) or whether it just caught a
  regression (fix the code). Don't just make it pass.
- **Recommended: a test that pins the wrong behavior gets fixed, not
  worked around.** If a test enforces a misunderstanding of what the code
  should do, fix the test and the code together.
- **Not worth testing: trivial wrappers** (see above).

---

## Still Needs Discussion / Not Yet Drafted

- [ ] CI job structure: single sequential workflow vs. a matrix, and how
      the Ratchet's coverage baseline actually gets stored and compared
      run-to-run.
- [ ] Concrete `vite.config.ts` library-mode shape once someone actually
      builds it against this repo's real esbuild config.
- [ ] Whether `eslint-plugin-obsidianmd` rules false-positive on test files
      constructing fake `Setting`/`Modal` instances — verify at first
      real test file, not on paper.
- [ ] Whether `obsidian-test-mocks` already populates the private
      `commands`/`plugins`/`internalPlugins` registries at runtime (its
      `obsidian-typings` bridge covers their *types*, confirmed — runtime
      population unconfirmed). Doesn't block the malformed-shape fixtures
      below either way, but affects how much of the happy-path setup for
      `commands.ts`/`bookmarks.ts` tests comes for free versus needs
      building on top of the base mock.

---

## Decision Log

- **Test runner: Vitest.** Locked — discussed and agreed.
- **Build tool: migrating off esbuild to Vite library mode.** Locked —
  discussed and agreed. Reopens §1. Revert-to-esbuild is the accepted
  fallback if implementation hits a wall.
- **Fake Obsidian layer: `obsidian-test-mocks` (third-party), not
  hand-rolled.** Locked — discussed and agreed. `src/test/fakes.ts` narrows
  to just `buildSettings()`.
- **Test file placement: hybrid — co-located units, `src/test/integration/`
  for cross-cutting behavior.** Locked — discussed and agreed.
- **Testing philosophy: behavior/risk-driven, not code-layer-driven.**
  Locked — discussed and agreed. See Philosophy section.
- **Coverage enforcement: the Ratchet, not a fixed threshold.** Locked —
  discussed and agreed. Coverage cannot regress below its existing
  baseline; test failures and Ratchet failures are independent hard gates,
  both required to be green.
- **React component test methodology: one case per branch, not per prop
  combination.** Locked — discussed and agreed. Boolean combinators need
  enough cases to prove each operand independently gates the outcome, not
  a full truth table; prop combinations impossible from real call sites
  don't get tested just because the type system allows them.
- **`commands.ts`/`bookmarks.ts` private-registry fixtures: shared,
  purpose-built malformed-shape cases layered on `obsidian-test-mocks`'
  base `App`, not built from scratch.** Locked — discussed and agreed.
  Follows directly from the load-bearing "fails closed" requirement rather
  than being a new judgment call.
- **Final spec filename and location: `Tab Candy Testing Specification.md`,
  in `/docs/`.** Locked — stated directly, not argued out, but settled.