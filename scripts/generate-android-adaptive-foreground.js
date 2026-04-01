/**
 * Builds a padded Android adaptive-icon foreground from nrep-logo.png.
 * Google Material: keep key artwork inside ~66% of the canvas; we use ~46% so the glyph reads like other apps (more outer padding).
 * Does not modify the source logo used in-app — only writes nrep-android-adaptive-foreground.png.
 */
const path = require('path');
const sharp = require('sharp');

const CANVAS = 1024;
/** Max width/height of the logo inside the square (rest is padding / safe zone). */
const LOGO_MAX = Math.round(CANVAS * 0.46);

async function main() {
  const root = path.join(__dirname, '..');
  const input = path.join(root, 'assets', 'images', 'nrep-logo.png');
  const output = path.join(root, 'assets', 'images', 'nrep-android-adaptive-foreground.png');

  const resized = await sharp(input)
    .resize({
      width: LOGO_MAX,
      height: LOGO_MAX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .toBuffer();

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toFile(output);

  console.log('Wrote', output);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
