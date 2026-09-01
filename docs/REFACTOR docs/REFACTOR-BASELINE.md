# Tab Candy — Pre-Refactor Baseline

Captured from the `chore/refactor` branch as of the initial rebrand commit
(`c9be53a`), before any §1+ implementation work begins. This is the behavior
the refactor must not silently break. Where the refactor *intends* to change
something (vault-relative backgrounds, `ItemView`, explicit activation,
bookmarks isolation), that's called out as a known, deliberate delta — not a
regression.

## Plugin identity

- Manifest id: `tabcandy`. Display name: `Tab Candy`. Version: `2.0.0`.
- `minAppVersion`: `0.15.0`. `isDesktopOnly`: `false` (though the current
  implementation doesn't actually honor that on the backgrounds feature —
  see below).
- View type constant: `tabcandy-react-view`. Tab title: `New tab`. No icon
  (`getIcon()` returns `""`).

## Settings (`TabCandyPluginSettings`, defaults in `DEFAULT_SETTINGS`)

| Setting | Default | Notes |
|---|---|---|
| `backgroundTheme` | `seasons and holidays` | One of: seasons and holidays, winter, spring, summer, fall, mountains, lakes, forest, animals, custom, local, transparent, transparent with shadows |
| `customBackground` | `""` | URL, only shown/used when theme = custom |
| `localBackgrounds` | `[]` | Array of `data:` URIs (base64-embedded image bytes) |
| `localBackgroundsDirectory` | `""` | Absolute OS path; desktop-only |
| `showTopLeftSearchButton` | `true` | |
| `topLeftSearchProvider` | `{ command: "switcher:open", display: "Obsidian Core Quick Switcher" }` | |
| `showTime` | `true` | |
| `timeFormat` | `12-hour` | or `24-hour` |
| `showGreeting` | `true` | |
| `greetingText` | `"Hello, Beautiful."` | Supports a `{{greeting}}` token |
| `showInlineSearch` | `true` | |
| `inlineSearchProvider` | same default as top-left | independently configurable |
| `showRecentFiles` | `true` | |
| `showBookmarks` | `false` | |
| `bookmarkSource` | `all` | or `group` |
| `bookmarkGroup` | `""` | group title, only used when source = group |
| `showQuote` | `true` | |
| `quoteSource` | `Quoteable` | or `My quotes` / `Both` |
| `customQuotes` | `[]` | `{ text, author }[]` |

No `settingsVersion` field exists today. `loadSettings()` does a shallow
`Object.assign({}, DEFAULT_SETTINGS, data)` — no validation, no enum
checking, no schema migration.

## Backgrounds (current, pre-refactor implementation)

- **Built-in themed backgrounds**: seasonal/category tags render server-side
  imagery (exact source not relevant to the refactor — untouched by §4).
- **Custom**: a single user-supplied URL.
- **Local backgrounds — desktop OS folder** (`localBackgroundsDirectory`):
  - Absolute filesystem path, chosen via an Electron native folder dialog
    (`electron.remote.dialog.showOpenDialog`).
  - On every `onload()`, `syncLocalBackgroundsFromDirectory()` runs
    automatically: `fs.readdirSync()` the directory, **non-recursively**
    (no subfolder traversal), filters by extension
    (`.jpg .jpeg .png .webp .gif`), reads each file with
    `fs.readFileSync()`, base64-encodes it, and writes the full set of
    `data:` URIs into `settings.localBackgrounds`, replacing whatever was
    there. A manual "Sync now" button re-runs the same routine on demand.
  - Explicitly gated off on mobile (`if (!directory || this.app.isMobile) return;`)
    despite the manifest declaring `isDesktopOnly: false`.
  - Failures (missing dir, not-a-directory, read errors) show an Obsidian
    `Notice` and log to console; they don't crash the plugin.
- **Local backgrounds — manual add (desktop)**: "Add local image" opens an
  Electron file-open dialog filtered to `jpg`/`png` only (note: narrower
  than the folder-sync extension list, which also allows `jpeg`/`webp`/`gif`),
  reads the file with `fs.readFileSync`, and pushes a base64 `data:` URI.
- **Local backgrounds — manual add (vault)**: "Add vault image" opens
  `ChooseImageSuggestModal`, reads the chosen file with
  `app.vault.readBinary()`, base64-encodes it, and pushes a `data:image/png`
  URI regardless of the actual source format (a latent bug — a non-PNG vault
  image gets mislabeled).
- Every local background, regardless of source, is stored as a full base64
  image payload directly inside `data.json` (`settings.localBackgrounds`).
  There is no cap on this list; it grows with every added image and every
  folder sync.
- Removing a local image asks for confirmation via `ConfirmModal`, then
  splices it out of the array.

## Search

- Two independently configurable search buttons: top-left icon and an
  inline "click to search" affordance in the middle of the screen.
- Each is backed by a `SearchProvider` (`{ command, display }`). Provider
  selection happens through `ChooseSearchProvider`, which enumerates
  `this.app.commands.commands` (private registry, `@ts-ignore`'d) filtered
  to a hardcoded allowlist of plugin id prefixes: `switcher`, `omnisearch`,
  `darlal-switcher-plus`, `obsidian-another-quick-switcher`.
- Executing a chosen provider: `openSwitcherCommand()` checks whether the
  provider's owning plugin/internal-plugin is enabled (via
  `this.app.plugins.plugins` / `this.app.internalPlugins.plugins`, both
  private, `@ts-ignore`'d) and, if so, calls
  `this.app.commands.executeCommandById(command)` (also private). If the
  plugin isn't enabled, shows a `Notice` telling the user to enable it.

## Time / Greeting

- Time ticks live in the middle of the screen; 12h or 24h, toggleable.
- Greeting text is user-editable and supports a `{{greeting}}` placeholder
  that's substituted with a time-of-day-appropriate greeting
  (`getTimeOfDayGreeting.ts`, untouched by this baseline).

## Recent files

- Shows the 5 most recently modified files. The current implementation
  derives this list and calls `.sort()` directly on the array returned by
  the query, mutating a value that may be shared/cached elsewhere — a
  correctness note for §7, not a settings-visible behavior.

## Bookmarks

- Off by default (`showBookmarks: false`).
- Reads `app.internalPlugins.plugins.bookmarks.instance.items` — a private
  core-plugin implementation detail, `@ts-ignore`'d, with **no guard**: if
  the Bookmarks core plugin is disabled or the shape changes, this throws
  rather than degrading gracefully.
- Two modes: all bookmarks (recursively flattened across nested groups) or
  bookmarks from one named group (matched by title, first match wins if
  duplicate group names exist at different nesting levels).
- Renders up to 5 bookmarked files.

## Quotes

- Three modes: built-in (`Quoteable`, a third-party quote API), user-defined
  custom quotes, or both combined.
- Custom quotes are edited through `CustomQuotesModel` as
  `{ text, author }` pairs and persisted directly in settings.
- Fetching failure/fallback behavior for the `Quoteable` source is not yet
  hardened (see REFACTOR.md §"Network requests" — a §6 concern).

## View opening / reload behavior

- `TabCandyPlugin.onLayoutChange()` runs on every Obsidian `layout-change`
  event and unconditionally hijacks the **most recently used leaf** if its
  view type is `"empty"`, force-replacing it with the Tab Candy view. There
  is no setting to disable this and no dedicated "open Tab Candy" command —
  hijacking is the only entry point today.
- The view extends `FileView` with `allowNoFile = true`, even though Tab
  Candy has no backing file. A new `ReactView` instance is constructed by
  Obsidian's view factory on demand; there's no protection against multiple
  factory calls creating redundant instances, and no `getLeavesOfType()`
  based reuse.
- React mounts via `createRoot(this.contentEl)` in `onOpen()` and unmounts
  in `onClose()`. `contentEl` is not explicitly cleared before mounting.
- `onunload()` is empty — no explicit cleanup runs today.
- A blocking-ish startup version check (`versionCheck()`) hits two GitHub
  raw-content URLs via `requestUrl()` on every `onload()` and shows a
  persistent (`0`-duration, i.e. sticky) `Notice` if a newer stable/beta
  version is available. It does not currently block view registration, but
  it does run unconditionally and un-cached on every load.
- A dev-only mobile emulation block (`app.emulateMobile()`, `@ts-ignore`'d)
  runs when `NODE_ENV === "development"`, gated further by an
  `EMULATE_MOBILE` env var wired through esbuild's `define`.

## Verified clean

- `git log` on `chore/refactor` shows a single rebrand/planning commit on
  top of the imported Beautitab history; there are no stray uncommitted or
  unrelated changes in the working tree.
- `updates.ts` does not exist yet on this branch. There is currently nothing
  under that name to accidentally treat as a refactor source file, but the
  exclusion rule in the checklist stays in force for whenever it's
  introduced.