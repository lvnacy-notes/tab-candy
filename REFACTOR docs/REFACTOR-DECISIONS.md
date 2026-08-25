# §0 Decisions and Baseline — Resolution Log

This settles every item in [REFACTOR-IMPLEMENTATION-CHECKLIST.md](REFACTOR-IMPLEMENTATION-CHECKLIST.md)
§0. Each entry states the decision, the reasoning, and what (if anything) it
locks in for later sections. See [BASELINE.md](BASELINE.md) for the full
current-behavior capture referenced throughout.

---

## Plugin id policy — **decided (already applied)**

`tabcandy` is the id, `Tab Candy` is the display name, both already correct
in `manifest.json`, `manifest-beta.json`, and `package.json`. Since Obsidian
treats a plugin id as an installation identity, anyone on the old
`beautitab` id gets treated as a fresh install, not an upgrade. That's
accepted as a deliberate, one-time migration cost rather than something to
work around with compatibility shims. No further action here.

## Minimum supported Obsidian version — **0.15.0, unchanged**

Walking the APIs the refactor actually commits to using:

- `ItemView`, `PluginSettingTab`, `Setting`, `Modal`/`FuzzySuggestModal` —
  present since the earliest plugin API, far below any version under
  consideration.
- `registerEvent`, `registerDomEvent`, `registerInterval`,
  `workspace.getLeavesOfType`, `workspace.revealLeaf` — all long-standing,
  pre-1.0 APIs.
- `vault.getFiles`, `vault.getAbstractFileByPath`, `vault.adapter.list`,
  `vault.adapter.readBinary`, `vault.readBinary` — public vault/adapter
  surface, also pre-1.0.
- `requestUrl` — the newest API in the actual usage list, and it requires
  API version **0.13.25**.

The binding constraint is `requestUrl` at 0.13.25, and the manifest already
declares `0.15.0`, which clears that with room to spare. There's no API
reason to move the floor in either direction, so it stays at `0.15.0`. No
manifest edit needed for this reason alone; §10 will still touch
`manifest.json`/`manifest-beta.json`/`versions.json` for the version bump
that accompanies the actual release.

If a later section pulls in something genuinely newer (e.g. a public
bookmarks API if Obsidian ships one), that's the trigger to revisit this
number — not before.

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
opt-in **setting**, defaulted **on** so today's out-of-the-box experience
doesn't regress for existing users. The setting drives the same narrow
activation path rather than a blanket "grab whatever the most-recent-leaf
API hands back" check — the point isn't to remove the convenience, it's to
stop treating uncontrolled event-driven leaf hijacking as the *only* entry
point with no off switch and no reuse-awareness.

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