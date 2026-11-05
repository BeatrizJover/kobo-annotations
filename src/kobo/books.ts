import type { Highlight } from './types';

export interface BookSummary {
  /** Bookmark.VolumeID. */
  id: string;
  title: string;
  author: string;
  /** Highlights and notes in the book. */
  count: number;
}

export const SORT_FIELDS = ['title', 'author'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export type BookSort = `${SortField}-${SortDirection}`;

/** One entry per book, in first-seen order. */
export function listBooks(highlights: readonly Highlight[]): BookSummary[] {
  const books = new Map<string, BookSummary>();
  for (const h of highlights) {
    const book = books.get(h.bookId);
    if (book) book.count++;
    else books.set(h.bookId, { id: h.bookId, title: h.book, author: h.author, count: 1 });
  }
  return [...books.values()];
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Returns a sorted copy; ties fall back to the other field, then the book id. */
export function sortBooks(books: readonly BookSummary[], sort: BookSort): BookSummary[] {
  const byAuthor = sort.startsWith('author');
  const direction = sort.endsWith('desc') ? -1 : 1;
  const [first, second] = byAuthor
    ? (['author', 'title'] as const)
    : (['title', 'author'] as const);
  return [...books].sort(
    (a, b) =>
      direction *
      (collator.compare(a[first], b[first]) ||
        collator.compare(a[second], b[second]) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
}

export const HIGHLIGHT_ORDERS = ['oldest', 'newest'] as const;

export type HighlightOrder = (typeof HIGHLIGHT_ORDERS)[number];

/** Returns a copy sorted by DateCreated; undated rows go last and ties keep their order. */
export function sortByCreated<T extends Highlight>(
  highlights: readonly T[],
  order: HighlightOrder,
): T[] {
  const direction = order === 'newest' ? -1 : 1;
  return [...highlights].sort((a, b) => {
    if (!a.created || !b.created) return Number(!a.created) - Number(!b.created);
    return direction * (a.created < b.created ? -1 : a.created > b.created ? 1 : 0);
  });
}
