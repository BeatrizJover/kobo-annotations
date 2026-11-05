import { useMemo, useState } from 'preact/hooks';
import { csvFilename, filterHighlights, toCsv, type ExportFilter } from '../export/csv';
import { COLORS, type Color, type Highlight, type KoboLibrary } from '../kobo/types';
import { downloadText } from './download';

const COLOR_LABELS: Record<Color, string> = {
  yellow: 'Yellow',
  pink: 'Pink',
  blue: 'Blue',
  green: 'Green',
};

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

function countByColor(highlights: readonly Highlight[]): Record<Color, number> {
  const counts: Record<Color, number> = { yellow: 0, pink: 0, blue: 0, green: 0 };
  for (const h of highlights) if (h.color) counts[h.color]++;
  return counts;
}

// Devices without colour support store every highlight as yellow, so a lone yellow means no colours.
const usesColors = ({ hasColor, highlights }: KoboLibrary) =>
  hasColor && highlights.some((h) => h.color !== null && h.color !== 'yellow');

export function ExportPanel({ library }: { library: KoboLibrary }) {
  const { highlights } = library;
  const showColors = useMemo(() => usesColors(library), [library]);
  const bookCount = useMemo(() => new Set(highlights.map((h) => h.bookId)).size, [highlights]);
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
