import type { Highlight } from './types';

const isStoreBook = (bookId: string) => !bookId.startsWith('file://');

// Store copy first, then the lowest VolumeID, so the survivor is deterministic.
function preferred(a: string, b: string): string {
  if (isStoreBook(a) !== isStoreBook(b)) return isStoreBook(a) ? a : b;
  return a < b ? a : b;
}

function signature(highlights: Highlight[]): string {
  return JSON.stringify(highlights.map((h) => JSON.stringify([h.text, h.note, h.color])).sort());
}

/** Drops copies of a book: same title, author and exported highlights under another VolumeID. */
export function dedupeBooks(highlights: Highlight[]): Highlight[] {
  const byBook = new Map<string, Highlight[]>();
  for (const h of highlights) {
    const list = byBook.get(h.bookId);
    if (list) list.push(h);
    else byBook.set(h.bookId, [h]);
  }

  const survivors = new Map<string, string>();
  for (const [bookId, list] of byBook) {
    const first = list[0];
    if (!first) continue;
    const key = JSON.stringify([first.book, first.author, signature(list)]);
    const current = survivors.get(key);
    survivors.set(key, current === undefined ? bookId : preferred(current, bookId));
  }

  const kept = new Set(survivors.values());
  return highlights.filter((h) => kept.has(h.bookId));
}
