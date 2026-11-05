import { useMemo } from 'preact/hooks';
import { csvFilename, toCsv } from '../export/csv';
import type { KoboLibrary } from '../kobo/types';
import { isNew, newImportId } from '../store/history';
import { downloadText } from './download';

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

interface ExportPanelProps {
  library: KoboLibrary;
  onShowBooks: () => void;
}

export function ExportPanel({ library, onShowBooks }: ExportPanelProps) {
  const { highlights } = library;
  const bookCount = useMemo(() => new Set(highlights.map((h) => h.bookId)).size, [highlights]);
  const newCount = useMemo(() => {
    const importId = newImportId(library);
    return highlights.filter((h) => isNew(h, importId)).length;
  }, [library]);

  if (highlights.length === 0) {
    return <p class="notice">No highlights or notes were found in this file.</p>;
  }

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

      <div class="actions">
        <button
          type="button"
          class="button"
          onClick={() => downloadText(toCsv(highlights, { notesOnly: false }), csvFilename())}
        >
          Download CSV
        </button>
        <button type="button" class="link-down" onClick={onShowBooks}>
          Check it here <span aria-hidden="true">↓</span>
        </button>
      </div>
    </section>
  );
}
