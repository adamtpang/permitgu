import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = process.env.TEST_PORT || '4337';
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['tools/dev.mjs', port], { cwd: root, stdio: 'pipe' });
let browser;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { ready = (await fetch(base)).ok; } catch {}
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, 'Local server starts');
  assert.equal((await fetch(base + '/.env.local')).status, 404);
  assert.equal((await fetch(base + '/api/_kb.mjs')).status, 404);
  browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const pages = fs.readdirSync(path.join(root, 'public')).filter((name) => name.endsWith('.html'));
  let count = 0;
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [320, 375, 768, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: 'reduce' });
      await context.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      for (const filename of pages) {
        const slug = filename === 'index.html' ? '/' : '/' + filename.replace('.html', '');
        assert.ok((await page.goto(base + slug)).ok());
        assert.equal(await page.locator('.demo').count(), 1);
        assert.ok(await page.locator('main,[role="main"]').count());
        assert.equal(await page.locator('meta[property="og:image"]').count(), 1, filename + ' social image');
        assert.ok(!(await page.content()).includes('https://guamgov.vercel.app'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${filename}: no overflow at ${width}px ${colorScheme}`);
        await page.locator('#menuBtn').click();
        assert.equal(await page.locator('#menuPanel').getAttribute('aria-modal'), 'true');
        assert.ok(await page.locator('.menu-close').evaluate((element) => element === document.activeElement));
        await page.keyboard.press('Shift+Tab');
        assert.ok(await page.locator('.menu-more a').last().evaluate((element) => element === document.activeElement));
        await page.keyboard.press('Tab');
        assert.ok(await page.locator('.menu-close').evaluate((element) => element === document.activeElement));
        await page.keyboard.press('Escape');
        assert.ok(await page.locator('#menuPanel').isHidden());
        assert.ok(await page.locator('#menuBtn').evaluate((element) => element === document.activeElement));
        assert.equal(errors.length, 0, `${filename}: JavaScript errors: ${errors.join(', ')}`);
        count++;
      }
      await context.close();
    }
  }
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  await context.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const page = await context.newPage();
  if (process.env.GENERATE_SOCIAL_PREVIEW) {
    await page.goto(base);
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(fs.readFileSync(path.join(root, 'tools/social-preview.html'), 'utf8'));
    await page.locator('img').evaluate((image) => image.decode());
    await page.screenshot({ path: path.join(root, 'social-preview.png') });
    await page.setViewportSize({ width: 375, height: 812 });
  }
  await page.goto(base);
  await page.locator('#q').fill('zoning');
  assert.equal(await page.locator('.card:visible').count(), 1);
  assert.equal(await page.locator('#pause').getAttribute('aria-label'), 'Play examples');
  assert.ok(await page.locator('#dockf').evaluate((element) => element.inert));
  const handoffQuestions = [];
  await page.route('**/api/ask', async (route) => {
    handoffQuestions.push(route.request().postDataJSON().q);
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ meta: { topic: 'build', sources: [{ title: 'DPW', url: 'https://dpw.guam.gov' }] } }) + '\n' + JSON.stringify({ t: 'Confirm with DPW. [1]' }) + '\n' + JSON.stringify({ done: true }) + '\n' });
  });
  let handoffCount = 0;
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scenario of [
      { expected: 'I want to start a food truck' },
      { next: true, expected: 'My roof blew off in the typhoon' },
      { typed: 'Can I build a fence?', expected: 'Can I build a fence?' },
      { enter: true, expected: 'I want to start a food truck' },
      { next: true, typed: '   ', expected: 'My roof blew off in the typhoon' },
      { image: true, next: true, expected: 'My roof blew off in the typhoon' },
      { dock: true, typed: 'Check my zoning', expected: 'Check my zoning' },
    ]) {
      await page.goto(base);
      if (scenario.next) await page.locator('#next').click();
      const input = page.locator(scenario.dock ? '#dq' : '#q');
      if (scenario.dock) {
        await page.locator('#all').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => !document.getElementById('dockf').inert);
      }
      if (scenario.typed) await input.fill(scenario.typed);
      if (scenario.enter) await input.press('Enter');
      else if (scenario.image) await page.locator('#slides').click();
      else await page.locator(`${scenario.dock ? '#dockf' : '#askf'} button[type="submit"]`).click();
      await page.waitForURL(base + '/ask');
      await page.locator('.sources').waitFor();
      assert.equal(handoffQuestions.length, ++handoffCount, 'One AI request per submission');
      assert.equal(handoffQuestions.at(-1), scenario.expected, `Prompt handoff at ${width}px`);
      assert.equal(await page.locator('.msg.you').textContent(), scenario.expected);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('pgq')), null);
      assert.equal(new URL(page.url()).search, '', 'Question stays out of the URL');
    }
  }
  await page.unroute('**/api/ask');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(base + '/corrections?topic=Zoning');
  let submissions = 0;
  page.on('request', (request) => { if (request.method() === 'POST') submissions++; });
  await page.locator('#correction-detail').fill('Please confirm the latest variance form.');
  await page.locator('#correction-source').fill('https://dlm.guam.gov');
  await page.locator('#correction-form button[type="submit"]').click();
  assert.match(await page.locator('#correction-output').inputValue(), /Please confirm/);
  assert.equal(submissions, 0);
  await page.goto(base + '/ask');
  await page.route('**/api/ask', async (route) => {
    await delay(400);
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ meta: { topic: 'build', sources: [{ title: 'DPW', url: 'https://dpw.guam.gov' }] } }) + '\n' + JSON.stringify({ t: 'Confirm with DPW. [1]' }) + '\n' + JSON.stringify({ done: true }) + '\n' });
  });
  await page.locator('#cq').fill('Build a fence');
  await page.locator('#send').click();
  await page.locator('#cq').fill('Keep this next question');
  await page.locator('#cq').press('Enter');
  assert.equal(await page.locator('#cq').inputValue(), 'Keep this next question');
  await page.locator('.sources').waitFor();
  assert.ok(await page.locator('#send').isEnabled());
  await page.unroute('**/api/ask');
  await page.route('**/api/ask', (route) => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ meta: { topic: 'build', sources: [] } }) + '\n' + JSON.stringify({ t: 'Incomplete answer' }) + '\n' }));
  await page.locator('#send').click();
  await page.locator('.err').waitFor();
  assert.ok(await page.getByRole('button', { name: 'Try again' }).isVisible());
  if (process.env.SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.goto(base);
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'permitgu-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'permitgu-desktop.png'), fullPage: true });
  }
  await context.close();
  console.log(`${count} responsive page checks and ${handoffCount} prompt handoffs passed; menu, filtering, correction privacy, and stream recovery passed.`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
