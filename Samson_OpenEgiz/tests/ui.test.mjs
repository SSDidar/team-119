import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scenarios = ['baseline', 'rockfall', 'rain', 'excavator_failure', 'extra_fleet'];

test('all offline traces are complete and use unique twin identities', async () => {
  for (const scenario of scenarios) {
    const trace = JSON.parse(await readFile(new URL(`../public/traces/${scenario}.json`, import.meta.url), 'utf8'));
    assert.equal(trace.scenario, scenario);
    assert.equal(trace.frames.length, 61);
    assert.equal(trace.route.length, 360);
    assert.equal(Object.keys(trace.frames[0].things).length, 13);
    assert.equal(new Set(Object.keys(trace.frames[0].things)).size, 13);
    assert.ok(trace.frames.every((frame, i, all) => i === 0 || frame.time_s > all[i - 1].time_s));
  }
});

test('scenario traces produce observably different outcomes', async () => {
  const finals = {};
  for (const scenario of scenarios) {
    const trace = JSON.parse(await readFile(new URL(`../public/traces/${scenario}.json`, import.meta.url), 'utf8'));
    const last = trace.frames.at(-1);
    finals[scenario] = last.things['org.openegiz.samson:mine-01'].features;
  }
  assert.equal(finals.extra_fleet.fleet.active, 8);
  assert.equal(finals.baseline.fleet.active, 6);
  assert.notDeepEqual(finals.excavator_failure.fleet, finals.baseline.fleet);
});
