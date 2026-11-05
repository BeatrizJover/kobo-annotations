export const COLORS = ['yellow', 'pink', 'blue', 'green'] as const;

export type Color = (typeof COLORS)[number];

export type HighlightType = 'highlight' | 'note';

export interface Highlight {
  /** Bookmark.BookmarkID. */
  id: string;
  /** Bookmark.VolumeID; identifies the book, since titles can repeat. */
  bookId: string;
  book: string;
  author: string;
  /** Title from the book's table of contents, '' when unresolved. */
  chapter: string;
  /** 1-based position of that title in the book's table of contents, null when unresolved. */
  chapterNo: number | null;
  /** content.VolumeIndex of the chapter file, -1 when the file can't be resolved. */
  chapterIndex: number;
  /** Position within the chapter, 0..1. */
  progress: number;
  type: HighlightType;
  text: string;
  note: string;
  /** Null when the device doesn't store colours or the value is unknown. */
  color: Color | null;
  /** DateCreated as an ISO 8601 UTC string, '' when missing or invalid. */
  created: string;
}

export interface KoboLibrary {
  highlights: Highlight[];
  /** Whether the database has a Bookmark.Color column. */
  hasColor: boolean;
}
