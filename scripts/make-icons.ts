/// <reference types="node" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { themeColor } from './theme-tokens.ts';

type Rgb = [number, number, number];

interface Shape {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radius: number;
  color: Rgb;
}

interface Variant {
  file: string;
  size: number;
  fullBleed: boolean;
  /** Shrinks the artwork around the centre; maskable icons are cropped to an 80 % circle. */
  scale: number;
}

export const VARIANTS: Variant[] = [
  { file: 'favicon-32.png', size: 32, fullBleed: false, scale: 1 },
  { file: 'apple-touch-icon.png', size: 180, fullBleed: true, scale: 1 },
  { file: 'icon-192.png', size: 192, fullBleed: false, scale: 1 },
  { file: 'icon-512.png', size: 512, fullBleed: false, scale: 1 },
  { file: 'icon-512-maskable.png', size: 512, fullBleed: true, scale: 0.8 },
];

const SUPERSAMPLING = 4;

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

// A page of text with one line highlighted, in unit coordinates.
function artwork({ fullBleed, scale }: Variant): Shape[] {
  const brand = rgb(themeColor('color-primary'));
  const page = rgb(themeColor('color-surface'));
  const ink = rgb(themeColor('color-ink-soft'));
  const highlight = rgb(themeColor('color-highlight-yellow'));
  const s = (v: number) => 0.5 + (v - 0.5) * scale;
  const shape = (x0: number, y0: number, x1: number, y1: number, r: number, color: Rgb) => ({
    x0: s(x0),
    y0: s(y0),
    x1: s(x1),
    y1: s(y1),
    radius: r * scale,
    color,
  });
  const line = (y: number, x1 = 0.67) => shape(0.33, y - 0.025, x1, y + 0.025, 0.025, ink);
  return [
    { x0: 0, y0: 0, x1: 1, y1: 1, radius: fullBleed ? 0 : 0.18, color: brand },
    shape(0.24, 0.16, 0.76, 0.84, 0.05, page),
    shape(0.3, 0.405, 0.7, 0.505, 0.02, highlight),
    line(0.31),
    line(0.455),
    line(0.6),
    line(0.745, 0.55),
  ];
}

function contains({ x0, y0, x1, y1, radius }: Shape, x: number, y: number): boolean {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
  const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function rasterize(variant: Variant): Buffer {
  const { size } = variant;
  const shapes = artwork(variant).reverse();
  const pixels = Buffer.alloc(size * size * 4);
  const samples = SUPERSAMPLING * SUPERSAMPLING;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Colour averages covered samples only, so transparent ones don't darken anti-aliased edges.
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLING; sy++) {
        for (let sx = 0; sx < SUPERSAMPLING; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLING) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLING) / size;
          const hit = shapes.find((shape) => contains(shape, x, y));
          if (!hit) continue;
          r += hit.color[0];
          g += hit.color[1];
          b += hit.color[2];
          covered++;
        }
      }
      const offset = (py * size + px) * 4;
      if (covered === 0) continue;
      pixels[offset] = Math.round(r / covered);
      pixels[offset + 1] = Math.round(g / covered);
      pixels[offset + 2] = Math.round(b / covered);
      pixels[offset + 3] = Math.round((covered / samples) * 255);
    }
  }
  return pixels;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes RGBA pixels as an 8-bit truecolour-with-alpha PNG. */
function encodePng(size: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = size * 4;
  const scanlines = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    rgba.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const buildIcon = (variant: Variant): Buffer => encodePng(variant.size, rasterize(variant));

if (process.argv[1] === import.meta.filename) {
  const dir = new URL('../public/icons/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const variant of VARIANTS) {
    writeFileSync(new URL(variant.file, dir), buildIcon(variant));
  }
}
