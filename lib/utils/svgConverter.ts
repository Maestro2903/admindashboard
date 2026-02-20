/**
 * Server-side SVG to PNG converter.
 * Requires sharp. Falls back to placeholder if sharp is not available.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

async function convertWithSharp(svgPath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp');

  const svgBuffer = fs.readFileSync(path.join(process.cwd(), 'public', svgPath));
  const size = 200;
  const circleRadius = size / 2;

  const circleSvg = `
    <svg width="${size}" height="${size}">
      <circle cx="${circleRadius}" cy="${circleRadius}" r="${circleRadius}" fill="#1a1a1a"/>
    </svg>
  `;

  const logoPng = await sharp(svgBuffer)
    .resize(Math.floor(size * 0.625), Math.floor(size * 0.625))
    .png()
    .toBuffer();

  const circlePng = await sharp(Buffer.from(circleSvg))
    .resize(size, size)
    .png()
    .toBuffer();

  const compositePng = await sharp(circlePng)
    .composite([
      {
        input: logoPng,
        top: Math.floor(size * 0.1875),
        left: Math.floor(size * 0.1875),
      },
    ])
    .png()
    .toBuffer();

  const base64 = compositePng.toString('base64');
  return `data:image/png;base64,${base64}`;
}

/** Minimal 35x35 dark circle PNG as placeholder when sharp is unavailable */
const FALLBACK_LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAjCAYAAAAe2bNZAAAAGklEQVR42u3OMQEAAAjDMMC/52ECvlDI01lVYAcDf8jhMgAAAABJRU5ErkJggg==';

export async function convertSvgToBase64Png(svgPath: string): Promise<string> {
  try {
    return await convertWithSharp(svgPath);
  } catch {
    return FALLBACK_LOGO;
  }
}
