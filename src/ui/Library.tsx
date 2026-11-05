import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { listBooks, sortBooks, type BookSort } from '../kobo/books';
import type { KoboLibrary } from '../kobo/types';
import { bookHistory } from '../store/history';
import { SortControl } from './SortControl';

interface LibraryProps {
  library: KoboLibrary;
  /** Kept mounted while a book is open, so the sort and the tile to refocus survive. */
  hidden: boolean;
  /** Whether to refocus the last opened tile when shown again, i.e. after Back. */
  restoreFocus: boolean;
  /** Changes each time the user asks to see the books, which scrolls to and focuses the heading. */
  reveal: number;
  onOpen: (bookId: string) => void;
}

export function Library({ library, hidden, restoreFocus, reveal, onOpen }: LibraryProps) {
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

  // Starts at the current value so a remount (after a clear) doesn't scroll by itself.
  const revealed = useRef(reveal);
  useEffect(() => {
    if (reveal === revealed.current || !heading.current) return;
    revealed.current = reveal;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.current.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    heading.current.focus({ preventScroll: true });
  }, [reveal]);

  if (books.length === 0) return null;

  return (
    <section class="library" aria-labelledby="library-title" hidden={hidden}>
      <h2 id="library-title" ref={heading} tabIndex={-1}>
        Your books
      </h2>
      <SortControl sort={sort} onSort={setSort} />
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
