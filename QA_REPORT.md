# QA checklist — SmartHaul repository

This checklist distinguishes reviewed artifacts from tests that still require execution.

## Reviewed
- [x] Supplied ZIP contains a standalone HTML walkthrough and a QA report.
- [x] Repository root has an interactive `index.html`.
- [x] The root demo has scenario controls and keyboard/pointer interactions.
- [x] README and SUBMISSION document synthetic data and platform-integration limits.
- [x] No external JavaScript or CSS CDN is referenced by the root HTML.

## Not yet independently verified in this revision
- [ ] Run in Chromium/Chrome and inspect the console.
- [ ] Verify layout at desktop and mobile viewports.
- [ ] Exercise all six scenario buttons and keyboard controls.
- [ ] Verify reduced-motion/accessibility behavior.
- [ ] Run `make up` and `make example-mine` in a clean Docker environment.
- [ ] Verify MQTT-to-Ditto-to-dashboard data flow.
- [ ] Generate and attach platform integration test evidence.

## Interpretation
This file is a checklist, not a claim that all tests passed. The standalone page is a presentation prototype with synthetic data; it is not connected to live mine telemetry or operational controls.
