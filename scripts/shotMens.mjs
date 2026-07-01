// Drives the installed Google Chrome to emulate an iPhone, measure horizontal
// overflow, and take accurate full-page screenshots of every men's-home tab.
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'https://aicc-aia-cricket.com/mens';
const tabs = ['matches', 'fixtures', 'table', 'squads', 'stats'];
// iPhone 12/13 logical viewport
const device = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] });
try {
  const page = await browser.newPage();
  await page.setViewport(device);
  for (const t of tabs) {
    await page.goto(`${BASE}?tab=${t}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500)); // let data + first render settle
    const m = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      innerW: window.innerWidth,
      bodyScrollW: document.body.scrollWidth,
    }));
    const overflow = m.scrollW - m.clientW;
    console.log(`tab=${t.padEnd(8)} innerW=${m.innerW} clientW=${m.clientW} scrollW=${m.scrollW}  → horizontal overflow: ${overflow}px ${overflow <= 0 ? '✅ none' : '⚠️'}`);
    await page.screenshot({ path: `/tmp/ios_mens_${t}.png`, fullPage: true });
  }
  // Identify the widest offending element on the matches tab, if any
  await page.goto(`${BASE}?tab=matches`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 0.5) bad.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 30), right: Math.round(r.right), w: Math.round(r.width), txt: (el.textContent || '').trim().slice(0, 24) });
    }
    return bad.slice(0, 8);
  });
  console.log('\nElements past the right edge (matches tab):');
  if (offenders.length === 0) console.log('  none 🎉');
  else offenders.forEach(o => console.log(`  <${o.tag}> right=${o.right} w=${o.w} "${o.txt}"`));
} finally {
  await browser.close();
}
