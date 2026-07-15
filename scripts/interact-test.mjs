import { chromium } from 'playwright-core';

const out = process.env.OUT ?? '.';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// 1. hover the Концепция link -> its beam should intensify
await page.hover('#nav-kontseptsia');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/hover-koncept.png` });

// 2. switch to ver 2 via the segmented control, mid-tween + settled
await page.click('.variant-switcher button:nth-child(2)');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/switched-v2.png` });

// 3. click Концепция -> transition; catch the flash mid-flight
await page.click('#nav-kontseptsia');
await page.waitForTimeout(330);
await page.screenshot({ path: `${out}/transition-mid.png` });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/after-transition.png` });

// 4. tilt the map by moving the cursor to a corner
await page.mouse.move(200, 150);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/map-tilt-a.png` });
await page.mouse.move(1300, 700);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/map-tilt-b.png` });

// 5. navigate back via logo -> reverse transition lands on main
await page.click('.concept-home');
await page.waitForTimeout(1100);
await page.screenshot({ path: `${out}/back-on-main.png` });

console.log('URL:', page.url());
console.log('LOGS:', JSON.stringify(logs, null, 1));
await browser.close();
