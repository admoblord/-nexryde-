const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// NEXRYDE Brand Colors
const DARK_NAVY = '#0D1420';
const GREEN = '#3AD173';
const GREEN_LIGHT = '#80EE50';
const BLUE = '#3A8CD1';
const WHITE = '#FFFFFF';

// Create SVG for NEXRYDE icon - Modern "N" with road/journey motif
const createIconSVG = (size) => {
  const padding = size * 0.1;
  const innerSize = size - (padding * 2);
  
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background with gradient -->
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${DARK_NAVY};stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0A0F18;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="greenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${GREEN_LIGHT};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${GREEN};stop-opacity:1" />
    </linearGradient>
    <linearGradient id="blueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${BLUE};stop-opacity:1" />
      <stop offset="50%" style="stop-color:#2A6CA1;stop-opacity:1" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${size * 0.02}" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bgGrad)"/>
  
  <!-- Subtle glow effect -->
  <circle cx="${size * 0.35}" cy="${size * 0.3}" r="${size * 0.25}" fill="${GREEN}" opacity="0.08"/>
  <circle cx="${size * 0.65}" cy="${size * 0.7}" r="${size * 0.2}" fill="${BLUE}" opacity="0.08"/>
  
  <!-- Letter N - Left vertical bar (Green) -->
  <rect 
    x="${size * 0.18}" 
    y="${size * 0.2}" 
    width="${size * 0.16}" 
    height="${size * 0.6}" 
    rx="${size * 0.04}"
    fill="url(#greenGrad)"
    filter="url(#glow)"
  />
  
  <!-- Letter N - Right vertical bar (Blue) -->
  <rect 
    x="${size * 0.66}" 
    y="${size * 0.2}" 
    width="${size * 0.16}" 
    height="${size * 0.6}" 
    rx="${size * 0.04}"
    fill="url(#blueGrad)"
    filter="url(#glow)"
  />
  
  <!-- Letter N - Diagonal connector -->
  <polygon 
    points="${size * 0.26},${size * 0.2} ${size * 0.34},${size * 0.2} ${size * 0.74},${size * 0.8} ${size * 0.66},${size * 0.8}"
    fill="url(#greenGrad)"
    filter="url(#glow)"
  />
  
  <!-- Road marking effect (center dashes) -->
  <rect x="${size * 0.47}" y="${size * 0.38}" width="${size * 0.06}" height="${size * 0.08}" rx="${size * 0.01}" fill="${WHITE}" opacity="0.9"/>
  <rect x="${size * 0.47}" y="${size * 0.54}" width="${size * 0.06}" height="${size * 0.08}" rx="${size * 0.01}" fill="${WHITE}" opacity="0.9"/>
</svg>`;
};

// Create adaptive icon SVG (just the foreground)
const createAdaptiveIconSVG = (size) => {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="greenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${GREEN_LIGHT};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${GREEN};stop-opacity:1" />
    </linearGradient>
    <linearGradient id="blueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${BLUE};stop-opacity:1" />
      <stop offset="50%" style="stop-color:#2A6CA1;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Letter N - Left vertical bar (Green) -->
  <rect 
    x="${size * 0.22}" 
    y="${size * 0.25}" 
    width="${size * 0.14}" 
    height="${size * 0.5}" 
    rx="${size * 0.03}"
    fill="url(#greenGrad)"
  />
  
  <!-- Letter N - Right vertical bar (Blue) -->
  <rect 
    x="${size * 0.64}" 
    y="${size * 0.25}" 
    width="${size * 0.14}" 
    height="${size * 0.5}" 
    rx="${size * 0.03}"
    fill="url(#blueGrad)"
  />
  
  <!-- Letter N - Diagonal connector -->
  <polygon 
    points="${size * 0.29},${size * 0.25} ${size * 0.36},${size * 0.25} ${size * 0.71},${size * 0.75} ${size * 0.64},${size * 0.75}"
    fill="url(#greenGrad)"
  />
  
  <!-- Road marking effect -->
  <rect x="${size * 0.46}" y="${size * 0.4}" width="${size * 0.08}" height="${size * 0.07}" rx="${size * 0.015}" fill="${WHITE}"/>
  <rect x="${size * 0.46}" y="${size * 0.53}" width="${size * 0.08}" height="${size * 0.07}" rx="${size * 0.015}" fill="${WHITE}"/>
</svg>`;
};

// Create splash icon SVG
const createSplashIconSVG = (size) => {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="greenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${GREEN_LIGHT};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${GREEN};stop-opacity:1" />
    </linearGradient>
    <linearGradient id="blueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${BLUE};stop-opacity:1" />
      <stop offset="50%" style="stop-color:#2A6CA1;stop-opacity:1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Letter N - Left vertical bar -->
  <rect x="${size * 0.2}" y="${size * 0.15}" width="${size * 0.18}" height="${size * 0.7}" rx="${size * 0.04}" fill="url(#greenGrad)" filter="url(#glow)"/>
  
  <!-- Letter N - Right vertical bar -->
  <rect x="${size * 0.62}" y="${size * 0.15}" width="${size * 0.18}" height="${size * 0.7}" rx="${size * 0.04}" fill="url(#blueGrad)" filter="url(#glow)"/>
  
  <!-- Letter N - Diagonal -->
  <polygon points="${size * 0.29},${size * 0.15} ${size * 0.38},${size * 0.15} ${size * 0.71},${size * 0.85} ${size * 0.62},${size * 0.85}" fill="url(#greenGrad)" filter="url(#glow)"/>
  
  <!-- Road markings -->
  <rect x="${size * 0.44}" y="${size * 0.35}" width="${size * 0.12}" height="${size * 0.1}" rx="${size * 0.02}" fill="${WHITE}"/>
  <rect x="${size * 0.44}" y="${size * 0.55}" width="${size * 0.12}" height="${size * 0.1}" rx="${size * 0.02}" fill="${WHITE}"/>
</svg>`;
};

async function generateIcons() {
  const assetsDir = path.join(__dirname, 'assets', 'images');
  
  console.log('🎨 Generating NEXRYDE professional app icons...\n');
  
  // Generate main icon (1024x1024)
  console.log('📱 Creating main icon (1024x1024)...');
  const iconSvg = createIconSVG(1024);
  await sharp(Buffer.from(iconSvg))
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('   ✅ icon.png created\n');
  
  // Generate adaptive icon foreground (1024x1024)
  console.log('🤖 Creating Android adaptive icon (1024x1024)...');
  const adaptiveSvg = createAdaptiveIconSVG(1024);
  await sharp(Buffer.from(adaptiveSvg))
    .png()
    .toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('   ✅ adaptive-icon.png created\n');
  
  // Generate favicon (196x196)
  console.log('🌐 Creating favicon (196x196)...');
  const faviconSvg = createIconSVG(196);
  await sharp(Buffer.from(faviconSvg))
    .png()
    .toFile(path.join(assetsDir, 'favicon.png'));
  console.log('   ✅ favicon.png created\n');
  
  // Generate splash icon (200x200)
  console.log('💫 Creating splash icon (200x200)...');
  const splashSvg = createSplashIconSVG(200);
  await sharp(Buffer.from(splashSvg))
    .png()
    .toFile(path.join(assetsDir, 'splash-icon.png'));
  console.log('   ✅ splash-icon.png created\n');
  
  console.log('🎉 All NEXRYDE icons generated successfully!');
  console.log('\n📁 Icons saved to:', assetsDir);
}

generateIcons().catch(console.error);
