// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseKobo } from '../../src/kobo/parse';
import type { Highlight } from '../../src/kobo/types';
import { mergeImport } from '../../src/store/merge';

let highlights: Highlight[];

beforeAll(async () => {
  const SQL = await initSqlJs();
  const bytes = new Uint8Array(
    readFileSync(new URL('../fixtures/KoboReader.sqlite', import.meta.url)),
  );
  highlights = parseKobo(SQL, bytes).highlights;
});

const ids = (list: readonly { id: string }[]) => list.map((h) => h.id);

describe('mergeImport', () => {
  it('saves a first upload as new and on the device', () => {
    const result = mergeImport([], highlights, 1);
    expect(result).toMatchObject({ added: highlights.length, removed: 0 });
    expect(ids(result.highlights)).toEqual(ids(highlights));
    expect(
      result.highlights.every((h) => h.firstSeen === 1 && h.lastSeen === 1 && h.onDevice),
    ).toBe(true);
  });

  it('keeps highlights missing from a later upload, marked as off the device', () => {
    const first = mergeImport([], highlights, 1).highlights;
    const gone = highlights[0]?.bookId;
    const rest = highlights.filter((h) => h.bookId !== gone);
    const result = mergeImport(first, rest, 2);

    const removed = highlights.length - rest.length;
    expect(removed).toBeGreaterThan(0);
    expect(result).toMatchObject({ added: 0, removed });
    expect(ids(result.highlights)).toEqual(ids(highlights));
    for (const h of result.highlights) {
      const kept = h.bookId !== gone;
      expect(h).toMatchObject({ onDevice: kept, firstSeen: 1, lastSeen: kept ? 2 : 1 });
    }
  });

  it('counts a highlight as removed only once', () => {
    const first = mergeImport([], highlights, 1).highlights;
    const second = mergeImport(first, highlights.slice(1), 2).highlights;
    const third = mergeImport(second, highlights.slice(1), 3);
    expect(third.removed).toBe(0);
    expect(third.highlights.filter((h) => !h.onDevice)).toHaveLength(1);
  });

  it('lets the upload win for highlights it contains', () => {
    const first = mergeImport([], highlights, 1).highlights;
    const [edited, ...others] = highlights;
    if (!edited) throw new Error('empty fixture');
    const changed: Highlight = { ...edited, note: 'Edited note', color: 'green' };
    const result = mergeImport(first, [changed, ...others], 2);
    expect(result.highlights.find((h) => h.id === edited.id)).toMatchObject({
      note: 'Edited note',
      color: 'green',
      firstSeen: 1,
      lastSeen: 2,
    });
  });

  it('brings back a highlight that returns to the device and marks new ones', () => {
    const first = mergeImport([], highlights.slice(1), 1).highlights;
    const second = mergeImport(first, highlights.slice(2), 2).highlights;
    const third = mergeImport(second, highlights, 3);
    expect(third).toMatchObject({ added: 1, removed: 0 });
    const [newest, returned] = highlights;
    expect(third.highlights.find((h) => h.id === newest?.id)).toMatchObject({ firstSeen: 3 });
    expect(third.highlights.find((h) => h.id === returned?.id)).toMatchObject({
      firstSeen: 1,
      lastSeen: 3,
      onDevice: true,
    });
  });

  it('does not change the saved highlights it receives', () => {
    const first = mergeImport([], highlights, 1).highlights;
    const snapshot = structuredClone(first);
    mergeImport(first, [], 2);
    expect(first).toEqual(snapshot);
  });
});
