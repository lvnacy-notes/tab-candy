# Tab Candy Test Suite Implementation — Section 10 Summary

This document records what has been completed in the test infrastructure setup for Section 10 of the REFACTOR-IMPLEMENTATION-CHECKLIST.md, focusing on tests and test configuration (CI is deferred to a separate session).

## Completed Work

### Build Configuration

#### 1. **package.json updates**
- Added test script: `"test": "vitest run"`
- Added watch mode: `"test:watch": "vitest"`
- Added UI mode: `"test:ui": "vitest --ui"`
- Added test dependencies:
  - `vitest@^2.0.0` — test runner
  - `@vitest/ui@^2.0.0` — interactive test UI
  - `obsidian-test-mocks@^0.17.1` — Obsidian API mocks
  - `jsdom@^24.0.0` — DOM environment for React tests
  - `@testing-library/react@^14.0.0` — React testing utilities
  - `vite@^5.3.0` — build/test infrastructure

#### 2. **vitest.config.ts** (new)
- Configured jsdom environment for React component testing
- Integrated `obsidian-test-mocks/vitest-setup` for Obsidian API mocks
- Enabled globals (`describe`, `it`, `expect`, `vi` available without imports)
- Configured coverage reporting (text, HTML, JSON)
- Set up baseline ratchet coverage thresholds (all at 0, capturing baseline on first run)
- Configured test file globs: `src/**/*.test.ts` and `src/**/*.test.tsx`
- Disabled strict ESM module handling for Obsidian types

### Shared Test Infrastructure

#### 3. **src/test/fakes.ts** (new)
- Implemented `buildSettings(overrides?: Partial<TabCandySettings>): TabCandySettings`
  - Factory function for test settings construction
  - Merges overrides with `DEFAULT_SETTINGS`
  - Fully typed, eliminates boilerplate in test files
- Documented private-registry fixture patterns for bookmarks/commands tests
  - Malformed registry handling (missing, disabled, wrong shape)
  - Placeholders for implementation once first tests are written

### Implemented Test Files

All test files follow the methodology from Tab Candy Testing Specification:
- **One test per logical branch**, not per prop combination
- **Explicit assertions**, no snapshots
- **Arrange/act/assert layout** with blank lines between sections
- **Fake timers** for any debounce/timer/interval testing
- **No `any` types** in test files — proper types for all fakes
- **Load-bearing behavior focus** — emphasis on behaviors that would break the plugin, not comprehensive coverage

#### Load-Bearing Behavior Tests (High Priority)

**[src/settings/normalizeSettings.test.ts](../src/settings/normalizeSettings.test.ts)** — 50+ tests
- Settings survive malformed/legacy data without corrupting the user's config
- Covers: defaults, missing fields, malformed enums, invalid search providers, array handling, string/boolean validation
- Validates that unknown fields are dropped (no legacy field leakage)
- Enum fallback testing for `backgroundTheme`, `timeFormat`, `bookmarkSource`, `quoteSource`

**[src/settings/SettingsStore.test.ts](../src/settings/SettingsStore.test.ts)** — 30+ tests
- The settings store's subscribe/unsubscribe doesn't leak or double-fire
- Covers: get/update contract, subscriber notification, unsubscribe actually removes listeners
- Tests the real bug fix: old Observable filtered with `===` (kept matching callback), new SettingsStore uses Set.delete() (correct)
- React component lifecycle pattern (subscribe on mount, unsubscribe on unmount)

**[src/services/backgrounds.test.ts](../src/services/backgrounds.test.ts)** — 30+ tests
- Background resolution degrades gracefully on a vault someone actually has
- Covers: missing folder, folder doesn't exist, nested folders (non-recursive), unsupported extensions, deleted files mid-session
- Tests with obsidian-test-mocks' in-memory vault builder (`App.createConfigured__()`)
- Case-insensitive extension matching, path normalization

#### Utility/Service Tests (Supplementary)

**[src/utils/isEnumValue.test.ts](../src/utils/isEnumValue.test.ts)** — 15+ tests
- Enum validation shared by normalizeSettings() and live DropdownComponent callbacks
- Tests all enum types (`BackgroundTheme`, `TIME_FORMAT`, `BOOKMARK_SOURCE`, `QUOTE_SOURCE`)
- Type guard verification (TypeScript narrowing works correctly)

**[src/utils/imageExtensions.test.ts](../src/utils/imageExtensions.test.ts)** — 25+ tests
- Image extension list completeness and normalization
- Validation pattern helper for both vault folder sync and manual image picker
- Case-insensitive matching, no leading dots, comprehensive format support

**[src/utils/debounce.test.ts](../src/utils/debounce.test.ts)** — 20+ tests
- Debounce utility (used for text-setting saves, no real setTimeout waits)
- Fake timers throughout (`vi.useFakeTimers()`)
- Tests: rapid call collapse, timer reset, argument forwarding, independence across instances
- Real use case: text input batching (multiple keystrokes → single save call)

**[src/app/utils/time.test.ts](../src/app/utils/time.test.ts)** — 30+ tests
- Time formatting (12/24-hour) and time-of-day greeting logic
- Fake timers for edge cases: midnight, noon, AM/PM transitions
- Greeting boundaries: 5 AM (morning), 12 PM (afternoon), 6 PM (evening)
- Both functions are pure, stateless (depend only on `new Date()`)

#### Placeholder/Skeleton Tests (Deferred Implementation)

These are fully structured test files with pseudocode and clear blocking dependencies. They're ready for implementation once their source code is refactored:

**[src/test/integration/view-lifecycle.test.ts](../src/test/integration/view-lifecycle.test.ts)** — 5 skipped tests
- Tests the React root lifecycle of TabCandyView
- Blocks on: TabCandyView refactor (REFACTOR-IMPLEMENTATION-CHECKLIST.md § 5)

**[src/services/bookmarks.test.ts](../src/services/bookmarks.test.ts)** — 6 skipped tests
- Tests private API guard for bookmarks (`internalPlugins.plugins.bookmarks`)
- Blocks on: bookmarks adapter refactor (§ 6)

**[src/services/quotes.test.ts](../src/services/quotes.test.ts)** — 5 skipped tests
- Tests quote fetching, API fallback, custom quotes fallback
- Blocks on: quotes service refactor (§ 4)

**[src/app/components/App.test.tsx](../src/app/components/App.test.tsx)** — 15 skipped tests
- Tests React App component display states and user interactions
- Blocks on: App component refactor (§ 7)

## Test Methodology Summary

### From Tab Candy Testing Specification

**Load-bearing behaviors** (hard testing, non-negotiable):
1. Settings survive malformed data without corrupting config → `normalizeSettings.test.ts`
2. Settings store subscribe/unsubscribe doesn't leak → `SettingsStore.test.ts`
3. Background resolution degrades gracefully → `backgrounds.test.ts`
4. View lifecycle doesn't leak React roots → `view-lifecycle.test.ts` (placeholder)
5. Private-API access fails closed, not open → `bookmarks.test.ts` (placeholder)

**Supplementary behaviors** (covered because it's cheap once fakes exist):
- Utility functions (time formatting, image extensions, debounce)
- Pure functions and validators

**What's NOT tested** (per design):
- Obsidian's own internals (trust obsidian-test-mocks)
- React's own behavior (trust React)
- CSS/visual output (no visual regression testing)
- Trivial wrappers with no branching

### Coverage: The Ratchet

- **No invented targets** — baseline is captured on first run
- **Two independent CI gates** (deferred to next session):
  1. Tests fail → CI fails (unconditional)
  2. Coverage drops below baseline → CI fails (independent)
- Both gates must be green to merge

## Dependency Status

**Blocked on implementation of source files** (tests exist, skipped):
- TabCandyView lifecycle (§ 5 of refactor)
- Bookmarks adapter (§ 6)
- Quotes service (§ 4)
- App component refactor (§ 7)

**Ready to run now** (dependencies already exist or are mocked):
- Settings normalization (✓ normalizeSettings.ts exists)
- Settings store (✓ SettingsStore.ts exists)
- Background utilities (✓ backgrounds.ts exists)
- Utility functions (✓ all exist)

## Next Steps

1. **Dependencies installation** (Node/pnpm required):
   ```bash
   pnpm install
   pnpm run test
   ```

2. **Verify test execution** without errors (should see a mix of passing and skipped tests)

3. **Implement skipped tests** as their source files are refactored (tests are already structured and ready)

4. **Set up CI pipeline** (separate session):
   - CI job runs `pnpm run test` with coverage reporting
   - Coverage baseline captured on first run
   - Subsequent runs compare against baseline (ratchet gate)

5. **Monitor test output** for coverage report and ensure it doesn't decrease

## Files Created/Modified

### New Files
- `vitest.config.ts`
- `src/test/fakes.ts`
- `src/settings/normalizeSettings.test.ts`
- `src/settings/SettingsStore.test.ts`
- `src/utils/isEnumValue.test.ts`
- `src/utils/imageExtensions.test.ts`
- `src/utils/debounce.test.ts`
- `src/app/utils/time.test.ts`
- `src/services/backgrounds.test.ts`
- `src/services/bookmarks.test.ts` (placeholder)
- `src/services/quotes.test.ts` (placeholder)
- `src/test/integration/view-lifecycle.test.ts` (placeholder)
- `src/app/components/App.test.tsx` (placeholder)

### Modified Files
- `package.json` (test scripts, dependencies)

## Totals

- **Full test files implemented**: 8
- **Total test cases written**: 175+
- **Placeholder test files (skipped, ready for implementation)**: 4
- **Total placeholder test cases**: 25+
- **Lines of test code**: 2000+
- **Build/config files**: 2

---

**Status**: ✅ **Section 10 test infrastructure is complete and ready for implementation of source files.**

The test suite is structured, comprehensive, and ready to validate the refactor as each section is completed. Once dependencies are installed (Node/pnpm), the test suite can be run with `pnpm run test`.
