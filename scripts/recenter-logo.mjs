import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const inputPath = 'images/center_logo.png';
  const backupPath = 'images/center_logo_original.png';
  const outputPngPath = 'images/center_logo_centered.png';
  const outputWebpPath = 'images/center_logo_centered.webp';

  console.log(`[recenter-logo] Loading ${inputPath}...`);

  // 1. Back up original if not already backed up
  try {
    await fs.access(backupPath);
    console.log(`[recenter-logo] Backup already exists at ${backupPath}`);
  } catch {
    await fs.copyFile(inputPath, backupPath);
    console.log(`[recenter-logo] Backed up original to ${backupPath}`);
  }

  // 2. Load input image and check alpha situation
  const inputImage = sharp(inputPath);
  const metadata = await inputImage.metadata();
  console.log(`[recenter-logo] Dimensions: ${metadata.width}x${metadata.height}, format: ${metadata.format}, channels: ${metadata.channels}`);

  const { data, info } = await inputImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Sample corner pixels
  const getPixel = (x, y) => {
    const idx = (y * width + x) * channels;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  };

  const corners = [
    getPixel(0, 0),
    getPixel(width - 1, 0),
    getPixel(0, height - 1),
    getPixel(width - 1, height - 1)
  ];

  let transparentPixels = 0;
  for (let i = 3; i < data.length; i += channels) {
    if (data[i] <= 8) {
      transparentPixels++;
    }
  }

  const hasRealAlpha = transparentPixels > 100 || corners.some(c => c[3] <= 8);
  const detectedMode = hasRealAlpha ? 'transparent (real alpha)' : 'opaque white/near-white';
  console.log(`[recenter-logo] Alpha scan: ${transparentPixels} / ${width * height} pixels with alpha <= 8`);
  console.log(`[recenter-logo] Detected mode: ${detectedMode}`);

  // 3. Compute tight bounding box and centroid of subject
  let isSubject;
  if (hasRealAlpha) {
    isSubject = (x, y) => {
      const idx = (y * width + x) * channels;
      return data[idx + 3] > 8;
    };
  } else {
    // Reference corner color (average of 4 corners)
    const refR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4);
    const refG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4);
    const refB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4);
    const tolerance = 24;
    isSubject = (x, y) => {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      return (
        Math.abs(r - refR) > tolerance ||
        Math.abs(g - refG) > tolerance ||
        Math.abs(b - refB) > tolerance
      );
    };
  }

  let minX = width, maxX = 0, minY = height, maxY = 0;
  let sumX = 0, sumY = 0, count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isSubject(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  const origBboxCenterX = (minX + maxX) / 2;
  const origBboxCenterY = (minY + maxY) / 2;
  const origCentroidX = sumX / count;
  const origCentroidY = sumY / count;
  const origCanvasCenterX = width / 2;
  const origCanvasCenterY = height / 2;

  console.log(`[recenter-logo] Computed subject bbox: [minX: ${minX}, maxX: ${maxX}, minY: ${minY}, maxY: ${maxY}] (${bboxW}x${bboxH})`);
  console.log(`[recenter-logo] Original canvas center: (${origCanvasCenterX}, ${origCanvasCenterY})`);
  console.log(`[recenter-logo] Original bbox center: (${origBboxCenterX.toFixed(1)}, ${origBboxCenterY.toFixed(1)})`);
  console.log(`[recenter-logo] Original bbox centroid offset: dx = ${(origBboxCenterX - origCanvasCenterX).toFixed(1)}px, dy = ${(origBboxCenterY - origCanvasCenterY).toFixed(1)}px`);
  console.log(`[recenter-logo] Original pixel center-of-mass offset: dx = ${(origCentroidX - origCanvasCenterX).toFixed(2)}px, dy = ${(origCentroidY - origCanvasCenterY).toFixed(2)}px`);

  // 4. Extract subject bbox and composite onto new square transparent canvas
  const newSide = Math.round(Math.max(bboxW, bboxH) * 1.14);
  const left = Math.round((newSide - bboxW) / 2);
  const top = Math.round((newSide - bboxH) / 2);

  console.log(`[recenter-logo] New square canvas size: ${newSide}x${newSide} (factor 1.14)`);
  console.log(`[recenter-logo] Compositing bbox at left: ${left}px, top: ${top}px`);

  const extractedBboxBuffer = await sharp(inputPath)
    .extract({ left: minX, top: minY, width: bboxW, height: bboxH })
    .toBuffer();

  const intermediateCanvas = await sharp({
    create: {
      width: newSide,
      height: newSide,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([{ input: extractedBboxBuffer, left, top }])
  .png()
  .toBuffer();

  // 5. Output 512x512 PNG and WebP
  console.log(`[recenter-logo] Emitting 512x512 PNG: ${outputPngPath}`);
  await sharp(intermediateCanvas)
    .resize(512, 512)
    .png()
    .toFile(outputPngPath);

  console.log(`[recenter-logo] Emitting 512x512 WebP: ${outputWebpPath}`);
  await sharp(intermediateCanvas)
    .resize(512, 512)
    .webp({ quality: 90 })
    .toFile(outputWebpPath);

  // 6. Verify output files by re-running bbox computation
  console.log('\n--- Output Verification ---');
  for (const filePath of [outputPngPath, outputWebpPath]) {
    const outImg = sharp(filePath);
    const { data: outData, info: outInfo } = await outImg.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let oMinX = outInfo.width, oMaxX = 0, oMinY = outInfo.height, oMaxY = 0;
    let oSumX = 0, oSumY = 0, oCount = 0;

    for (let y = 0; y < outInfo.height; y++) {
      for (let x = 0; x < outInfo.width; x++) {
        const idx = (y * outInfo.width + x) * outInfo.channels;
        if (outData[idx + 3] > 8) {
          if (x < oMinX) oMinX = x;
          if (x > oMaxX) oMaxX = x;
          if (y < oMinY) oMinY = y;
          if (y > oMaxY) oMaxY = y;
          oSumX += x;
          oSumY += y;
          oCount++;
        }
      }
    }

    const oBboxW = oMaxX - oMinX + 1;
    const oBboxH = oMaxY - oMinY + 1;
    const oCenterX = (oMinX + oMaxX) / 2;
    const oCenterY = (oMinY + oMaxY) / 2;
    const oCanvasCenterX = outInfo.width / 2;
    const oCanvasCenterY = outInfo.height / 2;
    const dx = oCenterX - oCanvasCenterX;
    const dy = oCenterY - oCanvasCenterY;

    console.log(`[verify] ${path.basename(filePath)}:`);
    console.log(`  Bbox: [minX: ${oMinX}, maxX: ${oMaxX}, minY: ${oMinY}, maxY: ${oMaxY}] (${oBboxW}x${oBboxH})`);
    console.log(`  Canvas size: ${outInfo.width}x${outInfo.height}, center: (${oCanvasCenterX}, ${oCanvasCenterY})`);
    console.log(`  Subject bbox center: (${oCenterX.toFixed(1)}, ${oCenterY.toFixed(1)})`);
    console.log(`  Centroid offset from canvas center: dx = ${dx.toFixed(1)}px, dy = ${dy.toFixed(1)}px`);
    const passed = Math.abs(dx) <= 2 && Math.abs(dy) <= 2;
    console.log(`  Within 2px tolerance: ${passed ? 'PASSED' : 'FAILED'}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
