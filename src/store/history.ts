import type { Highlight, KoboLibrary } from '../kobo/types';
import type { SavedHighlight, SavedLibrary } from './types';

export const isSavedLibrary = (library: KoboLibrary): library is SavedLibrary =>
  'imports' in library;

const isSaved = (h: Highlight): h is SavedHighlight => 'firstSeen' in h;

/** Id of the newest upload, or null when there is no earlier upload to compare it with. */
export function newImportId(library: KoboLibrary): number | null {
  if (!isSavedLibrary(library) || library.imports.length < 2) return null;
  return library.imports.at(-1)?.id ?? null;
}

/** Whether the newest upload was the first to contain this highlight. */
export const isNew = (h: Highlight, importId: number | null) =>
  importId !== null && isSaved(h) && h.firstSeen === importId;

export const isOffDevice = (h: Highlight) => isSaved(h) && !h.onDevice;

export interface BookHistory {
  /** Highlights the newest upload added. */
  added: number;
  /** True when no highlight of the book is on the device any more. */
  offDevice: boolean;
}

/** History per Bookmark.VolumeID. */
export function bookHistory(library: KoboLibrary): Map<string, BookHistory> {
  const importId = newImportId(library);
  const books = new Map<string, BookHistory>();
  for (const h of library.highlights) {
    const book = books.get(h.bookId) ?? { added: 0, offDevice: true };
    if (isNew(h, importId)) book.added++;
    if (!isOffDevice(h)) book.offDevice = false;
    books.set(h.bookId, book);
  }
  return books;
}
