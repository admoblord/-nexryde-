#!/usr/bin/env node
/**
 * Generate App Store Connect screenshots for 13-inch iPad displays.
 * Required size (portrait): 2064 × 2752 px
 *
 * Usage: node frontend/scripts/generate-ipad-13-screenshots.mjs
 * Output: frontend/build-output/app-store-screenshots-ipad-13/
 *         + Desktop/NexRyde-iPad-13-Screenshots.zip
 */
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'build-output', 'app-store-screenshots-ipad-13');
const ZIP_NAME = 'nexryde-ipad-13-screenshots.zip';

/** App Store Connect — 13-inch iPad Pro portrait */
const OUT_W = 2064;
const OUT_H = 2752;
/** CSS viewport (2x → 2064×2752) */
const CSS_W = 1032;
const CSS_H = 1376;
const SCALE = 2;

const SCREENS = [
  { id: 'ipad-1', file: '01-ipad13-rider-home.png', title: 'Book a ride', blurb: 'Lagos rides in seconds' },
  { id: 'ipad-2', file: '02-ipad13-live-tracking.png', title: 'Live trip tracking', blurb: 'Follow your driver in real time' },
  { id: 'ipad-3', file: '03-ipad13-driver-online.png', title: 'Driver online', blurb: 'Go online and earn' },
  { id: 'ipad-4', file: '04-ipad13-safety.png', title: 'Safety first', blurb: 'Share trips · emergency tools' },
];

const CHROME_PATH =
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined;

function htmlDocument() {
  const screens = SCREENS.map(
    (s) => `
    <section id="${s.id}" class="ipad-screen">
      <div class="status">
        <span class="time">9:41</span>
        <span class="pill"></span>
        <span class="sys">●●●●  ▮</span>
      </div>
      <div class="hero">
        <div class="brand">NEXRYDE</div>
        <h1>${s.title}</h1>
        <p>${s.blurb}</p>
      </div>
      <div class="device">
        <div class="device-inner ${s.id}">
          ${deviceChrome(s.id)}
        </div>
      </div>
      <div class="footer-badge">Ride · Drive · Earn safely in Lagos</div>
    </section>`,
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${CSS_W}, height=${CSS_H}" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #0a0f1a; }
  .ipad-screen {
    width: ${CSS_W}px;
    height: ${CSS_H}px;
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(ellipse 90% 55% at 50% -10%, rgba(34,225,128,0.22), transparent 55%),
      radial-gradient(ellipse 70% 40% at 100% 80%, rgba(14,165,233,0.12), transparent 50%),
      linear-gradient(180deg, #0b1220 0%, #091018 55%, #06100c 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 28px 48px 40px;
  }
  .status {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 15px;
    font-weight: 600;
    opacity: 0.85;
    margin-bottom: 18px;
  }
  .status .pill {
    width: 110px; height: 28px; border-radius: 16px; background: #000;
  }
  .hero { text-align: center; margin-bottom: 22px; }
  .brand {
    display: inline-block;
    letter-spacing: 0.28em;
    font-size: 13px;
    font-weight: 800;
    color: #22E180;
    margin-bottom: 10px;
  }
  .hero h1 {
    font-size: 44px;
    font-weight: 900;
    letter-spacing: -0.03em;
    line-height: 1.05;
    margin-bottom: 8px;
  }
  .hero p { font-size: 18px; color: #9aafc8; font-weight: 500; }
  .device {
    flex: 1;
    width: 100%;
    max-width: 720px;
    display: flex;
    align-items: stretch;
    justify-content: center;
  }
  .device-inner {
    width: 100%;
    border-radius: 28px;
    border: 1px solid rgba(255,255,255,0.12);
    background: #0d1420;
    box-shadow: 0 30px 80px rgba(0,0,0,0.45);
    overflow: hidden;
    position: relative;
  }
  .map {
    position: absolute; inset: 0;
    background:
      linear-gradient(160deg, #0d1b2a 0%, #132338 40%, #0b1f18 100%);
  }
  .map::after {
    content: '';
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(34,225,128,0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(34,225,128,0.08) 1px, transparent 1px);
    background-size: 42px 42px;
    opacity: 0.55;
  }
  .pin {
    position: absolute; width: 18px; height: 18px; border-radius: 50%;
    background: #22E180; box-shadow: 0 0 0 8px rgba(34,225,128,0.25);
    top: 42%; left: 48%;
  }
  .pin.car {
    background: #38bdf8;
    box-shadow: 0 0 0 8px rgba(56,189,248,0.22);
    top: 58%; left: 36%;
  }
  .sheet {
    position: absolute; left: 16px; right: 16px; bottom: 16px;
    border-radius: 22px; padding: 18px 18px 16px;
    background: rgba(12,18,30,0.94);
    border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(12px);
  }
  .sheet.light {
    background: rgba(248,250,252,0.96);
    color: #0f172a;
    border-color: rgba(15,23,42,0.08);
  }
  .row { display: flex; align-items: center; gap: 12px; }
  .avatar {
    width: 44px; height: 44px; border-radius: 22px;
    background: linear-gradient(135deg, #22E180, #0ea5e9);
    display: grid; place-items: center; font-size: 20px;
  }
  .title { font-size: 17px; font-weight: 800; }
  .sub { font-size: 13px; color: #94a3b8; margin-top: 2px; }
  .sheet.light .sub { color: #64748b; }
  .cta {
    margin-top: 14px; height: 48px; border-radius: 14px;
    background: linear-gradient(135deg, #22E180, #00c96a);
    color: #052e16; font-weight: 900; font-size: 16px;
    display: grid; place-items: center;
  }
  .stats {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px;
  }
  .stat {
    background: rgba(255,255,255,0.05); border-radius: 12px; padding: 10px;
    text-align: center;
  }
  .stat b { display: block; font-size: 16px; font-weight: 900; color: #22E180; }
  .stat span { font-size: 11px; color: #94a3b8; font-weight: 700; letter-spacing: 0.04em; }
  .search {
    display: flex; align-items: center; gap: 10px;
    background: #fff; border-radius: 16px; padding: 14px 16px; color: #0f172a;
    font-weight: 700; font-size: 16px;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #22E180; }
  .chips { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .chip {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 999px; padding: 8px 12px; font-size: 12px; font-weight: 700; color: #e2e8f0;
  }
  .sheet.light .chip { background: #f1f5f9; color: #334155; border: none; }
  .go {
    margin-top: 12px; height: 56px; border-radius: 999px;
    background: #22E180; color: #052e16; font-weight: 900; font-size: 18px;
    display: grid; place-items: center; letter-spacing: 0.04em;
  }
  .footer-badge {
    margin-top: 18px; font-size: 13px; color: #7dd3a7; font-weight: 700;
    letter-spacing: 0.02em;
  }
</style>
</head>
<body>
${screens}
</body>
</html>`;
}

function deviceChrome(id) {
  if (id === 'ipad-1') {
    return `
      <div class="map"></div>
      <div class="pin"></div>
      <div class="sheet light" style="bottom:auto;top:88px">
        <div class="search"><span class="dot"></span> Where to?</div>
        <div class="chips">
          <div class="chip">🏠 Home</div>
          <div class="chip">🏢 Work</div>
          <div class="chip">✈️ Airport</div>
        </div>
      </div>
      <div class="sheet light">
        <div class="title">Book a NexRyde</div>
        <div class="sub">Economy · Comfort · XL across Lagos</div>
        <div class="cta">Book ride</div>
      </div>`;
  }
  if (id === 'ipad-2') {
    return `
      <div class="map"></div>
      <div class="pin"></div>
      <div class="pin car"></div>
      <div class="sheet">
        <div class="row">
          <div class="avatar">🚗</div>
          <div>
            <div class="title">Chinedu · Toyota Corolla</div>
            <div class="sub">Arriving in 4 min · ABC-123KY</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b>4′</b><span>ETA</span></div>
          <div class="stat"><b>₦2.4k</b><span>FARE</span></div>
          <div class="stat"><b>4.9★</b><span>RATING</span></div>
        </div>
      </div>`;
  }
  if (id === 'ipad-3') {
    return `
      <div class="map"></div>
      <div class="pin car" style="top:50%;left:50%"></div>
      <div class="sheet">
        <div class="title">Listening for rides</div>
        <div class="sub">Mushin / Ilupeju · Mainland</div>
        <div class="stats">
          <div class="stat"><b>₦8.2k</b><span>TODAY</span></div>
          <div class="stat"><b>8</b><span>TRIPS</span></div>
          <div class="stat"><b>4.9</b><span>RATING</span></div>
        </div>
        <div class="go">GO ONLINE</div>
      </div>`;
  }
  return `
      <div class="map" style="background:linear-gradient(180deg,#102010,#0b1420)"></div>
      <div class="sheet">
        <div class="title">Safety center</div>
        <div class="sub">Share trip · Emergency · Trusted contacts</div>
        <div class="chips" style="margin-top:14px">
          <div class="chip">📍 Share live trip</div>
          <div class="chip">🛡️ 123 emergency</div>
          <div class="chip">📞 Trusted contact</div>
        </div>
        <div class="cta" style="margin-top:16px">I’m safe</div>
      </div>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const tmpHtml = join(OUT_DIR, '_ipad13_render.html');
  await writeFile(tmpHtml, htmlDocument(), 'utf8');

  const require = createRequire(import.meta.url);
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: CSS_W, height: CSS_H, deviceScaleFactor: SCALE });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 500));

  const manifest = [];
  for (const screen of SCREENS) {
    const el = await page.$(`#${screen.id}`);
    if (!el) throw new Error(`Missing #${screen.id}`);
    const outPath = join(OUT_DIR, screen.file);
    await el.screenshot({ path: outPath, type: 'png' });
    manifest.push(screen);
    console.log(`✓ ${screen.file} (${OUT_W}×${OUT_H}) — ${screen.title}`);
  }
  await browser.close();

  execSync(`cd "${OUT_DIR}" && zip -q -j "${ZIP_NAME}" ${manifest.map((m) => m.file).join(' ')}`, {
    stdio: 'pipe',
  });

  await writeFile(
    join(OUT_DIR, 'README.txt'),
    [
      'NexRyde — App Store Connect screenshots',
      'Display: 13-inch iPad',
      `Size: ${OUT_W} × ${OUT_H} px (portrait)`,
      '',
      'Upload path:',
      '  App Store Connect → your app → Previews and Screenshots',
      '  → iPad → 13-inch iPad displays',
      '',
      'Files:',
      ...manifest.map((m) => `- ${m.file}: ${m.title}`),
      '',
      'Upload at least 1 (Apple requires ≥1). Prefer uploading all 4.',
    ].join('\n'),
    'utf8',
  );

  const gallery = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>iPad 13" screenshots</title>
  <style>body{font-family:system-ui;background:#091830;color:#fff;padding:24px}img{width:280px;border-radius:12px;margin:8px}</style></head>
  <body><h1>13-inch iPad screenshots (${OUT_W}×${OUT_H})</h1>
  ${manifest.map((m) => `<div><img src="${m.file}"/><p>${m.file}</p></div>`).join('')}
  <p><a style="color:#22E180" href="${ZIP_NAME}">Download ZIP</a></p></body></html>`;
  await writeFile(join(OUT_DIR, 'index.html'), gallery, 'utf8');

  const desktopZip = join(homedir(), 'Desktop', 'NexRyde-iPad-13-Screenshots.zip');
  try {
    await copyFile(join(OUT_DIR, ZIP_NAME), desktopZip);
    console.log(`✓ Copied to ${desktopZip}`);
  } catch {
    /* Desktop may be unavailable */
  }

  console.log(`\nDone → ${OUT_DIR}`);
  console.log(`Open → file://${join(OUT_DIR, 'index.html')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
