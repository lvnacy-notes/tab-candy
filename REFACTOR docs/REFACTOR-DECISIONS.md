# Decisions and Baseline — Resolution Log

This settles every item in [REFACTOR-IMPLEMENTATION-CHECKLIST.md](REFACTOR-IMPLEMENTATION-CHECKLIST.md)
§0, plus the decisions and notable findings from working through §1. Each
entry states the decision, the reasoning, and what (if anything) it locks
in for later sections. See [BASELINE.md](BASELINE.md) for the full
current-behavior capture referenced throughout.

---

## Plugin id policy — **decided (already applied)**

`tabcandy` is the id, `Tab Candy` is the display name, both already correct
in `manifest.json`, `manifest-beta.json`, and `package.json`. Since Obsidian
treats a plugin id as an installation identity, anyone on the old
`beautitab` id gets treated as a fresh install, not an upgrade. That's
accepted as a deliberate, one-time migration cost rather than something to
work around with compatibility shims. No further action here.

## Minimum supported Obsidian version — **superseded, see §5's revision below**

Walking the APIs the refactor actually commits to using:

- `ItemView`, `PluginSettingTab`, `Setting`, `Modal`/`FuzzySuggestModal` —
  present since the earliest plugin API, far below any version under
  consideration.
- `registerEvent`, `registerDomEvent`, `registerInterval`,
  `workspace.getLeavesOfType` — all long-standing, pre-1.0 APIs.
- `vault.getFiles`, `vault.getAbstractFileByPath`, `vault.adapter.list`,
  `vault.adapter.readBinary`, `vault.readBinary` — public vault/adapter
  surface, also pre-1.0.
- `requestUrl` — the newest API in the actual usage list at the time this
  was written, requiring API version **0.13.25**.

The binding constraint was taken to be `requestUrl` at 0.13.25, and the
manifest already declared `0.15.0`, which clears that with room to spare.
**This entry was wrong about `workspace.revealLeaf`** — it's listed above
as a "long-standing, pre-1.0 API," but it actually requires **1.7.2**.
`revealLeaf` wasn't in use anywhere in the codebase yet when this decision
was made, so the error had no effect until §5 introduced the first calls
to it; §5's entry below is the actual, corrected floor decision. Leaving
this entry in place rather than rewriting it, since it's a real mistake
worth being visible about, not a stylistic artifact to clean up.

If a later section pulls in something genuinely newer (e.g. a public
bookmarks API if Obsidian ships one), that's the trigger to revisit this
number again.

## Node range — **`>=24` for development and CI, confirmed**

This is a toolchain-only constraint; nothing about it touches the bundled
plugin's runtime target (that's `esbuild`'s `target`, handled in §1).
Node 24 is on Node's LTS track and is a reasonable, forward-looking floor
for a project doing a from-scratch dependency refresh anyway. Confirmed as
stated; `package.json#engines.node` and CI runner versions get set to match
in §1 — this entry just locks the number so §1 isn't re-litigating it.

## Bookmarks — **keep, behind a guarded adapter**

Kept as a feature. It's shipped, has a settings section and two source
modes (all / by group), and there's no supported public bookmarks API to
replace it with yet — removing it would be a real regression for existing
users, not a cleanup.

The trade-off is explicit and accepted: `internalPlugins.plugins.bookmarks`
is a private implementation detail that can change or vanish without
notice. Per REFACTOR.md's bookmarks section, this gets isolated behind one
adapter (`services/bookmarks.ts` in the proposed structure) that:

- returns an empty list when Bookmarks is disabled, missing, or
  malformed — never throws into the render path (today's `getBookmarks.ts`
  has no such guard);
- is the *only* place `internalPlugins` gets touched;
- gets swapped out wholesale, with no other code changes, if/when Obsidian
  ships a public bookmarks API.

This decision feeds §5 and §6 directly (adapter isolation) and §9 (the
disabled/missing-Bookmarks test cases already listed there).

## Folder scanning — **non-recursive, matching current behavior**

The existing OS-folder sync is non-recursive today, and the settings copy
already tells users that ("not including subfolders"). Vault-relative
scanning in §4 keeps that same contract: `app.vault.adapter.list()` against
the configured folder, one level deep, no subfolder walk.

Reasoning, beyond just "match what's there": recursive traversal has real
costs a toggle-free default shouldn't impose unasked — large vaults, deeply
nested asset folders, or accidental symlink cycles all turn a folder-list
call into something slower and harder to reason about. Non-recursive is
also just less to build and test right now. If recursive scanning becomes
a real ask, it's a well-scoped follow-up feature (a boolean setting plus a
depth-aware `list()` walk), not something to bolt on speculatively during
a mobile-portability refactor.

## Explicit activation vs. hijacking every empty leaf — **explicit command, default-on convenience toggle**

Today, `onLayoutChange()` force-replaces the most recently used leaf on
*every* `layout-change` event if its type is `"empty"` — no setting, no way
to opt out short of disabling the plugin.

Decision: add an explicit, narrowly-scoped activation path — a command
(e.g. "Open Tab Candy") plus a reusable `activateView()` helper that checks
`workspace.getLeavesOfType()` first, reuses an existing leaf if one exists,
otherwise creates one, then calls `workspace.revealLeaf()`. That becomes
the one and only supported way to *summon* Tab Candy on demand.

Separately, keep the "replace new empty tabs automatically" behavior as an
opt-in **setting**, defaulted **on** — replacing new empty tabs is the
plugin's whole point, so a fresh install should do that automatically
without requiring the user to find and flip a toggle first. The setting
drives the same narrow activation path rather than a blanket "grab
whatever the most-recent-leaf API hands back" check — the point isn't to
remove the convenience, it's to stop treating uncontrolled event-driven
leaf hijacking as the *only* entry point with no off switch and no
reuse-awareness.

This is the one §0 call that most directly shapes §5's lifecycle work, so
it's worth being blunt about the trade being made: a little more settings
surface, in exchange for an explicit, testable activation path that
doesn't depend on scraping `getMostRecentLeaf()` on every layout event.

## Disposable development vault — **documented, not yet created**

Decision: development must happen against a vault that lives outside this
repository and is never the user's primary/production vault — something
like `~/.obsidian-dev-vaults/tab-candy/` locally, or a path pointed to by an
environment variable once §1 removes the hard-coded
`E:/Documents/PersonalObsidianVault/...` output path currently baked into
`esbuild.config.mjs` (which, notably, still points at a *different*,
previous plugin's folder — `obsidian-canvas-dailynote` — left over from
before this codebase became Beautitab/Tab Candy at all).

Being straight about scope: I can write the convention and wire the future
env var, but actually creating a vault means opening the Obsidian app on a
real machine — that's outside what this sandbox can do. This entry records
the decision and the naming convention so §1's env-var work has a concrete
target; the one-time local setup step still belongs to whoever's running
the dev loop.

## Baseline capture — **done**

See [BASELINE.md](BASELINE.md): settings and defaults, all three background
sources (themed, custom URL, local — folder-synced/manually-added-desktop/
manually-added-vault), both search buttons and provider resolution,
bookmarks (both modes), quotes (all three sources), recent files, view
opening/hijacking, and reload/startup behavior (including the sticky
version-check `Notice` and the dev-only mobile emulation block). Every
behavior change from here forward should be checked against that document;
anything not called out there as an intentional §0-approved delta is a
regression.

## Working tree / `updates.ts` — **verified clean**

`git log` on `chore/refactor` shows exactly one commit (the rebrand +
planning commit) on top of imported history — no stray or unrelated
uncommitted changes. `updates.ts` doesn't exist on this branch yet, so
there's currently nothing under that name to mistakenly pull into the
refactor as a source file; the exclusion rule stands for whenever it
lands.

---

# §1 Decisions — Toolchain And Build

Recorded the same way as §0 above: full detail and file-by-file findings
live in the checklist itself under §1; this is the durable record of the
calls made, for anyone who lands on this doc without reading the checklist
line by line.

## TypeScript version — **hold at 5.9.3, run TS7 as a non-gating second track**

TypeScript 7 (the native/Go port) is GA and is `latest` on npm, but
`typescript-eslint` — and by extension `eslint-plugin-obsidianmd`, which
depends on it — has a hard peer ceiling of `typescript <6.1.0`, and a
GitHub issue asking for TS7 support was closed "not planned" on GA day,
blocked on TS7 shipping a stable programmatic API (expected in 7.1,
described upstream as "several months out" from 7.0's GA).

Decision: `typescript@5.9.3` stays the checked-in source of truth driving
`npm run typecheck` and eventual type-aware lint rules. `@typescript/native-preview`
(the `tsgo` binary) is added as a second, explicitly non-gating
`npm run typecheck:fast` script — not wired into `build` or CI. This is a
real speed option for local dev today without breaking the lint story that
already depends on mainline TypeScript. Revisit once `typescript-eslint`
supports 7.1+; that's the trigger, not a calendar date.

Worth recording since it surprised both of us during implementation:
`tsc` and `tsgo`, run against the literal same `tsconfig.json`, disagreed
on two things — (1) `tsgo` doesn't auto-include ambient `@types/*` packages
the way `tsc` does, which was masking a real problem (`@types/node`'s own
`.d.ts` hardcodes a `lib="es2020"` reference that was silently overriding
this project's deliberately-narrower declared `lib`); and (2) `tsgo`
defaults `strictPropertyInitialization`/`strictFunctionTypes` to on even
when neither `strict` nor those flags are set, while `tsc` correctly
leaves them off absent explicit configuration. Confirmed the second one
by toggling those two flags on in `tsc` directly and getting a
byte-identical error list to `tsgo`'s — not a `tsgo` bug in the "broken"
sense, just an undocumented default divergence between the two.

## Strictness — **`strictPropertyInitialization` and `strictFunctionTypes` turned on, permanently**

Both flags were off (implicitly, since `strict` was never set). Turning
them on surfaced 10 real errors, not noise: two plugin fields and two modal
fields set outside the constructor with no compiler acknowledgment; a
real, already-anticipated bug (§5's enum-narrowed `Setting` callbacks,
confirmed to actually exist rather than being theoretical); a fifth,
differently-shaped mistyped callback in the same file; and a genuine
latent runtime bug in the bookmarks render path (a `TFile`-only callback
signature accepting what's actually `TAbstractFile[]`, meaning a bookmarked
*folder* would render `file.basename` as `undefined` today with zero
compiler warning). All 10 fixed in the same pass rather than deferred —
full detail and the fix for each is in the checklist's §1 findings note.

Decision, stated plainly: this codebase is going to break in places while
being refactored regardless, so finding real bugs via a stricter compiler
and then *not* fixing them immediately would just mean carrying a
documented-but-broken state further into the refactor for no reason. Turn
strict flags on as they're identified as valuable, fix what they find,
keep moving.

## `electron` dependency — **removed now, as an explicit stopgap, not deferred to §4**

Originally scoped (per REFACTOR.md and the §0 bookmarks-adjacent reasoning)
to be removed only after §4 replaces the OS-folder/native-dialog workflow
with the vault-relative equivalent. Pulled forward instead, because
`npm audit` flagged 2 high-severity CVEs against the pinned
`electron@25.8.1`, and there was no good argument for shipping known CVEs
in the dev toolchain for a feature that's getting fully rebuilt soon
anyway.

This was a **removal, not a migration**: `fs`, `path`, and `electron`
imports are gone from `main.ts` and `src/Settings/Settings.ts`, and the
three UI affordances they backed (OS-folder sync, "Browse", "Add local
image") were disabled at the time this decision was made, not replaced.
**Update:** the real vault-adapter replacement for the folder-sync feature
specifically was built shortly after, in the entry below — this section is
kept as-written for the historical record of the decision at the time it
was made.

`npm audit` reported 0 vulnerabilities at the time; still true.

## `eslint --fix` scope — **learned the hard way, documented so it isn't relearned**

Ran unscoped `eslint . --fix` expecting it to touch only the two stylistic
rules under discussion (`@stylistic/quotes`, `@stylistic/indent`). It also
applied "suggestion"-level autofixes for every other enabled rule, which
is default ESLint behavior, not a bug — and two of those were real,
breaking changes: 9 instances of `@typescript-eslint/no-explicit-any`
silently rewriting `any` → `unknown` (strictly stricter, broke `tsc`
immediately), and one instance of `@typescript-eslint/no-unnecessary-type-assertion`
stripping a load-bearing `as any` cast entirely. Both caught only because
the full pipeline (`typecheck`, `typecheck:fast`, `build`) was re-run after
the `--fix`, rather than trusting its exit code; both reverted by hand,
confirmed clean against a full pipeline re-run afterward.

Decision, for this project going forward: stylistic-only cleanup passes
should scope `--fix` explicitly — `eslint . --fix --fix-type layout` (or
`layout,problem`, excluding `suggestion`) — rather than running it bare.
This will come up again in later sections that touch lint; no need to
relearn it each time.

## Package manager — **pnpm, adopted for real**

Previously flagged, not resolved: §2 had already marked `package-lock.json`
as intentionally untracked because "pnpm will be the new package manager,"
but nothing in the toolchain actually used pnpm. Now it does.

`package-lock.json` deleted. `pnpm@11.24.0` pinned via `packageManager` in
`package.json` (so `corepack enable` gets contributors the exact same
version with no separate install step). `.gitignore` updated to exclude
`package-lock.json`/`yarn.lock` outright, so a stray `npm install` from
someone on the wrong tool can't silently reintroduce the file this section
just removed.

One piece of real, project-specific handling was needed, not zero: pnpm
blocks lifecycle/build scripts from dependencies by default, and two of
this project's dependencies genuinely need theirs — `esbuild` (resolves
its platform-specific binary) and `@parcel/watcher` (a transitive
dependency of `sass-embedded`, compiles a small native addon). Verified
both actually matter (rather than approving blindly) by checking that
`esbuild`'s binary was present and runnable before explicitly allowing it.

Also worth recording since it cost real time to track down: **pnpm 11
removed the `pnpm` field from `package.json` entirely** — all non-auth
config (including build-script approval, renamed `onlyBuiltDependencies` →
`allowBuilds`) now lives in a separate `pnpm-workspace.yaml` file. This is
a recent, breaking change (pnpm 11 shipped after most existing
`package.json#pnpm` examples floating around were written) and pnpm gives
no warning when it silently ignores the old location — it just doesn't
apply the setting. `pnpm-workspace.yaml` is the canonical place for this
project's pnpm config going forward, not `package.json`.

Also fixed while adopting pnpm for real: the `build` script's internal
`npm run typecheck` was hardcoded to `npm` specifically, which only ever
worked because `npm` happened to also be present alongside whatever ran
it. Changed to `pnpm run typecheck` so `pnpm run build` doesn't depend on
a second package manager being installed for no reason.

## Browser/runtime target — **settled at ES2020, applied consistently**

Three numbers previously disagreed with each other and with reality:
`tsconfig.json` declared `target: "ES6"` and `lib: ["ES5","ES6","ES7"]`;
`esbuild.config.mjs` emitted for `target: "es2018"`; and the *actual*
checked lib was silently ES2020 the whole time regardless of what
`tsconfig.json` said, because `@types/node` hardcodes a
`/// <reference lib="es2020" />` (see §1's earlier finding). None of these
were a deliberate choice — they were just whatever each file happened to
have from whenever it was last touched.

Researched Obsidian's actual runtime rather than guessing: desktop
currently ships Electron 43.x, which is modern by any measure, but
Obsidian's Electron/"installer" version is a *separate* number from the
app version and isn't touched by the app's own auto-updater — a desktop
install can be running a current Obsidian app version on a stale Electron
runtime if it hasn't been manually reinstalled in a while, so "whatever
Electron ships today" isn't a safe floor to target. Mobile isn't Electron
at all — it's a WKWebView (iOS) or the system WebView (Android) via
Capacitor — and Obsidian's own plugin docs acknowledge real fragmentation
here directly (regex lookbehind, for one concrete example, needs iOS
16.4+).

Decision: **ES2020**, applied identically to `tsconfig.json`'s
`target`/`lib` and `esbuild.config.js`'s `target` (see the rename below).
Reasoning for landing there rather than higher or lower:

- It's broadly supported across any realistic Electron build and mobile
  WebView from the last several years — a genuinely safe floor, not an
  aggressive one.
- It's honest about what the codebase already assumes: optional chaining
  and nullish coalescing are already used pervasively throughout
  `App.tsx`, `main.ts`, and elsewhere, and both are ES2020.
- `tsconfig.json`'s `lib` was already silently ES2020 in practice (the
  `@types/node` leak); declaring it for real just makes the number honest
  instead of removing the one thing keeping it accurate by accident.
- esbuild's `target` only downlevels *syntax*, never polyfills missing
  runtime APIs — so the tsconfig and esbuild numbers actually need to
  agree for "confirmed compatible" to mean anything real. They didn't
  before; they do now.

The overlapping `lib: ["ES5","ES6","ES7"]` stack collapsed to a single
`["DOM", "ES2020"]`, matching REFACTOR.md's own guidance not to list
redundant overlapping ES versions.

## `esbuild.config.mjs`/`version-bump.mjs` → `.js`, and the dev output path collapsed entirely

Two changes landed together since they touched the same file.

**The `.mjs` extension was pure legacy weight.** It exists specifically to
force Node to parse a file as ESM when the nearest `package.json` doesn't
declare `"type": "module"`. This project's `package.json` has declared
exactly that since the pnpm section above — every plain `.js` file has
been ESM project-wide since then, which means `.mjs` stopped doing
anything functionally different from `.js` from that point on. Both files
renamed (`esbuild.config.mjs` → `esbuild.config.js`,
`version-bump.mjs` → `version-bump.js`), all references updated
(`package.json` scripts, `eslint.config.js`'s ignore list).

**The dev/prod `outdir` ternary is gone, not parameterized.** The original
checklist item asked for the hard-coded Windows path to become an
environment variable. Went further instead: `outdir` is now unconditionally
`"./dist/"` for both dev and prod. The standard Obsidian plugin dev pattern
doesn't need the build tool to know about a vault path at all — a
developer symlinks `<vault>/.obsidian/plugins/tabcandy` to the repo's
`dist/` once, locally, which is exactly the kind of one-time, per-developer,
out-of-sandbox step already established for the disposable dev vault
itself (`~/.obsidian-dev-vaults/tab-candy/`, documented in §0 above). Net
effect: no env var, no ternary, no path baked into version control at all
— and the previously-broken path (which pointed at a different plugin's
folder entirely, `obsidian-canvas-dailynote`) doesn't exist to be wrong
anymore.

## Two §1 line items relocated to §8, not completed there

`Choose one import strategy` and `Evaluate noUnusedLocals and
noUnusedParameters` were both still open in §1 at review time. Neither is
really toolchain-version work — the import-strategy question only matters
once files are actually moving (§8), and the unused-locals/params flags
were only ever scoped to §1 by proximity to the other tsconfig edits, not
because turning them on has anything to do with Node/TypeScript/esbuild
versions. Both moved to §8's checklist entries verbatim, not duplicated.

---

# §4 Decisions — Vault-Based Backgrounds And Mobile Support (partial, pulled forward)

Out of dependency order, on request: after §1 removed `syncLocalBackgroundsFromDirectory()`
outright as part of the `electron` stopgap above, the actual vault-relative
replacement for that one feature (folder-based background sync) was built
before §2/§3 were started, rather than left as a gap until §4's normal
turn. This section covers only that slice — the rest of §4 (the manual
"Add vault image" flow's base64 storage, a real folder-suggest chooser UI,
vault-event cache invalidation, actual desktop/mobile verification) is
still open and tracked in the checklist under §4 as usual.

## `getResourcePath()` instead of `readBinary()` + object URL lifecycle

REFACTOR.md's original sketch for loading a synced background was:
`adapter.readBinary(filePath)` → convert the `ArrayBuffer` to an object
URL → revoke it on background change or view close. Built it differently:
`app.vault.adapter.getResourcePath(path)`, which Obsidian provides
specifically to turn a vault-relative path into a URL already usable in an
`<img src>` or CSS `background-image`.

Decision, stated plainly: every goal those `readBinary`/object-URL line
items exist to serve — no image bytes in settings, mobile-safe, no memory
or lifecycle leak — is fully met by `getResourcePath()`, with less code
and zero cleanup surface to get wrong (there's no object URL, so there's
nothing to forget to revoke). The checklist marks the literal
`readBinary`/object-URL line items as superseded rather than done, since
that's not the API actually used, but the outcome is the same. Full
implementation lives in the new `src/services/backgrounds.ts`.

## Scope held at "fix the sync mechanism," not "rebuild the whole feature"

Explicitly did not touch the pre-existing manual "Add vault image" flow,
which still converts a chosen file to a base64 `data:` URI and stores it
directly in `settings.localBackgrounds` — the exact "image bytes in
settings" problem the refactor exists to fix, just not fixed here. Two
things now genuinely coexist for background images: `backgroundFiles`
(new, paths only, resolved at render time) and `localBackgrounds` (old,
bytes, unchanged). `React/Components/App/App.tsx` merges both into one
list before rendering so the feature works correctly either way, but the
underlying inconsistency is real and still open — it's the actual fork
"Decide how legacy `localBackgroundsDirectory` and base64 `localBackgrounds`
values are handled" (§3) is asking about, now sharpened by a concrete
question: should "Add vault image" be changed to also store just a path,
for consistency and to fully close out "no image bytes in settings"? Not
decided yet.

Also explicitly not built: a real vault-folder suggest/chooser modal (the
new folder-path field is a plain text input — functional, silently syncs
zero files on a typo, not the fuzzy-suggest UI REFACTOR.md describes), and
any vault `create`/`modify`/`delete`/`rename` event listening for cache
invalidation (sync only runs on plugin load or an explicit "Sync now"
click). Both are named explicitly in the checklist rather than left to be
rediscovered as "missing" later.

Also fixed in the same pass, found by inspection rather than being the
point of the exercise: the manual vault-image picker
(`ChooseImageSuggestModal`) only allowed `jpg`/`png`, narrower than the
old OS-folder sync's `jpg`/`jpeg`/`png`/`webp`/`gif` — the two lists had
just drifted apart with no reason behind the difference. Both now share
one list (`src/Types/Images.ts`).

---



## Net effect on the checklist

Every unchecked box in §0 now has a recorded decision above. Concretely,
going into §1:

- Plugin id: `tabcandy` (already locked).
- `minAppVersion`: `0.15.0` (unchanged, revisit only if a later section
  demands something newer).
- Node: `>=24`, dev + CI.
- Bookmarks: kept, guarded adapter required in §5/§6.
- Folder scanning: non-recursive.
- Activation: explicit command + reusable helper is mandatory; blanket
  `layout-change` hijack becomes an opt-in, default-on setting layered on
  top of that same helper, not a separate code path.
- Dev vault: convention documented above; physical creation is a local,
  out-of-sandbox action item, tracked but not something this session can
  tick off as literally done.
- Baseline: captured in `BASELINE.md`.
- Working tree: clean; `updates.ts` exclusion rule remains in force.

Going into §2, with §1 fully resolved (every line item is done, moved to
the section it actually belongs in, or explicitly superseded — none left
ambiguously open):

- TypeScript: 5.9.3 authoritative, TS7/`tsgo` as a non-gating speed option.
- Strictness: `strictPropertyInitialization`/`strictFunctionTypes` on for
  good; the 10 errors they found are fixed, not suppressed.
- `electron`: fully removed; the folder-sync feature it broke has a real
  vault-relative replacement now (see the §4-pulled-forward entry above),
  built out of order rather than left broken until §4's normal turn. The
  rest of §4 — the manual-add flow's base64 storage, a real folder-chooser
  UI, vault-event cache invalidation, actual device testing — is still
  open.
- Lint: runs for the first time ever (`eslint` wasn't even installed
  before this pass); real findings remain, deliberately deferred to the
  sections that already own them (mostly §6/§8's private-API isolation
  work), tracked in the checklist rather than fixed here. The original
  342/53 count was itself undercounted (see the lint-bucketing correction
  above) — treat the checklist's running total, not this number, as
  current.
- Package manager: pnpm, adopted for real — see the §1 pnpm entry above.
- Browser/runtime target: ES2020, one number, agreed across `tsconfig.json`
  and `esbuild.config.js` — see the target-settlement entry above.
- Build tooling: `esbuild.config.mjs`/`version-bump.mjs` → `.js` (the
  extension did nothing once `package.json` declared `"type": "module"`);
  dev/prod `outdir` collapsed to always be `./dist/`, no vault path in
  version control at all.
- Two line items relocated to §8 rather than done in §1: the import-alias
  strategy and `noUnusedLocals`/`noUnusedParameters`. Neither was really
  toolchain-version work; both belong with §8's file moves and dead-code
  sweep.

---

# §2 Decisions — Branding And Metadata

## Naming convention — **applied, closing out §2's last open item**

The three names REFACTOR.md's "mixed naming" callout actually named were
resolved to match its own recommended policy: `TabCandyPluginSettings` →
`TabCandySettings` (interface), `ReactView` → `TabCandyView` (class) with
its exported constant `TAB_CANDY_REACT_VIEW` → `TAB_CANDY_VIEW_TYPE`, and
(applied afterward, on request) `TabCandyPluginSettingTab` →
`TabCandySettingTab` for the same redundant-"Plugin" reason as the
settings interface. Two inconsistent CSS class prefixes were fixed at the
same time: `tabcandysettings-*` (missing hyphen) → `tabcandy-settings-*`,
and the unprefixed `customQuotesTable` → `tabcandy-customquotes-table`.

One explicit non-change, stated plainly so it isn't "rediscovered" as a
gap later: the registered Obsidian view-type **string**
(`'tabcandy-react-view'`) was left untouched even though the class/constant
names around it changed. That string is the runtime identifier Obsidian
uses for already-open leaves; changing it would orphan any open Tab Candy
tab on upgrade for zero benefit, the same class of one-time-migration cost
already accepted deliberately for the plugin id in §0 — except here there
was no actual reason to pay it. `Views/ReactView.tsx`'s filename was also
left as-is; renaming files to match is §8's job, not a naming-convention
concern.

Verified via `pnpm typecheck`/`build`/`lint`; lint's problem count and
content were byte-identical before and after both rename passes.

---

# §3 Decisions — Settings Schema And Persistence

## Settings getter conflict — **kept as a plain field, synced via subscription**

The first attempt at a read-compatibility shim for the ~20 pre-existing
`this.plugin.settings.X` reads scattered through `Settings.ts` was a
`get settings()` accessor delegating to the new store. `tsc` rejected it
outright: Obsidian's own `Plugin` base class declares `settings?: unknown`
as a plain property, and TypeScript won't let a subclass override a plain
property with an accessor (`TS2611`) — the two are different *kinds* of
class member as far as the compiler is concerned, independent of type
compatibility.

Decision: `settings` stays a plain field, declared with the same
definite-assignment (`!`) pattern already used for `settingsStore`, and is
kept in sync by subscribing to the store once in `onload()`
(`this.settingsStore.subscribe((s) => { this.settings = s; })`). Every
existing read site was left untouched; only the ~17 write sites across
`Settings.ts` were rewritten to go through `settingsStore.update()`
instead. Genuinely just a compiler-shape workaround, not a design
preference — if Obsidian's `Plugin.settings` field is ever removed or
changed, this whole indirection can go with it in favor of a real getter.

## Unsubscribe bug — **confirmed real, not just theoretical**

REFACTOR.md flagged `Observable`'s "broken unsubscribe predicate" as a
known issue. Confirmed while porting `App.tsx` off it: the returned
unsubscribe function filtered subscribers with
`this.subscribers.filter((value) => value === callback)` — keeping only
the callback being "removed," the exact inverse of what an unsubscribe
should do. In practice this meant a component's cleanup effect calling
its own unsubscribe wouldn't actually stop it from receiving updates,
unless some *other* subscriber happened to also unsubscribe at some point
(coincidentally filtering the first one back out). `SettingsStore.subscribe()`
uses a `Set` and `.delete(subscriber)`, which has no equivalent failure
mode to get backwards.

## Repeated update blocks — **collapsed into one `updateSettings()` helper**

Every one of the ~17 settings-tab write sites previously repeated the same
three-to-four-line block: mutate `this.plugin.settings.X` directly, call
`this.plugin.settingsObservable.setValue(this.plugin.settings)`, call
`this.plugin.saveSettings()`, then (usually) call `this.display()`.
REFACTOR.md's own "Remove or trim" section names this pattern directly
("a typed update helper that updates the store and refreshes only when a
conditional setting section actually changes"). Replaced with a single
`private async updateSettings(patch, { redraw? })` method on
`TabCandySettingTab` that calls `settingsStore.update(patch)` and only
redraws when explicitly asked to — which turned out to be every case
*except* the three free-text fields below, since none of those ever
triggered a conditional UI section.

Array-valued settings (`localBackgrounds` add/remove) were switched from
in-place `push`/`splice` mutation to passing a whole new array in the
patch (`[...current, newItem]` / `current.filter(...)`), per REFACTOR.md's
"Clone or replace arrays during updates so React sees stable, intentional
state transitions" — mutating the array in place happened to still "work"
under the old Observable (same array reference, same object identity) but
defeats the point of a store subscribers can trust for reference-equality
checks.

## Text-setting debounce — **500ms, bound once outside `display()`**

The three free-text fields (`customBackground`, `greetingText`,
`backgroundsFolder`) previously called `saveSettings()` (a `data.json`
disk write) on every keystroke, with no debounce at all. None of them
called `this.display()` on keystroke already, so the "avoid rebuilding
the entire settings screen" half of this checklist item was already true
before this session — only the "batch or debounce...saves" half needed
work.

Implementation detail worth recording since it's an easy way to get this
subtly wrong: the debounced updater is created once in the
`TabCandySettingTab` constructor and stored as an instance field, not
created fresh inside `display()`. `display()` reruns (via
`containerEl.empty()` + full rebuild) on nearly every other setting
change; a debounced function created inside it would lose its pending
timer on every redraw, so a background dropdown change mid-keystroke in
the URL field would silently drop whatever was typed so far. Binding it
once in the constructor means the timer survives redraws untouched.

## Legacy folder notice — **real one-time marker, not a bigger migration system**

REFACTOR.md's Migration section asks for "a one-time migration marker so
the notice isn't repeated." Scope was held to exactly that: a new
`legacyBackgroundsNoticeDismissed: boolean` field and a "Got it" button on
the existing notice, nothing more. This does not touch or resolve the
still-open `localBackgrounds` base64-vs-path fork below — that's a
separate, bigger product decision this session did not make.

## `localBackgrounds` base64 storage — **decided: eliminate it, not migrate it** (superseded)

The entry immediately above logged this as "still open, deliberately not
decided here." It's since been settled directly, and separated from a
question it was getting conflated with:

- **There is no Beautitab-origin legacy data to handle, full stop.**
  `tabcandy` is a different plugin id than `beautitab` (§0), so upgrading
  is not a thing that happens automatically — anyone on the old id who
  doesn't switch just keeps using Beautitab, untouched. Tab Candy is a new
  plugin superseding it, not an in-place upgrade path for it. This was
  implicit in §0's plugin-id decision the whole time; it just hadn't been
  stated as the answer to "how is legacy data handled" until now.
- **`localBackgroundsDirectory`** (the pre-refactor *Tab Candy* OS-path
  field — a real same-id upgrade scenario, someone already on `tabcandy`
  before this refactor) was already fully closed out by this session's
  one-time dismissible notice. Nothing about the Beautitab point above
  changes that; it was never a Beautitab question to begin with.
- **`localBackgrounds`** (base64 images from "Add vault image"): decided
  to remove the write path outright. The manual image picker will be
  rebuilt to store a vault-relative path instead of reading the file and
  writing a base64 `data:` URI into settings — the same treatment the
  folder-sync feature already got via `getResourcePath()`, and for the
  same reason: `ChooseImageSuggestModal` already resolves a `TFile`
  sitting inside the vault, so there's no need to ever read its bytes at
  all, just remember where it is.

**No migration or cleanup of already-existing base64 entries is planned.**
The ask was "ensure no *new* legacy data sneaks through," not "clean up
old data" — those are different projects, and the second one is real scope
this session isn't taking on. Existing `localBackgrounds` entries keep
rendering exactly as they do today (via `App.tsx`'s existing merge of both
lists); the decision only closes the tap going forward.

**Implementation is deferred to §4**, not done as part of this decision.
§4 already owns the vault-relative background rebuild, the folder-sync
half of this exact problem already landed there, and several of its
checklist items were already describing this manual-add gap in detail
before this decision existed to point them at. The checklist's §4 items
covering `readBinary`, object-URL/data-URL conversion, and vault-relative
caching have been updated to reflect that the manual-add path's fate is
now settled, not an open question — without changing their checked state,
since the code itself hasn't moved yet.

## Net effect on the checklist

§2's naming-convention item and the README item's sibling
class/identifier item are both closed; only the README pass itself
remains, held for the end of the checklist as planned.

§3 is closed except one item blocked on §9 standing up a test runner —
`normalizeSettings()` was written as a pure function specifically so it's
a drop-in unit-test target once that exists. The `localBackgrounds`
base64 question that was previously the other open item is now decided
(see above); its implementation lives in §4, not §3.

# §5 Decisions — Public Obsidian API And Lifecycle

## `FileView` → `ItemView` — **done**

`Views/ReactView.tsx` no longer extends `FileView`. Tab Candy isn't
file-backed, so `allowNoFile = true` and an unused `file` field were
working around a base class that doesn't fit — `ItemView` doesn't carry
either concept. The constructor also no longer takes an explicit `app`
parameter: `View`'s own constructor populates `this.app` from the `leaf`
it's given, so threading the plugin's `this.app` through
`registerView()`'s factory and back into the view's constructor was
redundant. **Caveat, stated plainly:** this relies on standard,
widely-documented Obsidian plugin behavior that isn't spelled out in
`obsidian.d.ts`'s comments and hasn't been verified against a running
Obsidian instance in this sandbox — worth a real smoke test before
shipping, same as everything else in this section marked untestable here.

`contentEl.empty()` is now called at the top of `onOpen()` before
`createRoot()`, defensively, in case a future leaf-reuse path ever calls
`onOpen()` again without a matching `onClose()` first. `onClose()` now
also nulls out `this.root` after unmounting, so a stale reference can't
be read after teardown.

## Explicit activation vs. hijacking — **implemented per the §0 decision**

`src/services/newTabHijack.ts` now has three things instead of one:

- `setLeafToTabCandy(leaf)` — the one place that actually calls
  `leaf.setViewState()` to turn a leaf into the Tab Candy view.
- `activateView(app)` — the "Open new tab" command's implementation.
  Checks `workspace.getLeavesOfType()` first and reveals an existing Tab
  Candy leaf if one's already open; only creates a new leaf
  (`workspace.getLeaf(true)`) as a fallback.
- `registerNewTabHijack(app, settingsStore, registerEvent)` — the
  opt-in, default-on `replaceEmptyTabsWithTabCandy` setting's watcher.
  Registered the same way `registerBackgroundVaultWatchers()` is
  (`registerEvent` passed in, not called directly), for consistency.

**Deliberate scope call:** the hijack watcher does *not* route through
`activateView()`'s "reuse an existing leaf" check. It keeps today's exact
leaf-selection behavior (`getMostRecentLeaf()` + check for an `'empty'`
view type) and only reuses the low-level `setLeafToTabCandy()` helper.
Making it fully reuse-aware like `activateView()` would mean a newly
opened empty tab gets left empty (with a different, already-open Tab
Candy tab revealed instead) whenever one exists elsewhere — which
undermines the setting's actual job of filling every new empty tab.
Flagging this explicitly since the original §0 entry's "layered on the
same helper" phrasing could be read either way; this implementation reads
it as "shares the mechanism," not "shares the full reuse logic."

New setting: `replaceEmptyTabsWithTabCandy` (boolean, default `true`),
added to `TabCandySettings`/`DEFAULT_SETTINGS`, validated in
`normalizeSettings()`, and exposed as a toggle under a new "New tab
behavior" heading at the top of the settings tab (ahead of "Background
settings" — it's foundational plugin behavior, not a cosmetic option).

New command: `open-tab-candy` / "Open new tab", registered in
`onload()`, calling `activateView()`. Named to avoid repeating the plugin
name (Obsidian already prefixes commands with it in the UI) — the
Obsidian ESLint plugin catches this class of mistake directly
(`obsidianmd/commands/no-plugin-name-in-command-name`).

## `minAppVersion` bumped to 1.7.2 — **decided**

`activateView()`/`setLeafToTabCandy()` need `workspace.getLeaf()` (0.16.0)
and `workspace.revealLeaf()` (1.7.2); `getMostRecentLeaf()` (already used
in `App.tsx` and now also the hijack watcher) needs 0.15.4. No
version-safe, non-deprecated alternative exists for any of these — every
pre-0.15.4 option in this API family (`activeLeaf`, `setActiveLeaf`'s old
signature) is itself `@deprecated`. Rather than keep trading one lint
category for another, or shipping current-idiom code against a floor it
doesn't actually clear, **`minAppVersion` is bumped to `1.7.2`** — the
highest floor actually in use, no higher. Updated in `manifest.json` and
`manifest-beta.json`. All four `no-unsupported-api` findings from this
section (the three new ones plus the pre-existing `getMostRecentLeaf` one
in `App.tsx`) are resolved by this, not worked around.

This also caught and corrected an error in §0's original minAppVersion
analysis, which had incorrectly listed `revealLeaf` as a "long-standing,
pre-1.0 API" — see that entry, left in place with a correction note
rather than silently rewritten.

**Also found and fixed while touching version files:** `versions.json`
still contained Beautitab's entire release history (`1.0.0` through
`1.6.1`, all mapped to `0.15.0`) — Session Guideline #1 territory, a
new plugin id carrying forward a prior plugin's version-compat table.
Reset to a single entry, `{"2.0.0": "1.7.2"}`, matching the current
`manifest.json` version and the new floor.

## Long-lived DOM listeners / `registerDomEvent()` — **audited, no change needed in this section's files**

`main.ts`'s dev-only live-reload `EventSource` listener is the only
`addEventListener()` call in a plugin-lifecycle file (`main.ts`,
`Views/ReactView.tsx`) — everything else living in those two files is
either JSX (React owns its own event binding and cleanup) or was already
converted to `registerEvent()`. That `EventSource` listener runs at
module load, outside any `Plugin`/`Component` instance, and only exists
in dev builds (dead-code-eliminated from production via
`esbuild.config.js`'s `process.env.NODE_ENV` define + tree-shaking —
confirmed absent from `dist/main.js`). Restructuring it to go through
`registerDomEvent()` would mean moving it inside `onload()`, which is
more dev-tooling surgery than a lifecycle-correctness fix; left as-is.

The other `addEventListener()` calls in the codebase
(`src/modals/CustomQuotesModel.ts`, `src/Settings/Settings.ts`) sit
inside `Modal`/`PluginSettingTab` render functions that call
`contentEl.empty()` / `containerEl.empty()` on every redraw — the
listeners get torn down with the elements they're attached to, not
leaked. They're real `Component` subclasses and could still be moved to
`registerDomEvent()` as a matter of house style, but that's Modal/Settings
UI code, not the view-and-lifecycle scope this section covers. Not
touched here.

## Plugin-owned intervals / `registerInterval()` — **audited, deferred to §7**

The only `setInterval()` in the codebase is `React/Components/App/App.tsx`'s
clock tick, cleaned up correctly via a matching `clearInterval()` in its
`useEffect` cleanup function — not leaked, just not registered through
`Component.registerInterval()`. It can't be, without threading the
`TabCandyView` instance itself through `ObsidianContext` (currently only
`app` is provided) so a functional component could call
`this.registerInterval()` on it — that's `App.tsx` architecture, which is
§7's "move time ticking and formatting into a focused hook or pure
utility" item, not this section's. No plugin/component-level interval
exists outside React's own lifecycle, which is what this checklist item
is really guarding against.

## Global view-instance assumptions — **addressed via the activation rework above**

No literal singleton (a held reference to "the" view instance, a
module-level `let activeView`, etc.) existed anywhere in the codebase —
grepped for one and found none. The actual global-assumption problem was
architectural: `hijackEmptyLeafForNewTab()` treated
`workspace.getMostRecentLeaf()` as a stand-in for "the" new-tab slot,
unconditionally, on every `layout-change` event, with no setting, no
reuse-awareness, and no path that didn't go through blind event-driven
guessing. The activation rework above replaces that with an explicit,
narrowly-scoped `activateView()` for on-demand summoning and a
settings-gated watcher for the automatic case — see that entry for the
full reasoning.

## Private/internal API audit — **classification**

A full sweep (`eslint-plugin-obsidianmd`'s `no-unsupported-api` /
`no-deprecated` rules, plus a manual grep for `internalPlugins`,
`app.commands`, `app.plugins`, `emulateMobile`, `isMobile`) turned up:

- **Resolved in this section:** the dev-only `app.emulateMobile()` /
  `app.isMobile` block in `main.ts` and its four `@ts-ignore` comments —
  deleted outright per REFACTOR.md's explicit instruction to remove it
  from the shipped entry point.
- **New finding, open per the entry above:** `getLeaf()`/`revealLeaf()`
  vs. the 0.15.0 floor, introduced by this section's own activation work.
- **Pre-existing, out of this section's scope, belongs to §6:**
  `src/services/commands.ts` (`app.plugins`, `app.internalPlugins`,
  2 `@ts-ignore`), `src/modals/ChooseSearchProvider.ts`
  (`app.commands.commands` enumeration, 1 `@ts-ignore`),
  `React/Utils/getBookmarks.ts` (`app.internalPlugins.plugins.bookmarks`,
  2 `@ts-ignore`) — all three are exactly what §6's "Bookmarks" and
  "Commands" checklist items already describe isolating/guarding, not
  re-litigated here.
- **Resolved in this section (indirectly):** `App.tsx`'s two
  `getMostRecentLeaf()` calls (recent file / bookmark click-to-open) no
  longer violate the floor either, now that `minAppVersion` is 1.7.2 —
  not touched directly, just no longer a version-floor problem. Its one
  `@ts-ignore` (line 163, a JSX `style` typing issue) is unrelated to any
  Obsidian API and is left alone — React-restructure territory, §7.