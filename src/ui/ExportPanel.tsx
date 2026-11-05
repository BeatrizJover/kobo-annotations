import { useMemo, useState } from 'preact/hooks';
import { csvFilename, filterHighlights, toCsv, type ExportFilter } from '../export/csv';
import { COLORS, type Color, type KoboLibrary } from '../kobo/types';
import { isNew, newImportId } from '../store/history';
import { COLOR_LABELS, countByColor, usesColors } from './colors';
import { downloadText } from './download';

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

export function ExportPanel({ library }: { library: KoboLibrary }) {
  const { highlights } = library;
  const showColors = useMemo(() => usesColors(library), [library]);
  const bookCount = useMemo(() => new Set(highlights.map((h) => h.bookId)).size, [highlights]);
  const newCount = useMemo(() => {
    const importId = newImportId(library);
    return highlights.filter((h) => isNew(h, importId)).length;
  }, [library]);
  const [colors, setColors] = useState<readonly Color[]>(COLORS);
  const [notesOnly, setNotesOnly] = useState(false);

  if (highlights.length === 0) {
    return <p class="notice">No highlights or notes were found in this file.</p>;
  }

  const filter: ExportFilter = { colors: showColors ? colors : undefined, notesOnly };
  const rowCount = filterHighlights(highlights, filter).length;
  const counts = countByColor(notesOnly ? highlights.filter((h) => h.note !== '') : highlights);

  const toggle = (color: Color, checked: boolean) =>
    setColors(COLORS.filter((c) => (c === color ? checked : colors.includes(c))));

  return (
    <section class="panel" aria-label="Export">
      <p>
        Found {plural(highlights.length, 'highlight', 'highlights')} in{' '}
        {plural(bookCount, 'book', 'books')}.
      </p>
      {newCount > 0 && (
        <p class="hint">
          {plural(newCount, 'highlight is', 'highlights are')} new since last time.
        </p>
      )}

      {showColors && (
        <fieldset class="filters">
          <legend>Colors</legend>
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

      <label class="check">
        <input
          type="checkbox"
          checked={notesOnly}
          onChange={(event) => setNotesOnly(event.currentTarget.checked)}
        />
        Notes only
      </label>

      <div class="actions">
        <button
          type="button"
          class="button"
          disabled={rowCount === 0}
          onClick={() => downloadText(toCsv(highlights, filter), csvFilename())}
        >
          Download CSV ({plural(rowCount, 'row', 'rows')})
        </button>
        {rowCount === 0 && <p class="hint">No highlights match the selected filters.</p>}
      </div>
    </section>
  );
}
