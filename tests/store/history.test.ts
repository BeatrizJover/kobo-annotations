// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseKobo } from '../../src/kobo/parse';
import type { KoboLibrary } from '../../src/kobo/types';
import { mergeImport } from '../../src/store/merge';
import {
  bookHistory,
  isNew,
  isOffDevice,
  isSavedLibrary,
  newImportId,
} from '../../src/store/history';
import type { ImportRecord, SavedLibrary } from '../../src/store/types';

let library: KoboLibrary;

beforeAll(async () => {
  const SQL = await initSqlJs();
  const bytes = new Uint8Array(
    readFileSync(new URL('../fixtures/KoboReader.sqlite', import.meta.url)),
  );
  library = parseKobo(SQL, bytes);
});

const record = (id: number): ImportRecord => ({
  id,
  at: '2026-01-01T00:00:00.000Z',
  hasColor: true,
  total: 0,
  added: 0,
  removed: 0,
});

/** Saves `uploads` in order, the way the store merges them. */
function history(...uploads: KoboLibrary[]): SavedLibrary {
  let highlights: SavedLibrary['highlights'] = [];
  uploads.forEach((upload, index) => {
    highlights = mergeImport(highlights, upload.highlights, index + 1).highlights;
  });
  return { highlights, hasColor: true, imports: uploads.map((_, index) => record(index + 1)) };
}

const books = () => [...new Set(library.highlights.map((h) => h.bookId))];
const without = (bookId: string | undefined): KoboLibrary => ({
  ...library,
  highlights: library.highlights.filter((h) => h.bookId !== bookId),
});

describe('history', () => {
  it('tells saved libraries apart from a plain upload', () => {
    expect(isSavedLibrary(library)).toBe(false);
    expect(isSavedLibrary(history(library))).toBe(true);
  });

  it('marks nothing new on a plain upload or the first saved one', () => {
    expect(newImportId(library)).toBeNull();
    const first = history(library);
    expect(newImportId(first)).toBeNull();
    expect(first.highlights.some((h) => isNew(h, newImportId(first)))).toBe(false);
    expect(library.highlights.some(isOffDevice)).toBe(false);
  });

  it('marks what the newest upload added and what left the device', () => {
    const [added, gone] = books();
    const later = history(without(added), without(gone));
    const importId = newImportId(later);
    expect(importId).toBe(2);

    const fresh = later.highlights.filter((h) => isNew(h, importId));
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((h) => h.bookId === added)).toBe(true);
    const off = later.highlights.filter(isOffDevice);
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((h) => h.bookId === gone)).toBe(true);

    const perBook = bookHistory(later);
    expect(perBook.get(added ?? '')).toEqual({ added: fresh.length, offDevice: false });
    expect(perBook.get(gone ?? '')).toEqual({ added: 0, offDevice: true });
    for (const id of books().slice(2)) {
      expect(perBook.get(id)).toEqual({ added: 0, offDevice: false });
    }
  });

  it('reports no history for a plain upload', () => {
    for (const entry of bookHistory(library).values()) {
      expect(entry).toEqual({ added: 0, offDevice: false });
    }
  });
});
