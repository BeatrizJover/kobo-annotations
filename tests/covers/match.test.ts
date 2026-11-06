// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCovers } from '../../scripts/make-fixture';
import { imageType, matchCovers, parseCoverName, readCovers } from '../../src/covers/match';
import { parseKobo } from '../../src/kobo/parse';
import type { KoboLibrary } from '../../src/kobo/types';

const STORE_ID = '0b7e4c2a-5d1f-4e8a-9c3b-6a2d8f1e0c47';

let library: KoboLibrary;

beforeAll(async () => {
  const SQL = await initSqlJs();
  library = parseKobo(
    SQL,
    new Uint8Array(readFileSync(new URL('../fixtures/KoboReader.sqlite', import.meta.url))),
  );
});

const coverFiles = () =>
  [...buildCovers()].map(([path, bytes]) => new File([bytes], path.split('/').at(-1) ?? path));

const bookIdOf = (author: string) => {
  const found = library.highlights.find((h) => h.author === author);
  if (!found) throw new Error(`No book by ${author}`);
  return found.bookId;
};

describe('parseCoverName', () => {
  it('splits a Kobo cover file name', () => {
    expect(parseCoverName('file____mnt_onboard_A_b_kepub_epub - N3_LIBRARY_GRID.parsed')).toEqual({
      imageId: 'file____mnt_onboard_A_b_kepub_epub',
      size: 'N3_LIBRARY_GRID',
    });
    expect(parseCoverName(`${STORE_ID} - N3_FULL.parsed`)).toEqual({
      imageId: STORE_ID,
      size: 'N3_FULL',
    });
  });

  it('ignores other files and unknown sizes', () => {
    expect(parseCoverName('notes.txt')).toBeNull();
    expect(parseCoverName(`${STORE_ID} - N3_FULL.jpg`)).toBeNull();
    expect(parseCoverName(`${STORE_ID} - N3_UNKNOWN.parsed`)).toBeNull();
    expect(parseCoverName(' - N3_FULL.parsed')).toBeNull();
  });
});

describe('matchCovers', () => {
  it('lists the files of each book, preferred size first, and skips the rest', () => {
    const matched = matchCovers(coverFiles(), library.highlights);
    const names = (author: string) =>
      matched.get(bookIdOf(author))?.map((f) => f.name.split(' - ')[1]);
    expect(names('Ada Quill')).toEqual([
      'N3_LIBRARY_FULL.parsed',
      'N3_LIBRARY_GRID.parsed',
      'N3_FULL.parsed',
    ]);
    expect(names('Bo Lantern, Cy Marsh')).toEqual(['N3_LIBRARY_GRID.parsed']);
    expect(names('Eva Rumbo')).toEqual(['N3_LIBRARY_FULL.parsed']);
    expect(matched.has(bookIdOf('Dee Harrow'))).toBe(false);
    // The removed book and notes.txt match nothing; the deduplicated copy has no highlights.
    expect(matched.size).toBe(4);
  });

  it('matches nothing for highlights saved without an ImageId', () => {
    // Highlights saved before covers existed lack the field at runtime.
    const legacy = library.highlights.map((h) => ({
      ...h,
      imageId: undefined as unknown as string,
    }));
    expect(matchCovers(coverFiles(), legacy).size).toBe(0);
  });
});

describe('imageType', () => {
  it('recognises JPEG and PNG signatures only', () => {
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(imageType(new TextEncoder().encode('not an image'))).toBeNull();
    expect(imageType(new Uint8Array())).toBeNull();
  });
});

describe('readCovers', () => {
  it('reads one JPEG per book, falling back past a file that is not an image', async () => {
    const covers = await readCovers(coverFiles(), library.highlights);
    expect(new Set(covers.keys())).toEqual(
      new Set(['Ada Quill', 'Bo Lantern, Cy Marsh', 'Eva Rumbo', 'مؤلف مجهول'].map(bookIdOf)),
    );
    for (const blob of covers.values()) {
      expect(blob.type).toBe('image/jpeg');
      expect(imageType(new Uint8Array(await blob.arrayBuffer()))).toBe('image/jpeg');
    }
  });

  it('skips files that cannot be read', async () => {
    const broken = coverFiles().map((file) =>
      Object.assign(file, { arrayBuffer: () => Promise.reject(new Error('gone')) }),
    );
    expect((await readCovers(broken, library.highlights)).size).toBe(0);
  });
});
