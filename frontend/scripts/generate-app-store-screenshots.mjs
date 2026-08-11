#!/usr/bin/env node
/**
 * Generate on-brand NexRyde App Store screenshots (1290×2796 — iPhone 6.7").
 * Produces PNGs, a ZIP bundle, and a gallery page with download links.
 *
 * Usage: npm run screenshots:ios
 * Output: build-output/app-store-screenshots/
 */
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'build-output', 'app-store-screenshots');
const ASSETS_DIR = join(__dirname, 'app-store-screenshots');
const ZIP_NAME = 'nexryde-app-store-screenshots.zip';

const MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY;

if (!MAPS_KEY) {
  throw new Error('Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY before generating screenshots.');
}

const W = 430;
const H = 932;
const SCALE = 3; // 1290 × 2796

const LAGOS = { lat: 6.4281, lng: 3.4219 };

function staticMapUrl(lat, lng, zoom = 15) {
  const size = '640x1280';
  const style = [
    'element:geometry|color:0x0d1420',
    'element:labels.text.fill|color:0x8ec3b9',
    'element:labels.text.stroke|color:0x0d1420',
    'feature:road|element:geometry|color:0x1a2332',
    'feature:water|element:geometry|color:0x0a1628',
  ]
    .map((s) => `&style=${encodeURIComponent(s)}`)
    .join('');
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${size}&scale=2&maptype=roadmap${style}&key=${MAPS_KEY}`;
}

const SCREENS = [
  { id: 'screen-1', file: '01-rider-home.png', title: 'Rider home', category: 'Rider' },
  { id: 'screen-2', file: '02-finding-driver.png', title: 'Finding driver', category: 'Rider', mapSlot: 2, lat: LAGOS.lat + 0.008, lng: LAGOS.lng, zoom: 14 },
  { id: 'screen-5', file: '03-live-tracking.png', title: 'Live tracking', category: 'Rider', mapSlot: 5, lat: LAGOS.lat - 0.004, lng: LAGOS.lng + 0.012, zoom: 15 },
  { id: 'screen-7', file: '05-rider-safety.png', title: 'Safety center', category: 'Rider' },
  { id: 'screen-4', file: '06-driver-home.png', title: 'Driver home', category: 'Driver', mapSlot: 4, lat: LAGOS.lat, lng: LAGOS.lng, zoom: 15 },
  { id: 'screen-8', file: '07-driver-ride-offer.png', title: 'Ride offer', category: 'Driver', mapSlot: 8, lat: LAGOS.lat + 0.006, lng: LAGOS.lng - 0.008, zoom: 14 },
  { id: 'screen-3', file: '08-driver-community.png', title: 'Driver community', category: 'Driver' },
];

async function loadPuppeteer() {
  const require = createRequire(import.meta.url);
  return require('puppeteer');
}

const CHROME_PATH =
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined;

function buildGalleryHtml(manifest) {
  const cards = manifest
    .map(
      (m) => `
    <article class="card">
      <img src="${m.file}" alt="${m.title}" loading="lazy" />
      <div class="card-body">
        <span class="badge">${m.category}</span>
        <h2>${m.title}</h2>
        <p>${m.file} · 1290×2796</p>
        <a class="btn" href="${m.file}" download="${m.file}">Download PNG</a>
      </div>
    </article>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NexRyde App Store Screenshots</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      background: #091830; color: #f8fafc; min-height: 100vh; padding: 32px 20px 48px;
    }
    .wrap { max-width: 1200px; margin: 0 auto; }
    header { text-align: center; margin-bottom: 32px; }
    h1 { font-size: 32px; font-weight: 900; letter-spacing: -0.5px; }
    .sub { color: #9aafc8; margin-top: 8px; font-size: 15px; }
    .actions {
      display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin: 24px 0 36px;
    }
    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 14px 24px; border-radius: 14px; text-decoration: none;
      background: linear-gradient(135deg, #00e870, #00d084);
      color: #091830; font-size: 16px; font-weight: 900;
    }
    .btn-secondary {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 14px 24px; border-radius: 14px; text-decoration: none;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
      color: #f8fafc; font-size: 15px; font-weight: 700;
    }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px;
    }
    .card {
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px; overflow: hidden;
    }
    .card img { width: 100%; display: block; background: #030b1a; }
    .card-body { padding: 16px; }
    .badge {
      display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800;
      background: rgba(0,208,132,0.15); color: #3bf0ae; margin-bottom: 8px;
    }
    .card h2 { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
    .card p { font-size: 12px; color: #9aafc8; margin-bottom: 12px; }
    .btn {
      display: inline-block; padding: 8px 14px; border-radius: 10px; text-decoration: none;
      background: rgba(255,255,255,0.08); color: #f8fafc; font-size: 13px; font-weight: 700;
    }
    footer { text-align: center; margin-top: 40px; color: #64748b; font-size: 13px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>NexRyde App Store Screenshots</h1>
      <p class="sub">${manifest.length} screens · 1290×2796 px · iPhone 6.7" display</p>
      <div class="actions">
        <a class="btn-primary" href="${ZIP_NAME}" download="${ZIP_NAME}">⬇ Download all (${manifest.length} PNGs)</a>
        <a class="btn-secondary" href="README.txt">View README</a>
      </div>
    </header>
    <div class="grid">${cards}</div>
    <footer>Upload to App Store Connect → Previews and Screenshots → 6.7" Display</footer>
  </div>
</body>
</html>`;
}

async function createZip(manifest) {
  const zipPath = join(OUT_DIR, ZIP_NAME);
  const files = manifest.map((m) => m.file).join(' ');
  execSync(`cd "${OUT_DIR}" && zip -q -j "${ZIP_NAME}" ${files}`, { stdio: 'pipe' });
  return zipPath;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let html = await readFile(join(ASSETS_DIR, 'screens.html'), 'utf8');
  const css = await readFile(join(ASSETS_DIR, 'styles.css'), 'utf8');
  html = html.replace(
    '<link rel="stylesheet" href="styles.css" />',
    `<style>${css}</style>`,
  );

  for (const screen of SCREENS) {
    if (screen.mapSlot != null) {
      const url = staticMapUrl(screen.lat, screen.lng, screen.zoom);
      html = html.replace(`MAP_URL_${screen.mapSlot}`, url);
    }
  }

  const tmpHtml = join(OUT_DIR, '_render.html');
  await writeFile(tmpHtml, html, 'utf8');

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle0', timeout: 120000 });

  await new Promise((r) => setTimeout(r, 3000));

  const manifest = [];

  for (const screen of SCREENS) {
    const el = await page.$(`#${screen.id}`);
    if (!el) {
      console.warn(`Missing #${screen.id}`);
      continue;
    }
    const outPath = join(OUT_DIR, screen.file);
    await el.screenshot({ path: outPath, type: 'png' });
    manifest.push({ ...screen, path: outPath });
    console.log(`✓ ${screen.file} (${W * SCALE}×${H * SCALE}) — ${screen.title}`);
  }

  await browser.close();

  const zipPath = await createZip(manifest);
  console.log(`✓ ${ZIP_NAME} (${manifest.length} files)`);

  const galleryPath = join(OUT_DIR, 'index.html');
  await writeFile(galleryPath, buildGalleryHtml(manifest), 'utf8');
  console.log(`✓ index.html (gallery + download page)`);

  await writeFile(
    join(OUT_DIR, 'README.txt'),
    [
      'NexRyde iOS App Store Screenshots (on-brand)',
      'Size: 1290 × 2796 px (iPhone 6.7" display)',
      '',
      'Download all:',
      `  • Open index.html in your browser → "Download all"`,
      `  • Or use ${ZIP_NAME}`,
      '',
      'Screens:',
      ...manifest.map((m) => `- ${m.file}: ${m.title} (${m.category})`),
      '',
      'Upload to App Store Connect → Previews and Screenshots → 6.7" Display',
      '',
      'IMPORTANT — Guideline 2.3.10:',
      '  • Use ONLY these PNGs (native iOS status bar with Dynamic Island).',
      '  • Do NOT upload Android emulator screenshots or Play Store assets.',
      '  • In Media Manager, replace ALL sizes that show old screenshots (including iPad).',
      '  • For iPad Air 11" slot: use the same iPhone 6.7" PNGs if no dedicated iPad UI.',
    ].join('\n'),
    'utf8',
  );

  const desktopZip = join(homedir(), 'Desktop', 'NexRyde-App-Store-Screenshots.zip');
  try {
    await copyFile(zipPath, desktopZip);
    console.log(`✓ Copied to Desktop/NexRyde-App-Store-Screenshots.zip`);
  } catch {
    // Desktop may not exist in CI
  }

  console.log(`\nDone → ${OUT_DIR}`);
  console.log(`Gallery → file://${galleryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
