import type { Database } from 'sql.js';
import { clean, text } from './cells';

export interface ChapterTitle {
  chapter: string;
  chapterNo: number | null;
}

/** Where a highlight sits: its Bookmark.ContentID and the chapter file it resolved to. */
export interface ChapterLocation {
  bookId: string;
  contentId: string;
  /** ContentID of the chapter file, '' when unresolved. */
  file: string;
  /** VolumeIndex of the chapter file. */
  fileIndex: number;
}

export type ChapterResolver = (location: ChapterLocation) => ChapterTitle;

interface Entry {
  title: string;
  no: number;
  fileIndex: number;
}

const UNRESOLVED: ChapterTitle = { chapter: '', chapterNo: null };

// TOC ContentIDs are the chapter file's ContentID, an optional `#anchor` and a `-N` suffix.
const TOC_SUFFIX = /-\d+$/;

const ANNOTATED_BOOKS = `SELECT VolumeID FROM Bookmark WHERE Type IN ('highlight', 'note')`;

const key = (bookId: string, id: string) => `${bookId}\0${id}`;

function readFileIndexes(db: Database): Map<string, number> {
  const indexes = new Map<string, number>();
  const [result] = db.exec(
    `SELECT ContentID, VolumeIndex FROM content
     WHERE ContentType = '9' AND BookID IN (${ANNOTATED_BOOKS})`,
  );
  for (const [id, index] of result?.values ?? []) {
    if (typeof index === 'number') indexes.set(text(id), index);
  }
  return indexes;
}

// Index of the first entry whose file comes at or after `fileIndex`; entries are sorted by file.
function firstAtOrAfter(entries: readonly Entry[], fileIndex: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((entries[mid]?.fileIndex ?? Infinity) < fileIndex) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Loads the TOC (content type 899) of every annotated book and returns a chapter resolver. */
export function loadToc(db: Database): ChapterResolver {
  const fileIndexes = readFileIndexes(db);
  const byAnchor = new Map<string, Entry>();
  const byFile = new Map<string, Entry>();
  const byBook = new Map<string, Entry[]>();

  const [result] = db.exec(
    `SELECT BookID, ContentID, ChapterIDBookmarked, Title FROM content
     WHERE ContentType = '899' AND BookID IN (${ANNOTATED_BOOKS})
     ORDER BY BookID, VolumeIndex, ContentID`,
  );
  let currentBook: string | undefined;
  let no = 0;
  for (const [bookCell, idCell, fileCell, title] of result?.values ?? []) {
    const bookId = text(bookCell);
    no = bookId === currentBook ? no + 1 : 1;
    currentBook = bookId;

    const target = text(idCell).replace(TOC_SUFFIX, '');
    // ChapterIDBookmarked is the file itself, which may contain `#` in a sideloaded file name.
    const bookmarked = text(fileCell);
    const isFile = bookmarked && (target === bookmarked || target.startsWith(`${bookmarked}#`));
    const file = isFile ? bookmarked : (target.split('#', 1)[0] ?? '');
    const fileIndex = fileIndexes.get(file) ?? -1;
    if (fileIndex < 0) continue;

    const entry: Entry = { title: clean(title), no, fileIndex };
    if (!byAnchor.has(key(bookId, target))) byAnchor.set(key(bookId, target), entry);
    if (!byFile.has(key(bookId, file))) byFile.set(key(bookId, file), entry);
    const entries = byBook.get(bookId) ?? [];
    entries.push(entry);
    byBook.set(bookId, entries);
  }
  for (const entries of byBook.values()) {
    // Stable, so entries of the same file keep their TOC order.
    entries.sort((a, b) => a.fileIndex - b.fileIndex);
  }

  // A chapter spanning several files inherits the last entry of an earlier file.
  const inherited = (bookId: string, fileIndex: number): Entry | undefined => {
    const entries = byBook.get(bookId) ?? [];
    return entries[firstAtOrAfter(entries, fileIndex) - 1];
  };

  return ({ bookId, contentId, file, fileIndex }) => {
    if (!file) return UNRESOLVED;
    const entry =
      byAnchor.get(key(bookId, contentId)) ??
      byFile.get(key(bookId, file)) ??
      inherited(bookId, fileIndex);
    return entry ? { chapter: entry.title, chapterNo: entry.no } : UNRESOLVED;
  };
}
