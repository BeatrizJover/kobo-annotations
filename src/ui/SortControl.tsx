import { useEffect, useRef, useState } from 'preact/hooks';
import type { BookSort } from '../kobo/books';

const FIELDS = ['title', 'author'] as const;
const DIRECTIONS = ['asc', 'desc'] as const;

type Field = (typeof FIELDS)[number];
type Direction = (typeof DIRECTIONS)[number];

const FIELD_LABELS: Record<Field, string> = { title: 'Title', author: 'Author' };
const DIRECTION_LABELS: Record<Direction, string> = { asc: 'A–Z', desc: 'Z–A' };

interface SortControlProps {
  sort: BookSort;
  onSort: (sort: BookSort) => void;
}

export function SortControl({ sort, onSort }: SortControlProps) {
  const [open, setOpen] = useState<Field | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const fieldButtons = useRef<Partial<Record<Field, HTMLButtonElement | null>>>({});
  const [activeField, activeDirection] = sort.split('-') as [Field, Direction];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const close = (field: Field) => {
    setOpen(null);
    fieldButtons.current[field]?.focus();
  };

  return (
    <div
      ref={root}
      class="sort"
      role="group"
      aria-labelledby="sort-label"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        close(open);
      }}
      onFocusOut={(event) => {
        // A null target means a click on nothing focusable, which the pointer listener handles.
        const next = event.relatedTarget as Node | null;
        if (next && !root.current?.contains(next)) setOpen(null);
      }}
    >
      <span id="sort-label" class="sort-label">
        Sort by
      </span>
      {FIELDS.map((field) => {
        const active = field === activeField;
        const expanded = open === field;
        return (
          <div key={field} class="sort-item">
            <button
              ref={(element) => {
                fieldButtons.current[field] = element;
              }}
              type="button"
              class={active ? 'sort-field is-active' : 'sort-field'}
              aria-expanded={expanded}
              aria-controls={expanded ? `sort-${field}` : undefined}
              onClick={() => setOpen(expanded ? null : field)}
            >
              {FIELD_LABELS[field]}
              {active && <span class="sort-direction"> {DIRECTION_LABELS[activeDirection]}</span>}
            </button>
            {expanded && (
              <div
                id={`sort-${field}`}
                class="sort-options"
                role="group"
                aria-label={`${FIELD_LABELS[field]} order`}
              >
                {DIRECTIONS.map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    class="sort-option"
                    aria-pressed={active && direction === activeDirection}
                    onClick={() => {
                      onSort(`${field}-${direction}`);
                      close(field);
                    }}
                  >
                    {DIRECTION_LABELS[direction]}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
