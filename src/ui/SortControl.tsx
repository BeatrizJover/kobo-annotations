import { useEffect, useId, useRef, useState } from 'preact/hooks';
import {
  SORT_DIRECTIONS,
  SORT_FIELDS,
  type BookSort,
  type SortDirection,
  type SortField,
} from '../kobo/books';

const FIELD_LABELS: Record<SortField, string> = { title: 'Title', author: 'Author' };
const DIRECTION_LABELS: Record<SortDirection, string> = { asc: 'A–Z', desc: 'Z–A' };

interface SortControlProps {
  sort: BookSort;
  onSort: (sort: BookSort) => void;
}

export function SortControl({ sort, onSort }: SortControlProps) {
  const id = useId();
  const [open, setOpen] = useState<SortField | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const fieldButtons = useRef<Partial<Record<SortField, HTMLButtonElement | null>>>({});

  const close = (field: SortField) => {
    setOpen(null);
    fieldButtons.current[field]?.focus();
  };

  // Listens on the document because Safari doesn't focus a clicked button, so keys never reach it.
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close(open);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={root} class="sort" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} class="sort-label">
        Sort by
      </span>
      {SORT_FIELDS.map((field) => {
        const active = SORT_DIRECTIONS.find((direction) => sort === `${field}-${direction}`);
        const expanded = open === field;
        const optionsId = `${id}-${field}`;
        return (
          <div
            key={field}
            class="sort-item"
            onFocusOut={(event) => {
              // A null target means a click on nothing focusable, which the pointer listener handles.
              const next = event.relatedTarget as Node | null;
              if (next && !event.currentTarget.contains(next)) {
                setOpen((current) => (current === field ? null : current));
              }
            }}
          >
            <button
              ref={(element) => {
                fieldButtons.current[field] = element;
              }}
              type="button"
              class={active ? 'sort-field is-active' : 'sort-field'}
              aria-expanded={expanded}
              aria-controls={expanded ? optionsId : undefined}
              onClick={() => setOpen(expanded ? null : field)}
            >
              {FIELD_LABELS[field]}
              {active && <span class="sort-direction"> {DIRECTION_LABELS[active]}</span>}
            </button>
            {expanded && (
              <div
                id={optionsId}
                class="sort-options"
                role="group"
                aria-label={`${FIELD_LABELS[field]} order`}
              >
                {SORT_DIRECTIONS.map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    class="sort-option"
                    aria-pressed={active === direction}
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
