import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const errors = [];

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  assert.match(await page.title(), /SmartHaul/i);
  assert.equal(await page.locator('#scene').count(), 1, 'Canvas should exist');
  assert.equal(await page.locator('#chapters .chapter-btn').count(), 9, 'Expected nine chapter buttons');
  assert.match(await page.locator('#chapterLabel').innerText(), /ГЛАВА 01 \/ 09/);
  assert.equal(await page.locator('#modeMetric').innerText(), 'DEMO', 'Disconnected demo must not be labelled LIVE');

  // Pause the automatic tour so manual-navigation assertions are deterministic.
  await page.locator('#pause').click();
  assert.match(await page.locator('#pause').innerText(), /Продолжить/);
  await page.locator('#next').click();
  assert.match(await page.locator('#chapterLabel').innerText(), /ГЛАВА 02 \/ 09/);

  const expected = [
    'ГЛАВА 01 / 09', 'ГЛАВА 02 / 09', 'ГЛАВА 03 / 09',
    'ГЛАВА 04 / 09', 'ГЛАВА 05 / 09', 'ГЛАВА 06 / 09',
    'ГЛАВА 07 / 09', 'ГЛАВА 08 / 09', 'ГЛАВА 09 / 09'
  ];
  for (let i = 0; i < expected.length; i++) {
    await page.locator('#chapters .chapter-btn').nth(i).click();
    assert.ok((await page.locator('#chapterLabel').innerText()).includes(expected[i]), `Chapter ${i + 1} should open`);
  }

  await page.keyboard.press('ArrowLeft');
  assert.match(await page.locator('#chapterLabel').innerText(), /ГЛАВА 08 \/ 09/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('#chapterLabel').innerText(), /ГЛАВА 09 \/ 09/);
  await page.locator('#reset').click();

  for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [900, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('#scene');
      const story = document.querySelector('.story');
      const rect = canvas.getBoundingClientRect();
      return {
        canvasVisible: rect.width > 0 && rect.height > 0,
        storyExists: !!story && story.getBoundingClientRect().width > 0,
        canvasDrawn: canvas.toDataURL().length > 1000
      };
    });
    assert.equal(result.canvasVisible, true, `Canvas should fit viewport ${width}x${height}`);
    assert.equal(result.storyExists, true, `Story panel should be visible at ${width}x${height}`);
    assert.equal(result.canvasDrawn, true, `Canvas should render at ${width}x${height}`);
  }

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  console.log('PASS: nine chapters, navigation, pause, keyboard, reset, five viewports, rendered canvas, no browser errors.');
} finally {
  await browser.close();
}
