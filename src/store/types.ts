import type { Highlight } from '../kobo/types';

/** A highlight kept across uploads; `firstSeen` and `lastSeen` are import ids. */
export interface SavedHighlight extends Highlight {
  firstSeen: number;
  lastSeen: number;
  /** False once a later upload no longer contains it, e.g. after the book left the Kobo. */
  onDevice: boolean;
}

export interface ImportRecord {
  id: number;
  /** Upload time as an ISO 8601 UTC string. */
  at: string;
  hasColor: boolean;
  /** Highlights in the uploaded file. */
  total: number;
  /** Highlights no earlier upload contained. */
  added: number;
  /** Saved highlights this upload no longer contains. */
  removed: number;
}

export interface SavedLibrary {
  highlights: SavedHighlight[];
  /** Whether any upload came from a database with a Bookmark.Color column. */
  hasColor: boolean;
  /** Oldest first. */
  imports: ImportRecord[];
}
