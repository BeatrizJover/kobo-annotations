import type { Database, SqlJsStatic } from 'sql.js';
import { type Cell, clean, num, text } from './cells';
import { dedupeBooks } from './dedupe';
import { KoboError } from './errors';
import { type ChapterResolver, loadToc } from './toc';
import { COLORS, type Color, type Highlight, type KoboLibrary } from './types';

const SQLITE_MAGIC = 'SQLite format 3\0';

const BOOKMARK_COLUMNS = [
  'bookmarkid',
  'volumeid',
  'contentid',
  'text',
  'annotation',
  'datecreated',
  'chapterprogress',
  'hidden',
  'type',
];
const CONTENT_COLUMNS = [
  'contentid',
  'contenttype',
  'bookid',
  'chapteridbookmarked',
  'title',
  'attribution',
  'volumeindex',
];

function hasSqliteHeader(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) return false;
  for (let i = 0; i < SQLITE_MAGIC.length; i++) {
    if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

/** Returns the table's lower-cased column names, or throws `not-kobo` if any required one is missing. */
function requireColumns(db: Database, table: string, required: string[]): Set<string> {
  const [result] = db.exec(`SELECT lower(name) FROM pragma_table_info('${table}')`);
  const found = new Set(result?.values.map(([name]) => String(name)));
  if (!required.every((name) => found.has(name))) throw new KoboError('not-kobo');
  return found;
}

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
  SELECT b.BookmarkID, b.VolumeID, b.ContentID, b.Type, b.Text, b.Annotation,
         ${hasColor ? 'b.Color' : 'NULL'}, b.ChapterProgress, b.DateCreated,
         book.Title, book.Attribution,
         CASE WHEN exact.ContentID IS NOT NULL THEN exact.ContentID ELSE anchored.ContentID END,
         CASE WHEN exact.ContentID IS NOT NULL THEN exact.VolumeIndex ELSE anchored.VolumeIndex END
  FROM Bookmark b
  LEFT JOIN content book ON book.ContentID = b.VolumeID
  LEFT JOIN content exact ON exact.ContentID = b.ContentID
  LEFT JOIN content anchored ON instr(b.ContentID, '#') > 0
    AND anchored.ContentID = substr(b.ContentID, 1, instr(b.ContentID, '#') - 1)
  WHERE b.Type IN ('highlight', 'note')
    AND (b.Hidden IS NULL OR b.Hidden <> 'true')
    AND b.Text IS NOT NULL`;

function readHighlights(db: Database, hasColor: boolean, resolve: ChapterResolver): Highlight[] {
  const highlights: Highlight[] = [];
  const statement = db.prepare(query(hasColor));
  try {
    while (statement.step()) {
      const [
        id,
        volume,
        contentId,
        type,
        body,
        note,
        color,
        progress,
        created,
        book,
        author,
        file,
        index,
      ] = statement.get();
      const cleaned = clean(body);
      if (!cleaned) continue;
      const bookId = text(volume);
      const chapterIndex = num(index, -1);
      highlights.push({
        id: text(id),
        bookId,
        book: clean(book),
        author: clean(author),
        ...resolve({
          bookId,
          contentId: text(contentId),
          file: text(file),
          fileIndex: chapterIndex,
        }),
        chapterIndex,
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

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const compareHighlights = (a: Highlight, b: Highlight): number =>
  collator.compare(a.book, b.book) ||
  collator.compare(a.author, b.author) ||
  byString(a.bookId, b.bookId) ||
  a.chapterIndex - b.chapterIndex ||
  a.progress - b.progress ||
  byString(a.created, b.created) ||
  byString(a.id, b.id);

/** Sorts in place in export order: book, chapter, position, creation date. */
export function sortHighlights<T extends Highlight>(highlights: T[]): T[] {
  return highlights.sort(compareHighlights);
}

function readLibrary(db: Database): KoboLibrary {
  requireColumns(db, 'content', CONTENT_COLUMNS);
  const hasColor = requireColumns(db, 'bookmark', BOOKMARK_COLUMNS).has('color');

  const highlights = sortHighlights(dedupeBooks(readHighlights(db, hasColor, loadToc(db))));
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
