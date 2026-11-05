import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BOOK_SORTS, listBooks, sortBooks, type BookSort } from '../kobo/books';
import type { KoboLibrary } from '../kobo/types';
import { bookHistory } from '../store/history';

const SORT_LABELS: Record<BookSort, string> = {
  'title-asc': 'Title (A–Z)',
  'title-desc': 'Title (Z–A)',
  'author-asc': 'Author (A–Z)',
  'author-desc': 'Author (Z–A)',
};

interface LibraryProps {
  library: KoboLibrary;
  /** Kept mounted while a book is open, so the sort and the tile to refocus survive. */
  hidden: boolean;
  /** Whether to refocus the last opened tile when shown again, i.e. after Back. */
  restoreFocus: boolean;
  onOpen: (bookId: string) => void;
}

export function Library({ library, hidden, restoreFocus, onOpen }: LibraryProps) {
  const [sort, setSort] = useState<BookSort>('title-asc');
  const books = useMemo(() => listBooks(library.highlights), [library]);
  const history = useMemo(() => bookHistory(library), [library]);
  const sorted = useMemo(() => sortBooks(books, sort), [books, sort]);
  const opened = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // A forgotten book has no tile left, so focus falls back to the heading.
  useEffect(() => {
    if (hidden || !restoreFocus) return;
    if (opened.current?.isConnected) opened.current.focus();
    else heading.current?.focus();
  }, [hidden, restoreFocus, library]);

  if (books.length === 0) return null;

  return (
    <section class="library" aria-labelledby="library-title" hidden={hidden}>
      <h2 id="library-title" ref={heading} tabIndex={-1}>
        Your books
      </h2>
      {/* Radios, not a <select>: WebKit styles its select inline, which the CSP blocks. */}
      <fieldset class="filters">
        <legend>Sort by</legend>
        {BOOK_SORTS.map((option) => (
          <label key={option} class="check">
            <input
              type="radio"
              name="book-sort"
              checked={sort === option}
              onChange={() => setSort(option)}
            />
            {SORT_LABELS[option]}
          </label>
        ))}
      </fieldset>
      {/* Safari drops list semantics when list-style is none. */}
      <ul class="book-grid" role="list">
        {sorted.map((book) => {
          const { added = 0, offDevice = false } = history.get(book.id) ?? {};
          return (
            <li key={book.id}>
              <button
                type="button"
                class="book-tile"
                onClick={(event) => {
                  opened.current = event.currentTarget;
                  onOpen(book.id);
                }}
              >
                <span class="book-title" dir="auto">
                  {book.title || 'Untitled'}
                </span>
                <span class="book-author" dir="auto">
                  {book.author || 'Unknown author'}
                </span>
                {(added > 0 || offDevice) && (
                  <span class="tags">
                    {added > 0 && <span class="tag tag-new">{added.toLocaleString()} new</span>}
                    {offDevice && <span class="tag">Not on your Kobo</span>}
                  </span>
                )}
                <span class="book-count">
                  {book.count.toLocaleString()} {book.count === 1 ? 'highlight' : 'highlights'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
