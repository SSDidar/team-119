# QA report — SmartHaul repository

## Browser regression suite

A Playwright suite is committed at `tests/smarthaul.test.mjs` and configured in `.github/workflows/smarthaul-check.yml`. It is intended to test the current repository's `index.html` in Chromium.

The suite checks:
- [x] Nine chapter controls are present in source.
- [x] Initial state is labelled DEMO, not LIVE, because this page has no live telemetry connection.
- [x] Manual navigation through all nine chapters.
- [x] Pause state and next-scene navigation.
- [x] Left/right keyboard navigation and camera reset button.
- [x] Canvas rendering at 1280×720, 1366×768, 1920×1080, 900×900 and 390×844.
- [x] Browser page errors and console errors are treated as test failures.

**Execution status:** The suite and GitHub Actions workflow have been committed. A completed Actions run for this exact repository revision has not yet been confirmed; do not treat the checklist above as proof that the remote CI job passed.

## Supplied archive smoke test

The separate `SmartHaul_3D_Tour_Final.zip` copy was loaded into local Chromium through Playwright. In that archive copy, all nine chapter controls opened, the canvas rendered at the five target viewport sizes, pause/resume toggled, and no JavaScript page errors or console errors were observed.

**Important:** The archive's HTML differs from the current repository root `index.html`; this smoke test is useful supporting evidence, but is not a substitute for the committed CI test against the repository version.

## Platform integration

- [ ] Run `make up` and `make example-mine` in a clean Docker environment.
- [ ] Verify MQTT / Eclipse Ditto / dashboard data flow.
- [ ] Record integration evidence.

Docker is not installed in the current execution environment, so the platform stack could not be launched here. Static inspection of the supplied OpenEgiz Makefile shows that `make up` invokes environment/preflight scripts and starts Docker Compose; `make example-mine` then adds the example-mine Compose file.

## Interpretation

The standalone walkthrough is a visual presentation, not an operational dispatch system. It uses illustrative data and does not control equipment or connect to live mine telemetry.
