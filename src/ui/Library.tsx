import type { ComponentChildren } from 'preact';
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
  onOpen: (bookId: string) => void;
  /** Cover image URLs per book id. */
  covers: ReadonlyMap<string, string>;
  /** Shown between the sort control and the books. */
  children?: ComponentChildren;
}

export function Library({ library, hidden, restoreFocus, onOpen, covers, children }: LibraryProps) {
  const [sort, setSort] = useState<BookSort>('title-asc');
  const books = useMemo(() => listBooks(library.highlights), [library]);
  const history = useMemo(() => bookHistory(library), [library]);
  const sorted = useMemo(() => sortBooks(books, sort), [books, sort]);
  const anyCover = useMemo(() => books.some((b) => covers.has(b.id)), [books, covers]);
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
      <SortControl sort={sort} onSort={setSort} />
      {children}
      {/* Safari drops list semantics when list-style is none. */}
      <ul class="book-grid" role="list">
        {sorted.map((book) => {
          const { added = 0, offDevice = false } = history.get(book.id) ?? {};
          const cover = covers.get(book.id);
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
                {cover ? (
                  <img class="book-cover" src={cover} alt="" />
                ) : (
                  // Keeps the grid even once some books have covers.
                  anyCover && (
                    <span class="book-cover is-placeholder" aria-hidden="true" dir="auto">
                      {book.title || 'Untitled'}
                    </span>
                  )
                )}
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
