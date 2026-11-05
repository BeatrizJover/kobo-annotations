// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { listBooks, sortBooks, sortByCreated, type BookSummary } from '../../src/kobo/books';
import { parseKobo } from '../../src/kobo/parse';
import type { Highlight } from '../../src/kobo/types';

let highlights: Highlight[];

beforeAll(async () => {
  const SQL = await initSqlJs();
  const bytes = new Uint8Array(
    readFileSync(new URL('../fixtures/KoboReader.sqlite', import.meta.url)),
  );
  highlights = parseKobo(SQL, bytes).highlights;
});

const book = (id: string, title: string, author: string): BookSummary => ({
  id,
  title,
  author,
  count: 1,
});

describe('listBooks', () => {
  it('returns one entry per VolumeID with its highlight count', () => {
    const books = listBooks(highlights);
    expect(books.map((b) => b.id)).toEqual([...new Set(highlights.map((h) => h.bookId))]);
    for (const b of books) {
      const own = highlights.filter((h) => h.bookId === b.id);
      expect(b).toEqual({
        id: b.id,
        title: own[0]?.book,
        author: own[0]?.author,
        count: own.length,
      });
    }
  });

  it('returns nothing for no highlights', () => {
    expect(listBooks([])).toEqual([]);
  });
});

describe('sortBooks', () => {
  const books = [
    book('c', 'beta', 'Zed'),
    book('a', 'Alpha 10', 'Ann'),
    book('b', 'Alpha 9', 'Ann'),
    book('d', 'Beta', 'Bea'),
  ];

  it('sorts by title, ignoring case and comparing numbers naturally', () => {
    expect(sortBooks(books, 'title-asc').map((b) => b.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(sortBooks(books, 'title-desc').map((b) => b.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('sorts by author, then title', () => {
    expect(sortBooks(books, 'author-asc').map((b) => b.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(sortBooks(books, 'author-desc').map((b) => b.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('breaks full ties by book id and leaves the input untouched', () => {
    const twins = [book('y', 'Same', 'Same'), book('x', 'Same', 'Same')];
    expect(sortBooks(twins, 'title-asc').map((b) => b.id)).toEqual(['x', 'y']);
    expect(twins.map((b) => b.id)).toEqual(['y', 'x']);
  });
});

describe('sortByCreated', () => {
  const dated = (id: string, created: string): Highlight => ({
    ...(highlights[0] as Highlight),
    id,
    created,
  });
  const rows = () => [
    dated('b', '2024-03-02T10:00:00.000Z'),
    dated('none', ''),
    dated('a', '2024-01-05T08:30:00.000Z'),
    dated('c', '2024-03-02T10:00:00.000Z'),
  ];
  const ids = (list: readonly Highlight[]) => list.map((h) => h.id);

  it('sorts oldest first, keeping ties in their order and undated rows last', () => {
    expect(ids(sortByCreated(rows(), 'oldest'))).toEqual(['a', 'b', 'c', 'none']);
  });

  it('sorts newest first, still with undated rows last', () => {
    expect(ids(sortByCreated(rows(), 'newest'))).toEqual(['b', 'c', 'a', 'none']);
  });

  it('leaves the input untouched', () => {
    const input = rows();
    sortByCreated(input, 'newest');
    expect(ids(input)).toEqual(['b', 'none', 'a', 'c']);
  });
});
