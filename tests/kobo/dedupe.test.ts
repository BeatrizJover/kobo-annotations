import { describe, expect, it } from 'vitest';
import { dedupeBooks } from '../../src/kobo/dedupe';
import type { Highlight } from '../../src/kobo/types';

const STORE = '11111111-2222-4333-8444-555555555555';
const SIDELOAD_A = 'file:///mnt/onboard/a.kepub.epub';
const SIDELOAD_B = 'file:///mnt/onboard/b.kepub.epub';

let next = 0;
const make = (bookId: string, text: string, overrides: Partial<Highlight> = {}): Highlight => ({
  id: String(next++),
  bookId,
  book: 'Same Book',
  author: 'Same Author',
  chapter: '',
  chapterIndex: 0,
  progress: 0,
  type: 'highlight',
  text,
  note: '',
  color: 'yellow',
  created: '',
  ...overrides,
});

const bookIds = (highlights: Highlight[]) => new Set(highlights.map((h) => h.bookId));

describe('dedupeBooks', () => {
  it('keeps the store copy when the highlights match, in any order', () => {
    const input = [
      make(SIDELOAD_A, 'one'),
      make(SIDELOAD_A, 'two'),
      make(STORE, 'two'),
      make(STORE, 'one'),
    ];
    expect(bookIds(dedupeBooks(input))).toEqual(new Set([STORE]));
  });

  it('keeps the lowest VolumeID between two sideloaded copies', () => {
    const input = [make(SIDELOAD_B, 'one'), make(SIDELOAD_A, 'one')];
    expect(bookIds(dedupeBooks(input))).toEqual(new Set([SIDELOAD_A]));
  });

  it.each<[string, Partial<Highlight>]>([
    ['the note', { note: 'different' }],
    ['the colour', { color: 'pink' }],
    ['the author', { author: 'Other Author' }],
    ['the title', { book: 'Other Book' }],
  ])('keeps both copies when %s differs', (_, overrides) => {
    const input = [make(STORE, 'one'), make(SIDELOAD_A, 'one', overrides)];
    expect(bookIds(dedupeBooks(input))).toEqual(new Set([STORE, SIDELOAD_A]));
  });

  it('keeps both copies when one has an extra highlight', () => {
    const input = [make(STORE, 'one'), make(SIDELOAD_A, 'one'), make(SIDELOAD_A, 'two')];
    expect(bookIds(dedupeBooks(input))).toEqual(new Set([STORE, SIDELOAD_A]));
  });
});
