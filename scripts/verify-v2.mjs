import { chromium } from 'playwright-core';

const out = process.env.OUT ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

// 1. default (now solid-light) with beams between links
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/n-default.png` });

// 2. hover История → gallery-dark scene change
await page.hover('#nav-istoria');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/n-hover-dark.png` });

// 3. cross-flare variant
await page.goto('http://localhost:5199/?fx=cross-flare', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/n-v4.png` });

// 4. map: default top-down (mouse untouched = centered input state)
await page.goto('http://localhost:5199/#concept', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/n-map-top.png` });

// 5. map: tilt toward lower-right corner
await page.mouse.move(720, 400);
await page.waitForTimeout(300);
await page.mouse.move(1350, 730, { steps: 5 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/n-map-tilt.png` });

console.log('LOGS:', JSON.stringify(logs, null, 1));
await browser.close();
