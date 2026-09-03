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
---

## §6 — Commands, Bookmarks, and Network Integrations

This settles the items in §6 of
[REFACTOR-IMPLEMENTATION-CHECKLIST.md](REFACTOR-IMPLEMENTATION-CHECKLIST.md),
the three files flagged above as pending §6 work
(`src/services/commands.ts`, `src/modals/ChooseSearchProvider.ts`,
`React/Utils/getBookmarks.ts`), and the network-request items. Entered
with the build already broken: removing this project's remaining
`@ts-ignore` directives ahead of this section (per the Session
Guidelines) surfaced that `app.commands`, `app.plugins`, and
`app.internalPlugins` aren't part of the pinned `obsidian@1.13.1`
typings at all, so every one of those three files failed `tsc` before
any §6-specific work began.

### Private-registry isolation — one adapter per registry family

Rather than casting `App` to a private shape at each of the three
call sites, every read of `app.commands`, `app.plugins`, or
`app.internalPlugins` anywhere in the codebase now goes through exactly
one of two files:

- `src/services/commands.ts` — `app.commands` and `app.plugins`
  (command execution/enumeration, plugin-enablement checks).
- `src/services/bookmarks.ts` — `app.internalPlugins` (Bookmarks core
  plugin only).

Both define a narrow local interface (e.g. `AppWithPrivateRegistries`,
`AppWithInternalPlugins`) documented as private/unpublished, cast once,
and every function built on top returns an empty/`null`/`false` result
rather than throwing if the registry is missing or doesn't match the
expected shape at runtime. No other file in the codebase touches these
three properties — confirmed by grep after the fact, not just by intent.

### Bookmarks adapter — relocated to `src/services/bookmarks.ts`, old file deleted

Flagged before implementing, since it's a file deletion/rename and the
Session Guidelines otherwise reserve those for §8: `React/Utils/getBookmarks.ts`
is gone. Its logic was rebuilt in a new `src/services/bookmarks.ts`,
matching REFACTOR.md's target file tree (which already names
`services/bookmarks.ts` as this adapter's home) and the precedent set in
§4, where `backgrounds.ts`, `commands.ts`, and `versionCheck.ts` were
already pulled out of `main.ts`/inline code into `src/services/`.
Explicit instruction: build the new file and delete the old one in the
same pass, no re-exporting shim left behind, no tech debt carried
forward for a later session to clean up. The two consumers
(`src/Settings/Settings.ts`'s `getBookmarkGroups` import,
`React/Components/App/App.tsx`'s `getBookmarks` import) were updated to
point at the new location in the same commit.

`getQuote.ts` was deliberately **not** given the same treatment, even
though REFACTOR.md's target tree also names a `services/quotes.ts`. §7's
own checklist already lists "move quote loading, error, and loading
state into a quote service or hook" as that section's job — moving the
file now would just be doing §7's relocation under §6's name. `getQuote.ts`
was fixed in place at `React/Utils/getQuote.ts`.

### Bookmark/command typing — closed in full, not staged

`getBookmarks.ts`'s known-but-deferred typing gap (flagged in §1/§5:
`any[]` throughout `flattenBookmarks`, `getBookmarksByGroupName`,
`flattenBookmarkGroups`, plus a return type of `TAbstractFile[]` that a
render site in `App.tsx` was trusting as `TFile[]` without narrowing) is
now fully resolved rather than left as the `instanceof TFile` stopgap
from §1. `BookmarkItem`/`BookmarkFileItem`/`BookmarkGroupItem` are a
proper discriminated union with type guards; `flattenBookmarks` only
ever collects `'file'`-typed entries, so `getBookmarks()` now legitimately
returns `TFile[]`, not the wider `TAbstractFile[]` it used to claim. The
§1 render-side guard in `App.tsx` is now redundant-but-harmless rather
than load-bearing — not removed, since touching `App.tsx`'s render logic
is §7 territory, but the type system rules out the original bug on its
own now regardless of whether that guard is still there.

### Network request hardening — manual timeout, since the API has none

`requestUrl()`'s typings (`RequestUrlParam`) expose no `AbortSignal` and
no timeout option — there is nothing "supported by the current API" to
call directly for cancellation. Added `src/Utils/withTimeout.ts`, a
generic `Promise.race`-based wrapper (8s), shared by `versionCheck.ts`
and `getQuote.ts`. Both call sites also pass `throw: false` and check
`status` manually rather than relying on `requestUrl`'s default
throw-on-4xx/5xx behavior, and wrap the whole call in `try`/`catch` for
outright network failures. This is a deliberate choice of "best available
mechanism" over "the API's own facility," recorded here because it's not
obvious from the diff alone that no better option existed to skip.

Fixed as part of the same work: version-check's own comparison had a
latent false-positive where a failed fetch (network error, rate limit)
left a version variable `undefined`, and `localVersion !== undefined`
would then read as "an update is available" - the exact opposite of the
"predictable fallback" behavior this section's quote-failure item names.
Both network calls now only report/act on an actual, successfully
fetched value.

### switcher:open default — not verified, left unchecked

The checklist asks this be kept as the default "only after verifying it
through the current API/runtime behavior." There's no real Obsidian
runtime available in this sandbox to confirm the core Quick Switcher
still registers under the `switcher` internal-plugin id and `switcher:open`
command id - same limitation as §4's device-specific test items. Nothing
in this session touched `DEFAULT_SEARCH_PROVIDER`; the id is long-stable
and widely depended on across the community-plugin ecosystem, but that's
not the same as verifying it this session, so the checklist item is left
unchecked rather than assumed done.

### Bookmark integration tests — not runnable, left unchecked

Same limitation: exercising the Bookmarks core plugin in each of
all-bookmarks/group-bookmarks/nested-groups/empty-group/missing-plugin
states requires a real Obsidian runtime this sandbox doesn't have.
`typecheck`/`build`/`lint` all pass against the new adapter, and each
guard branch was traced by hand for the corresponding case, but that
falls short of actually running it. Left unchecked rather than assumed.

## §7 — React Restructure

### `ObsidianAppContext.ts` deletion, flagged and confirmed before implementing

Once data-fetching moves into hooks that take `app: App` as a parameter,
and presentational components (`SearchButton`, `RecentFiles`, `Bookmarks`,
`QuoteDisplay`, `BackgroundSurface`) take only typed props/callbacks, the
composition root (`App.tsx`) becomes the only component that still needs
the raw Obsidian `App` - so `ObsidianAppContext.ts` (`ObsidianContext`,
`useObsidian`) stops having a real consumer. The checklist names removing
it as in-scope for this section ("Remove the context if the view can pass
a small typed model and callbacks directly"), but file deletion is
otherwise reserved for §8. Same situation as §6's `getBookmarks.ts` -
flagged explicitly before implementing, confirmed, deleted outright rather
than left as a dead, unreferenced file. `Views/ReactView.tsx` now passes
`this.app` into `<App />` as a plain prop instead of via context provider.

### Hook and small-component file locations

REFACTOR.md's target structure names `app/hooks.ts` and
`app/components.tsx` under a `src/app/` directory that doesn't exist yet -
creating it now would be doing §8's "move maintained source under a
coherent `src/` structure" under this section's name. Landed on
`React/Hooks/hooks.ts` and `React/Components/App/components.tsx` instead:
same file names REFACTOR.md specifies, kept inside the existing `React/`
tree so §8's later move is a directory relocation only, not a rename too.
Icon serialization (`Icon`), `SearchButton`, `RecentFiles`, `Bookmarks`,
`QuoteDisplay`, and `BackgroundSurface` all live in the one
`components.tsx`, matching "small presentational pieces, if needed" rather
than one directory per component - REFACTOR.md's own critique of the
current layout is that one-file directories add navigation cost without
useful boundaries.

### Icon: `dangerouslySetInnerHTML` removed, not just isolated

The checklist item is "replace ... where practical; otherwise isolate and
constrain it." `getIcon()` returns a real `SVGElement`, so the previous
`XMLSerializer` round-trip (element → string → `dangerouslySetInnerHTML`)
was unnecessary rather than load-bearing: `Icon` now holds a ref and
appends/clears the actual DOM node directly. No HTML string, and no
`dangerouslySetInnerHTML`, anywhere in the codebase after this section.

### Two narrower hook dependency arrays than the original effects had

- **Clock**: the original timer effect's dependency array was
  `[setTime, settings]` - the whole settings object, so *any* settings
  change tore down and rebuilt the interval, not just a `timeFormat`
  change. `useClock` now depends on `timeFormat` alone. Displayed output
  is identical either way; only the internal teardown/rebuild frequency
  changes.
- **Quote**: `useQuote` adds a `cancelled` guard around the async
  `getQuote()` call so a slower, stale fetch can't overwrite a newer one
  if `quoteSource`/`customQuotes` change again before the first request
  resolves. The original had no such guard.

Both are incidental hardening surfaced by relocating the logic, not
requested separately - noted here rather than silently folded in.

### `useRecentFiles` and `useBookmarks`: matching, not improving, existing memoization

`useRecentFiles` recomputes on every `App` render, same as the original -
its `useMemo` was keyed on `allVaultFiles`, a fresh array literal on every
call, so the memo never actually prevented a recompute. Rather than "fix"
that into real memoization (a behavior change: recent files would stop
picking up newly modified files without an explicit vault-event trigger,
which is out of this section's scope), the hook just recomputes plainly
each render, same effective behavior, without a fake memo pretending
otherwise. `useBookmarks`, by contrast, had a *working* `useMemo` in the
original (keyed on `[obsidian, settings]`, both stable references between
actual settings updates) - preserved as a real `useMemo` for the same
reason: it already only recomputed on genuine settings changes, not on
every render.

### `BackgroundSurface`: no `background-image` style when there's no background

The original always set `style={{ backgroundImage: `url('${background}')` }}`,
even for `BackgroundTheme.TRANSPARENT`, where `getBackground()` returns
`null` - producing a literal `url('null')` in the DOM. `BackgroundSurface`
now omits the `style` attribute entirely when `background` is falsy.
Transparent themes already hide any background via the
`tabcandy-root--transparent`/`--transparentWithShadows` classes, so this
has no visible effect; it just stops writing an invalid CSS value.

## §8 — Consolidate The File Structure

### `types.ts`: went beyond `Enums.ts` + `Interfaces.ts`, per explicit direction

The checklist item only named combining `Enums.ts` and `Interfaces.ts`.
Lvnatic asked for more: every type in the codebase — including
`TabCandySettings` (previously declared inline in `Settings.ts`, mixed
with that file's class and default-value exports) and `Quote` (previously
declared inline in `getQuote.ts`) — now lives in one `src/types.ts`, on
the stated principle that types should have "a single point of origin"
even when a type is conceptually tied to one module. Kept as a flat file
rather than a `types/` directory with a barrel export: the combined
surface lands around 100 lines, well short of what would justify the
extra indirection, and Lvnatic's phrasing ("if necessary, create a
`types/` directory") left that call open. Flagged explicitly rather than
picking silently.

One dead type surfaced during the consolidation and was cut rather than
carried forward: `Image` in the old `ChooseImageSuggestModal.ts` had zero
consumers anywhere in the codebase (confirmed via repo-wide grep before
deleting). `BACKGROUND_IMAGE_EXTENSIONS` did **not** move into
`types.ts` despite living in the old `Types/Images.ts` — it's a runtime
constant, not a type, so grouping it with actual types would've been
following the old folder's name instead of what the rule is actually for.
It now lives at `src/utils/imageExtensions.ts`.

### Naming: PascalCase for components after all, camelCase elsewhere

The originally stated rule ("camelCase unless it exports a class") was
applied literally in an initial pass, which would have meant `App.tsx` →
`app.tsx` despite `App` being a function component, not a class. Lvnatic
corrected this once the tension was flagged: components get PascalCase
filenames matching normal React convention (`App.tsx` stayed `App.tsx`),
classes get PascalCase regardless of whether they're a component
(`Views/ReactView.tsx`, which exports the `TabCandyView` class, became
`src/TabCandyView.tsx`), and everything else — hooks, services, utility
functions, non-class settings modules — stays camelCase. `main.ts` is a
deliberate exception to all of this: it exports the `TabCandyPlugin`
class but keeps its lowercase name and repo-root location, since that's
an Obsidian/esbuild entry-point convention, not a normal "class file."

### `Settings.ts` split: a class file can't also hold non-class exports

The old `Settings.ts` mixed `TabCandySettingTab` (a class) with
`TabCandySettings` (an interface, now in `types.ts`), `DEFAULT_SETTINGS`,
`DEFAULT_SEARCH_PROVIDER`, and `SEARCH_PROVIDER` (all plain values) in one
file — a direct conflict with the one-class-per-file rule once file
identity was actually being enforced rather than inherited from history.
Split into `src/settings/SettingsTab.ts` (the class, PascalCase) and
`src/settings/defaultSettings.ts` (the values, camelCase). No behavior
change; this is a pure code-motion split.

### Import strategy: relative imports everywhere, no alias

Real fork surfaced while auditing the codebase for this section: it
wasn't just `"main"` vs `"./main"` as the checklist's original note
implied, but a genuine split between files using bare specifiers (e.g.
`'src/Types/Enums'`) that only resolved via `tsconfig.json`'s blunt
`paths: { "*": ["./*"] }` wildcard (itself a forced side effect of `tsgo`
rejecting `baseUrl` in §1, not a chosen alias strategy), and files using
real relative imports, some quite deep (`'../../../src/Settings/
SettingsStore'`). Flagged before any files moved, since moving first would
have meant re-deriving both styles' new paths instead of picking one.
Lvnatic chose relative imports everywhere, no alias. Every import in the
codebase now follows that rule; the wildcard `paths` entry serves no
remaining purpose but wasn't removed from `tsconfig.json` as part of this
section — that's `tsconfig.json` surface area outside this section's
"file structure" scope, worth a look in §9's type-system pass instead.

### `manifest-beta.json` deleted — BRAT no longer needs it

Investigated before wiring anything, since Lvnatic's original ask
("wire it up for real BRAT beta releases") assumed the file still does
something for modern BRAT installs. It doesn't: since BRAT v1.1.0, BRAT
uses GitHub releases as the source of truth for plugin installations,
fetching `manifest.json` directly from release assets rather than reading
a root-level `manifest-beta.json`. That file is documented as retained
"for backwards compatibility" only. Flagged this before implementing
anything, since the technical reality contradicted the premise of the
option chosen. Lvnatic's call: delete `manifest-beta.json` outright rather
than keep it as an inert duplicate, and track the real modern-BRAT
mechanism (a GitHub Actions release workflow publishing tagged pre-
releases with `main.js`/`manifest.json`/`styles.css` as release assets) as
new CI scope rather than bolting it onto this section. That work is now
`§10`'s BRAT workflow items, added when the implementation checklist was
renumbered to make room for the new `§9` (see below).

### Checklist renumbered: new §9 inserted for type-system hardening

Old `§9` (Tests And CI) → `§10`, old `§10` (Release And Documentation) →
`§11`, old `§11` (Final Audit And Sign-Off) → `§12`. New `§9` (Type System
Hardening And Full Cleanup) inserted at Lvnatic's explicit request: a
dedicated pass to eliminate every remaining `any`/`unknown`, review every
`as` assertion, and clear every remaining lint/typecheck finding —
including the `no-floating-promises`/`no-deprecated`/
`no-duplicate-enum-values`/`no-unsafe-enum-comparison` findings originally
left for triage-only under old `§9` — before testing and CI infrastructure
work begins, so that section only has to troubleshoot the test suite and
workflows themselves. All cross-references to the renumbered sections
throughout the checklist (in §1, §3, §7, and the Suggested Milestones)
were updated to match.

### `Function`-typed callbacks and their neighboring `any`s, fully closed out

`ConfirmModal.ts`'s `_onConfirm: Function` and `CustomQuotesModel.ts`'s
`_onSave: Function` — both named explicitly in this section's checklist
item and left open since §1 — are now `() => void` and
`(customQuotes: CustomQuote[]) => void` respectively. While in
`CustomQuotesModel.ts` for that fix, found and fixed two more `any`-typed
DOM change-event handlers and one implicit-`any` `JSON.parse()` deep-clone
result in the same file — same class of issue, surfaced by the same lint
rule family, not separately tracked anywhere in the checklist. Fixed
alongside rather than deferred to §9, since leaving known-bad typing in a
file already open for a directly related fix would have been pointless
busywork for a future session.

## §10 — Tests And CI

### Test runner and mocking library: Vitest + `obsidian-test-mocks`, confirmed working end to end

`vitest`/`jsdom`/`@testing-library/react`/`@vitest/ui` were already present in
`package.json` before this session (see the stray-dependency entry below for
why that's not as reassuring as it sounds), matching the Testing
Specification's own runner choice and rationale (Jest's ESM friction; Node's
`node:test` strip-only mode hard-errors on `enum`, and `types.ts` is
wall-to-wall enums). `obsidian-test-mocks` was missing entirely and is now
added (`^4.2.1`), along with its `obsidian-typings` peer (`^6.36.0`, needed
only for the `obsidian-typings/vitest-setup` runtime prototype bridge — it
does **not** fix TypeScript type-checking, see below).

`vitest.config.ts` is new. One non-obvious fix was required to get it
running at all: the real `obsidian` npm package is a types-only shim
(`"main": ""`), and Vite's resolver fails outright trying to resolve that
empty entry before `obsidian-test-mocks`' own `vi.mock('obsidian', ...)`
setup ever gets a chance to intercept the import. Fixed with an explicit
`resolve.alias: { obsidian: 'obsidian-test-mocks/obsidian' }` in
`vitest.config.ts` — this is a Vite-resolution-level fix, unrelated to and
solved before the separate `tsc` type-mismatch problem below.

### Type bridge: mock `App` isn't structurally assignable to the real `App` — `asOriginalType__()` is the sanctioned fix

`obsidian-test-mocks`' own `App` class doesn't structurally match the real
`obsidian` package's published `App` type (concretely: the mock's
`WorkspaceLeaf.view` is typed `View | null`; the real package types it
non-null `View`). Passing a mock-built `App` into any production function
typed against the real `App` — which is everything in `backgrounds.ts`,
`bookmarks.ts`, and `commands.ts` — fails `tsc` even though it's the same
object at runtime, because `vitest.config.ts`'s alias is a bundler-level
substitution that has no effect on how `tsc` resolves `import { App } from
'obsidian'` in source files.

`obsidian-test-mocks` ships its own answer to exactly this: every mock class
has an `asOriginalType__()` method that casts to the real published type.
`src/test/fakes.ts` wraps this in one `createConfiguredApp()` helper (builds
via `App.createConfigured__()`, converts via `.asOriginalType__()`) so every
test file gets a correctly-typed `App` without reaching for the mock/real
type distinction itself. `pnpm run typecheck` is clean with this in place —
confirmed, not assumed; this was caught by a real `tsc` failure across five
test files before the fix, not found by inspection.

### `list()` mocking gap: the in-memory adapter never throws for a missing/malformed path

`obsidian-test-mocks`' in-memory `DataAdapter.list()` filters by path-prefix
match and returns `{ files: [], folders: [] }` for any path with no
matches — it never throws, unlike real Obsidian's `FileSystemAdapter`, which
throws (ENOENT/ENOTDIR) for a missing or malformed directory path. This
matters because `backgrounds.ts`'s `listBackgroundFilesInFolder()` has a
`try`/`catch` specifically defending against that real-Obsidian throw
behavior — a mock-vault folder that simply doesn't exist can't exercise that
`catch` branch at all; it always takes the "empty folder" happy path
instead. Worked around, not routed around: `backgrounds.test.ts`'s
malformed-path test uses `vi.spyOn(app.vault.adapter, 'list').mockRejectedValue(...)`
to force the real failure mode directly, while every other `list()` test
(missing folder, non-recursive, case-insensitive extensions) uses the real
in-memory vault unmodified. Anyone touching `backgrounds.ts`'s adapter error
handling later should know this gap exists in the mock, not assume the
existing tests would catch a regression there without the explicit spy.

### Vault mock auto-triggers real events — watcher tests drive real vault operations, not manual `trigger()` calls

`obsidian-test-mocks`' `Vault` extends `Events` and auto-fires
`create`/`modify`/`delete`/`rename` on its own `create()`/`delete()`/
`rename()` methods (confirmed by reading `Vault.mjs` directly, not assumed
from the type signatures). `backgrounds.test.ts`'s
`registerBackgroundVaultWatchers()` tests therefore call the real
`app.vault.create(...)`/`.delete(...)`/`.rename(...)` methods and let the
mock fire the corresponding event naturally, rather than hand-calling
`app.vault.trigger('create', fakeFile)` with a hand-built fake `TFile`. This
is a stronger test (it exercises the mock's own file-tree bookkeeping too,
e.g. `TFile.parent` only gets set correctly if the parent folder already
existed when the file was created — this tripped one intermediate draft of
the watcher tests and is why every watcher `setUp()` seeds the `Backgrounds`
folder via the initial `files:` map rather than creating it mid-test).

`vi.useFakeTimers()` is mandatory for these tests — `registerBackgroundVaultWatchers()`
debounces its resync by 500ms, and `vi.advanceTimersByTimeAsync(500)` is
used throughout rather than `vi.advanceTimersByTime()`, since the debounced
callback itself does async vault work that needs to actually resolve before
assertions run.

### Shared private-registry fixtures for `commands.ts`/`bookmarks.ts`

Both files touch the same undocumented private `App` surface
(`commands.commands`, `plugins.plugins`, `internalPlugins.plugins`), and the
Testing Specification calls this out as one shared fixture set rather than
duplicated per-file mocking. `src/test/fakes.ts` adds
`setCommandsRegistry()`/`setPluginsRegistry()`/`setInternalPluginsRegistry()`
plus one composite `withEmptyPrivateRegistries()`.

One real gotcha drove the shape of these: `obsidian-test-mocks` wraps `App`
in a **strict proxy** — reading any property that was never explicitly
assigned throws a descriptive error rather than returning `undefined` (this
is the library's own "Strict Mocks" design, confirmed by reading
`strict-proxy.mjs` directly). Real Obsidian's `App` always has `commands`/
`plugins`/`internalPlugins` present, even when empty, so every setter here
assigns *something* — explicit `undefined` included — and no test ever
leaves a registry genuinely untouched. `commands.ts`'s `isPluginEnabled()`
destructures `plugins`/`internalPlugins` off `app` in one statement, so
leaving either truly unassigned throws before that function's own optional
chaining ever runs — a proxy artifact, not a real "fails closed" test, which
is why `withEmptyPrivateRegistries()` exists as the mandatory starting point
for every `commands.ts` test rather than something ad hoc.

### Vite production build migration — attempted, hit two confirmed walls, reverted to esbuild per the spec's own accepted fallback

The Testing Specification's toolchain section calls for replacing
`esbuild.config.js` with Vite library mode for the actual `main.js`
production build (not just the test runner) — "if the migration hits a wall
during implementation, the accepted fallback is reverting the build to
esbuild while keeping Vitest for tests regardless." Attempted this in full,
against this repo's real two-entry-point build (`main.ts` → `main.js`,
`styles.scss` → `styles.css`, independently — nothing imports the scss from
JS, matching Obsidian's own plugin-loading convention of two separate
top-level files). Installed `vite@8.2.2` as a devDependency alongside
Vitest's own internal `vite@5.4.21` dependency to test this — confirmed
these coexist cleanly under pnpm's isolated `node_modules` layout with no
conflict, in case a future attempt wants to retry this without re-verifying
that part.

Two separate, empirically-confirmed walls, not assumptions:

1. **`build.lib` + a second CSS-only entry crashes outright.** Vite's
   `build.lib` convenience API (needed for `formats: ['cjs']`/correct
   externals handling) only supports JS-producing entries. Adding
   `styles.scss` as a second entry alongside `main.ts` under `build.lib.entry`
   crashes Vite 8.2.2's internal `vite:css-post` plugin during the build
   itself — reproduced directly against this repo's real entry files.
2. **Bypassing `build.lib` silently tree-shakes the entire plugin class
   away.** Driving `rollupOptions.input`/`output` directly (to work around
   wall 1) produces a build that completes with no errors and looks
   plausible (correct file sizes, correct `dist/styles.css`) but **contains
   none of `main.ts`'s own code** — `TabCandyPlugin`, `onload`, `registerView`,
   all absent from the output, confirmed by grep on the actual built
   `dist/main.js`, not inferred. Isolated further: this happens even with
   `main.ts` as the *sole* entry, no `styles.scss` involved at all — `build.lib`
   is what tells Rollup/Rolldown to treat an entry's exports as a public API
   surface that must survive tree-shaking; without it, a plugin's
   `export default class extends Plugin {}` with no external consumer of that
   export gets eliminated as dead code, since nothing in a JS-only build
   graph ever "uses" it. This is a structural incompatibility between
   Obsidian's plugin-entry convention and Vite's non-lib multi-entry output,
   not a config mistake — confirmed with a minimal single-entry, no-CSS
   isolation test.

**Decision: esbuild stays.** `vite.config.ts` was deleted; `vite@8.2.2` was
downgraded back to the pre-existing `^5.3.0` range (the version Vitest
itself already needs — no reason to carry an unused Vite 8 devDependency
around). `esbuild.config.js` is untouched and confirmed working (see the
stray-dependency entry immediately below for why it wasn't working when this
session started, unrelated to anything above). If someone revisits this
migration later: the two walls above are the actual blocker to solve, not a
config-tuning problem — likely needs either Vite's `build.lib.entry` +
separately invoking `vite build` a second time purely for the CSS (two
build passes, two configs), or waiting for `build.lib` to support mixed
entry types upstream, whichever lands first.

### Stray dependency/build breakage traced to an abandoned local session — found and fixed, not left for the next session to trip over

While investigating a stale `jsdom: ^24.0.0` pin (should have been on 30;
caught in review, not by this session's own work), `git log -S'"jsdom"' --
package.json` traced it to commit `614b959` ("chore: refactor, part 10,
testing specification created") — the **same commit** that added
`docs/SECTION-10-TEST-IMPLEMENTATION-SUMMARY.md`, a doc describing a local
test-suite attempt that turned into "a giant fiasco" and was explicitly
disregarded and scrubbed from context partway through this session, per
direct instruction. Worth being explicit about for whoever reads this next:
that abandoned attempt's leftovers weren't fully cleaned up before this
session started, and weren't isolated to the one doc file everyone already
knew to distrust.

The same commit's `package.json` diff also **removed `esbuild-sass-plugin`
and `esbuild-copy-static-files`** from `dependencies` — both still directly
imported by `esbuild.config.js`, which was never actually replaced. This
meant `pnpm run build`, `pnpm run dev`, and `pnpm run dev:mobile` had been
silently broken (`ERR_MODULE_NOT_FOUND`) on this branch since that commit,
independent of and predating anything done in this session or the Vite
migration attempt above — confirmed by literally running `node
esbuild.config.js production` and getting the resolution error before
either package was reinstalled. Both packages are now reinstalled
(`esbuild-sass-plugin@3.7.0`, `esbuild-copy-static-files@0.1.0` — matching
the versions §1 already settled on, not new picks), and a real production
build was run end to end to confirm: `dist/main.js`, `dist/manifest.json`,
`dist/styles.css` all produced correctly, exit code 0.

**Lesson for future sessions, stated directly rather than left implicit:**
when a commit is known to be tainted (a doc from it was already flagged as
fictional/discard), audit the *entire diff* of that commit before trusting
anything else it touched, not just the one file that triggered suspicion.
`jsdom` was caught by chance during an unrelated conversation, not by a
systematic check — the dependency removal that actually broke the build
tool was sitting in the same diff the whole time and would not have
surfaced without going back and reading it in full after the fact.

### What's left in §10 for the next session

Completed this session, for reference: `normalizeSettings()` (82 tests,
every field's fallback path), `SettingsStore` (14 tests, focused on the
subscribe/unsubscribe regression specifically called out as load-bearing),
`backgrounds.ts` (30 tests: `list()`/`readBinary()`-shaped resource
resolution, `filterExistingFiles`, `syncBackgroundsFolder`,
`pruneMissingManualBackgroundFiles`, and the debounced vault watchers),
`bookmarks.ts` (14 tests), `commands.ts` (14 tests, not originally an
explicit checklist line item but added since it shares the exact
"fails closed" private-registry requirement the checklist calls out for
bookmarks). 154 tests total, `pnpm run test`/`typecheck`/`lint` all clean.

Explicitly **not** started, and not partially done either — genuinely
untouched:

- **`TabCandyView` lifecycle** (open/close/recreate/multiple leaves). This
  was next on the plan when the session's scope shifted to the build-tool
  investigation above; zero tests exist for this file.
- **React component tests** (`components.tsx`/`App.tsx`) for major display
  states and user actions.
- **`getQuote.ts`** fallback and network-failure behavior — untested.
- Supplementary small-utility tests: `isEnumValue`, `debounce`, `time.ts`,
  `getEasterDate`/`getBackground`/`isWithinXDays`, `versionCheck`. None
  started. `imageExtensions.ts`'s extension list is exercised *indirectly*
  through `backgrounds.test.ts` (including case-insensitivity), but has no
  standalone test file of its own.
- **Two checklist line items are stale, not incomplete** — worth flagging
  so no one spends time on them by mistake: "object URL creation and
  revocation" and the "MIME mapping" half of "image-extension and MIME
  mapping." Neither `createObjectURL`/`revokeObjectURL` nor any MIME-type
  map exists anywhere in the current codebase (confirmed by repo-wide grep)
  — the vault-image approach that shipped uses `adapter.getResourcePath()`
  exclusively, which needs neither. These two items describe an
  implementation approach earlier sections moved away from; they should be
  struck or reworded rather than pursued as written.
- CI (workflow jobs, the manual desktop/mobile matrix, the release
  workflow) — explicitly out of scope for this session by direct
  instruction, not attempted.

### Time utilities: partial consolidation, not total

"Combine tiny time utilities if doing so improves discoverability" named
no specific files. `getTime.ts` and `getTimeOfDayGreeting.ts` merged into
one `time.ts` — both trivially small, both serve the clock/greeting
display, both consumed together. `getEasterDate.ts` and `isWithinXDays.ts`
stayed separate despite being similarly small: they serve the seasonal-
background date-arithmetic feature, an unrelated concern. Merging all four
into one file just because they're all small would have traded one
navigation-cost problem for a mixed-concerns problem — the opposite of
what this checklist item is for.

## `minAppVersion` bumped to 1.13.0 — **decided**

§9's lint pass flagged `PluginSettingTab.display()` as deprecated in favor
of the declarative `getSettingDefinitions()`/`getControlValue()`/
`setControlValue()` API (`@since 1.13.0`). `display()` still exists
purely as a pre-1.13.0 fallback — Obsidian only calls it when
`getSettingDefinitions()` returns an empty array - so a full migration to
the declarative API would otherwise mean either maintaining two parallel
settings-tab implementations forever, or leaving old-version users with
a settings tab that renders nothing.

`minAppVersion` was already `1.7.2` (see the entry above), so this isn't
a large gap, and the plugin has no shipped users on any version -
nothing has been released - so there's no upgrade-compatibility cost to
paying it. **`minAppVersion` is bumped to `1.13.0`.** `display()` is
removed entirely in favor of `getSettingDefinitions()`.

`manifest.json`'s `version` field and `versions.json` were also hand-
corrected to `2.0.0` (matching `package.json`, which was already ahead)
rather than left to drift until an eventual `pnpm version` run, since
nothing has shipped under the stale `1.0.0` either.