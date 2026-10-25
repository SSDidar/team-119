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
  await page.waitForTimeout(300);

  assert.match(await page.title(), /SmartHaul/i);
  assert.equal(await page.locator('#scene').count(), 1, '3D scene canvas should exist');
  assert.equal(await page.locator('#chapterDots .chapter-dot').count(), 9, 'Expected nine scene navigation buttons');
  assert.match(await page.locator('#sceneIndex').innerText(), /ГЛАВА 01 \/ 09/);
  assert.ok(await page.locator('#sceneTitle').innerText(), 'Scene title should not be empty');
  assert.ok(await page.locator('#captionText').innerText(), 'Scene description should not be empty');

  // Pause autoplay before testing manual navigation.
  await page.locator('#playBtn').click();
  assert.match(await page.locator('#playText').innerText(), /Продолжить/);

  await page.locator('#nextBtn').click();
  assert.match(await page.locator('#sceneIndex').innerText(), /ГЛАВА 02 \/ 09/);
  await page.locator('#prevBtn').click();
  assert.match(await page.locator('#sceneIndex').innerText(), /ГЛАВА 01 \/ 09/);

  for (let i = 0; i < 9; i++) {
    await page.locator('#chapterDots .chapter-dot').nth(i).click();
    assert.match(await page.locator('#sceneIndex').innerText(), new RegExp(`ГЛАВА ${String(i + 1).padStart(2, '0')} \/ 09`), `Scene ${i + 1} should open`);
  }

  await page.keyboard.press('ArrowLeft');
  assert.match(await page.locator('#sceneIndex').innerText(), /ГЛАВА 08 \/ 09/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('#sceneIndex').innerText(), /ГЛАВА 09 \/ 09/);

  await page.locator('#replayBtn').click();
  assert.match(await page.locator('#sceneIndex').innerText(), /ГЛАВА 01 \/ 09/);
  await page.locator('#resetViewBtn').click();

  for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [900, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('#scene');
      const headline = document.querySelector('#headline');
      const caption = document.querySelector('.caption-box');
      const rect = canvas.getBoundingClientRect();
      return {
        canvasVisible: rect.width > 0 && rect.height > 0,
        headlineVisible: !!headline && headline.getBoundingClientRect().width > 0,
        captionVisible: !!caption && caption.getBoundingClientRect().width > 0,
        canvasDrawn: canvas.toDataURL().length > 1000
      };
    });
    assert.equal(result.canvasVisible, true, `Canvas should fit viewport ${width}x${height}`);
    assert.equal(result.headlineVisible, true, `Headline should be visible at ${width}x${height}`);
    assert.equal(result.captionVisible, true, `Caption should be visible at ${width}x${height}`);
    assert.equal(result.canvasDrawn, true, `Canvas should render at ${width}x${height}`);
  }

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  console.log('PASS: nine scenes, navigation, pause, keyboard, replay, reset view, five viewports, rendered canvas, no browser errors.');
} finally {
  await browser.close();
}
