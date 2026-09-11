/**
 * images/transparent_logo.png ships with a 12px opaque near-white bar across
 * the full width of row 0-11. On the yellow page it renders as a stray light
 * rule floating above the lockup. This crops the bar, trims the remaining
 * transparent margin, and re-exports a clean asset.
 *
 * Run: node scripts/clean-logo.mjs
 */
import sharp from 'sharp';

const SRC = 'images/transparent_logo.png';
const OUT_PNG = 'images/transparent_logo_clean.png';
const OUT_WEBP = 'images/transparent_logo_clean.webp';

/** Rows/cols whose pixels are all effectively transparent are droppable. */
async function alphaBBox(file) {
    const { data, info } = await sharp(file).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: c } = info;
    let minX = w, maxX = -1, minY = h, maxY = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * c + 3] > 8) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    return { w, h, minX, maxX, minY, maxY };
}

/** Detect a full-width opaque light band starting at row 0. */
async function topBandHeight(file) {
    const { data, info } = await sharp(file).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: c } = info;
    let band = 0;
    for (let y = 0; y < h; y++) {
        let opaque = 0, light = 0;
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * c;
            if (data[i + 3] > 8) {
                opaque++;
                if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 190) light++;
            }
        }
        // Any leading run of FULL-WIDTH opaque rows is the artefact bar:
        // real lettering always leaves transparent gaps between glyphs, so a
        // row covering all 1400 columns can only be the bar (including its
        // darker antialiased tail rows).
        if (opaque === w) band = y + 1; else break;
    }
    return band;
}

const before = await alphaBBox(SRC);
const band = await topBandHeight(SRC);
console.log('source        :', `${before.w}x${before.h}`);
console.log('stray top band:', band, 'rows');

const top = band;
const meta = await sharp(SRC).metadata();
const extracted = await sharp(SRC)
    .extract({ left: 0, top, width: meta.width, height: meta.height - top })
    .png()
    .toBuffer();
// Crop tight to the real artwork so the rendered box contains no dead
// transparent padding — otherwise the CSS width scales empty space.
const bb = await alphaBBox(extracted);
const cropped = await sharp(extracted)
    .extract({ left: bb.minX, top: bb.minY, width: bb.maxX - bb.minX + 1, height: bb.maxY - bb.minY + 1 })
    .png()
    .toBuffer();

await sharp(cropped).png({ compressionLevel: 9 }).toFile(OUT_PNG);
await sharp(cropped).webp({ quality: 92 }).toFile(OUT_WEBP);

const after = await alphaBBox(OUT_PNG);
const outBand = await topBandHeight(OUT_PNG);
console.log('output        :', `${after.w}x${after.h}`);
console.log('bbox in output:', `x ${after.minX}-${after.maxX}, y ${after.minY}-${after.maxY}`);
console.log('stray band now:', outBand, 'rows');
console.log('wrote', OUT_PNG, 'and', OUT_WEBP);
