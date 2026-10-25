# QA checklist — current SmartHaul repository revision

This checklist records what was inspected and what still needs an actual run.

## Source review
- [x] Root `index.html` exists and source contains nine chapter labels.
- [x] README and SUBMISSION describe the nine chapters.
- [x] Synthetic-data and non-operational limitations are documented.
- [x] Presentation PDF is present in the root.

## Tests still required
- [ ] Open the current revision in Chrome/Edge and inspect the JavaScript console.
- [ ] Navigate all nine chapters manually and with keyboard shortcuts.
- [ ] Test pause/resume, reset, camera drag, zoom and optional speech.
- [ ] Check desktop and mobile viewports.
- [ ] Run `make up` and `make example-mine` in a clean Docker environment.
- [ ] Verify MQTT / Eclipse Ditto / dashboard data flow.
- [ ] Record reproducible integration-test evidence.

## Interpretation
This is a QA checklist, not a claim that every test passed. The supplied archive includes a separate QA report for its own walkthrough build; that report has not been independently reproduced against this repository revision. The standalone presentation is not connected to live mine telemetry or operational equipment.
