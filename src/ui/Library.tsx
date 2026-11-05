import { useMemo, useState } from 'preact/hooks';
import { BOOK_SORTS, listBooks, sortBooks, type BookSort } from '../kobo/books';
import type { Highlight } from '../kobo/types';

const SORT_LABELS: Record<BookSort, string> = {
  'title-asc': 'Title (A–Z)',
  'title-desc': 'Title (Z–A)',
  'author-asc': 'Author (A–Z)',
  'author-desc': 'Author (Z–A)',
};

export function Library({ highlights }: { highlights: readonly Highlight[] }) {
  const [sort, setSort] = useState<BookSort>('title-asc');
  const books = useMemo(() => listBooks(highlights), [highlights]);
  const sorted = useMemo(() => sortBooks(books, sort), [books, sort]);

  if (books.length === 0) return null;

  return (
    <section class="library" aria-labelledby="library-title">
      <h2 id="library-title">Your books</h2>
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
        {sorted.map((book) => (
          <li key={book.id} class="book-tile">
            <span class="book-title" dir="auto">
              {book.title || 'Untitled'}
            </span>
            <span class="book-author" dir="auto">
              {book.author || 'Unknown author'}
            </span>
            <span class="book-count">
              {book.count.toLocaleString()} {book.count === 1 ? 'highlight' : 'highlights'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
