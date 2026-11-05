// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildIcon, VARIANTS } from '../scripts/make-icons.ts';

describe('app icons', () => {
  it.each(VARIANTS)('$file regenerates byte-identically', (variant) => {
    expect(buildIcon(variant)).toEqual(readFileSync(`public/icons/${variant.file}`));
  });

  it.each(VARIANTS)('$file is a $size px square PNG', ({ file, size }) => {
    const png = readFileSync(`public/icons/${file}`);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
  });
});
