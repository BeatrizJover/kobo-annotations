// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildIcon, VARIANTS } from '../scripts/make-icons.ts';

const read = (file: string) => readFileSync(`public/icons/${file}`);

// Compares decoded scanlines, so a different zlib build in Node can't fail the check.
function pixels(png: Buffer): Buffer {
  const data: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      data.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(data));
}

describe('app icons', () => {
  it.each(VARIANTS)('$file matches the generator output', (variant) => {
    expect(pixels(buildIcon(variant)).equals(pixels(read(variant.file)))).toBe(true);
  });

  it.each(VARIANTS)('$file is a $size px square PNG', ({ file, size }) => {
    const png = read(file);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
  });
});
