import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		// The real `obsidian` package published to npm is a types-only shim
		// (`"main": ""`) — Obsidian itself supplies the runtime module at
		// plugin-load time. Vite's resolver chokes on that empty entry
		// before obsidian-test-mocks' `vi.mock('obsidian', ...)` ever gets a
		// chance to intercept the import, so we alias the bare specifier
		// straight to the mock package ourselves.
		alias: {
			obsidian: 'obsidian-test-mocks/obsidian',
		},
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['obsidian-test-mocks/vitest-setup'],
		include: ['src/**/*.test.{ts,tsx}'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'json'],
			// The Ratchet (Testing Specification, "Coverage: the Ratchet"):
			// no invented target, coverage just can't drop below wherever it
			// already sits. Thresholds start at 0 so the first real run
			// establishes the baseline rather than failing immediately on an
			// empty suite; CI wiring to compare run-to-run is deferred (see
			// REFACTOR-IMPLEMENTATION-CHECKLIST.md §10 - CI is a separate
			// session).
			thresholds: {
				lines: 0,
				functions: 0,
				branches: 0,
				statements: 0,
			},
		},
	},
});