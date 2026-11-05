import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { filterHighlights } from '../export/csv';
import { HIGHLIGHT_ORDERS, sortByCreated, type HighlightOrder } from '../kobo/books';
import { COLORS, type Color, type KoboLibrary } from '../kobo/types';
import { COLOR_LABELS, countByColor, usesColors } from './colors';

const TABS = ['highlights', 'notes', 'stats'] as const;

type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  highlights: 'Highlights',
  notes: 'Notes',
  stats: 'Stats',
};

const ORDER_LABELS: Record<HighlightOrder, string> = {
  oldest: 'Oldest first',
  newest: 'Newest first',
};

interface BookViewProps {
  library: KoboLibrary;
  /** Bookmark.VolumeID of the book to show. */
  bookId: string;
  onBack: () => void;
}

export function BookView({ library, bookId, onBack }: BookViewProps) {
  const showColors = useMemo(() => usesColors(library), [library]);
  const own = useMemo(
    () => library.highlights.filter((h) => h.bookId === bookId),
    [library, bookId],
  );
  const notes = useMemo(() => own.filter((h) => h.note !== ''), [own]);
  const [tab, setTab] = useState<Tab>('highlights');
  const [colors, setColors] = useState<readonly Color[]>(COLORS);
  const [order, setOrder] = useState<HighlightOrder>('oldest');
  const heading = useRef<HTMLHeadingElement>(null);
  const tabButtons = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const first = own[0];
  if (!first) return null;

  const tabRows = tab === 'notes' ? notes : own;
  const counts = countByColor(tabRows);
  const rows = sortByCreated(
    filterHighlights(tabRows, { colors: showColors ? colors : undefined, notesOnly: false }),
    order,
  );
  const tabCounts: Record<Tab, number | null> = {
    highlights: own.length,
    notes: notes.length,
    stats: null,
  };

  const select = (next: Tab) => {
    setTab(next);
    tabButtons.current[next]?.focus();
  };

  const onTabKey = (event: KeyboardEvent) => {
    const index = TABS.indexOf(tab);
    const target: Partial<Record<string, number>> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = TABS[target[event.key] ?? -1];
    if (!next) return;
    event.preventDefault();
    select(next);
  };

  const toggle = (color: Color, checked: boolean) =>
    setColors(COLORS.filter((c) => (c === color ? checked : colors.includes(c))));

  const empty =
    tab === 'notes' && notes.length === 0
      ? 'This book has no notes.'
      : 'No highlights match the selected colors.';

  return (
    <section class="book-view" aria-labelledby="book-title">
      <button type="button" class="button-plain back" onClick={onBack}>
        ← All books
      </button>
      <h2 id="book-title" ref={heading} tabIndex={-1} dir="auto">
        {first.book || 'Untitled'}
      </h2>
      <p class="book-author" dir="auto">
        {first.author || 'Unknown author'}
      </p>

      <div class="tabs" role="tablist" aria-label="Book sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t}
            ref={(element) => {
              tabButtons.current[t] = element;
            }}
            type="button"
            role="tab"
            id={`book-tab-${t}`}
            class="tab"
            aria-selected={tab === t}
            aria-controls="book-panel"
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
            {tabCounts[t] !== null && ` (${tabCounts[t].toLocaleString()})`}
          </button>
        ))}
      </div>

      <div id="book-panel" role="tabpanel" aria-labelledby={`book-tab-${tab}`} class="tab-panel">
        {tab === 'stats' ? (
          <p class="notice">Stats are coming in a later version.</p>
        ) : (
          <>
            {showColors && (
              <fieldset class="filters">
                <legend>Colors</legend>
                <label class="check">
                  <input
                    type="checkbox"
                    checked={colors.length === COLORS.length}
                    onChange={(event) => setColors(event.currentTarget.checked ? COLORS : [])}
                  />
                  All
                </label>
                {COLORS.map((color) => (
                  <label key={color} class="check">
                    <input
                      type="checkbox"
                      checked={colors.includes(color)}
                      onChange={(event) => toggle(color, event.currentTarget.checked)}
                    />
                    <span class={`swatch swatch-${color}`} aria-hidden="true" />
                    {COLOR_LABELS[color]} ({counts[color].toLocaleString()})
                  </label>
                ))}
              </fieldset>
            )}
            <fieldset class="filters">
              <legend>Order</legend>
              {HIGHLIGHT_ORDERS.map((option) => (
                <label key={option} class="check">
                  <input
                    type="radio"
                    name="highlight-order"
                    checked={order === option}
                    onChange={() => setOrder(option)}
                  />
                  {ORDER_LABELS[option]}
                </label>
              ))}
            </fieldset>

            {rows.length === 0 ? (
              <p class="notice">{empty}</p>
            ) : (
              // Safari drops list semantics when list-style is none.
              <ul class="card-list" role="list">
                {rows.map((h) => (
                  <li key={h.id} class="card">
                    <span class="card-side">
                      <span class="card-chapter">
                        <span class="visually-hidden">Chapter </span>
                        {h.chapterNo ?? (
                          <>
                            <span aria-hidden="true">–</span>
                            <span class="visually-hidden">unknown</span>
                          </>
                        )}
                      </span>
                      {showColors && h.color && (
                        <span
                          class={`swatch swatch-${h.color}`}
                          role="img"
                          aria-label={COLOR_LABELS[h.color]}
                        />
                      )}
                    </span>
                    <div class="card-body">
                      <p class="card-text" dir="auto">
                        {h.text}
                      </p>
                      {h.note && (
                        <p class="card-note">
                          <span class="card-label">Note</span>
                          <span dir="auto">{h.note}</span>
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
