import type { Highlight } from './types';

export interface BookSummary {
  /** Bookmark.VolumeID. */
  id: string;
  title: string;
  author: string;
  /** Highlights and notes in the book. */
  count: number;
}

export const BOOK_SORTS = ['title-asc', 'title-desc', 'author-asc', 'author-desc'] as const;

export type BookSort = (typeof BOOK_SORTS)[number];

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
