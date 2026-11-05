import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { dedupeBooks } from './dedupe';
import { KoboError } from './errors';
import { COLORS, type Color, type Highlight, type KoboLibrary } from './types';

const SQLITE_MAGIC = 'SQLite format 3\0';

const REQUIRED_COLUMNS: Record<string, string[]> = {
  bookmark: [
    'BookmarkID',
    'VolumeID',
    'ContentID',
    'Text',
    'Annotation',
    'DateCreated',
    'ChapterProgress',
    'Hidden',
    'Type',
  ],
  content: ['ContentID', 'Title', 'Attribution', 'VolumeIndex'],
};

const SOFT_HYPHEN = /\u00AD/g;

type Cell = SqlValue | undefined;

function hasSqliteHeader(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) return false;
  for (let i = 0; i < SQLITE_MAGIC.length; i++) {
    if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

function columnsOf(db: Database, table: string): Set<string> {
  const [result] = db.exec(`SELECT lower(name) FROM pragma_table_info('${table}')`);
  return new Set(result?.values.map(([name]) => String(name)));
}

const text = (value: Cell): string => (typeof value === 'string' ? value : '');
const num = (value: Cell, fallback: number): number =>
  typeof value === 'number' ? value : fallback;
const clean = (value: Cell): string => text(value).replace(SOFT_HYPHEN, '').trim();

function toColor(value: Cell): Color | null {
  return typeof value === 'number' ? (COLORS[value] ?? null) : null;
}

// Kobo stores DateCreated in UTC without a zone suffix.
function toIsoUtc(value: Cell): string {
  const raw = text(value).trim();
  if (!raw) return '';
  const date = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? raw : `${raw}Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

// Bookmark.ContentID matches a chapter directly or after dropping a `#anchor` suffix.
const query = (hasColor: boolean) => `
  SELECT b.BookmarkID, b.VolumeID, b.Type, b.Text, b.Annotation,
         ${hasColor ? 'b.Color' : 'NULL'}, b.ChapterProgress, b.DateCreated,
         book.Title, book.Attribution,
         CASE WHEN exact.ContentID IS NOT NULL THEN exact.Title ELSE anchored.Title END,
         CASE WHEN exact.ContentID IS NOT NULL THEN exact.VolumeIndex ELSE anchored.VolumeIndex END
  FROM Bookmark b
  LEFT JOIN content book ON book.ContentID = b.VolumeID
  LEFT JOIN content exact ON exact.ContentID = b.ContentID
  LEFT JOIN content anchored ON instr(b.ContentID, '#') > 0
    AND anchored.ContentID = substr(b.ContentID, 1, instr(b.ContentID, '#') - 1)
  WHERE b.Type IN ('highlight', 'note')
    AND (b.Hidden IS NULL OR b.Hidden <> 'true')
    AND b.Text IS NOT NULL`;

function readHighlights(db: Database, hasColor: boolean): Highlight[] {
  const highlights: Highlight[] = [];
  const statement = db.prepare(query(hasColor));
  try {
    while (statement.step()) {
      const [id, bookId, type, body, note, color, progress, created, book, author, chapter, index] =
        statement.get();
      const cleaned = clean(body);
      if (!cleaned) continue;
      highlights.push({
        id: text(id),
        bookId: text(bookId),
        book: clean(book),
        author: clean(author),
        chapter: clean(chapter),
        chapterIndex: num(index, -1),
        progress: num(progress, 0),
        type: type === 'note' ? 'note' : 'highlight',
        text: cleaned,
        note: clean(note),
        color: toColor(color),
        created: toIsoUtc(created),
      });
    }
  } finally {
    statement.free();
  }
  return highlights;
}

function compareHighlights(collator: Intl.Collator) {
  const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return (a: Highlight, b: Highlight): number =>
    collator.compare(a.book, b.book) ||
    collator.compare(a.author, b.author) ||
    byString(a.bookId, b.bookId) ||
    a.chapterIndex - b.chapterIndex ||
    a.progress - b.progress ||
    byString(a.created, b.created) ||
    byString(a.id, b.id);
}

function readLibrary(db: Database): KoboLibrary {
  const columns: Record<string, Set<string>> = {};
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const found = columnsOf(db, table);
    if (!required.every((name) => found.has(name.toLowerCase()))) throw new KoboError('not-kobo');
    columns[table] = found;
  }
  const hasColor = columns.bookmark?.has('color') ?? false;

  const highlights = dedupeBooks(readHighlights(db, hasColor));
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  highlights.sort(compareHighlights(collator));
  return { highlights, hasColor };
}

/** Reads the exportable highlights and notes from the bytes of a KoboReader.sqlite file. */
export function parseKobo(SQL: SqlJsStatic, bytes: Uint8Array): KoboLibrary {
  if (!hasSqliteHeader(bytes)) throw new KoboError('not-sqlite');
  let db: Database;
  try {
    db = new SQL.Database(bytes);
  } catch (cause) {
    throw new KoboError('unreadable', { cause });
  }
  try {
    return readLibrary(db);
  } catch (error) {
    if (error instanceof KoboError) throw error;
    throw new KoboError('unreadable', { cause: error });
  } finally {
    db.close();
  }
}
