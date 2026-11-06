import type { Highlight } from '../kobo/types';

/** Kobo cover sizes in order of preference: about 355×530, 150×220 and 1120×1680 px. */
export const COVER_SIZES = ['N3_LIBRARY_FULL', 'N3_LIBRARY_GRID', 'N3_FULL'] as const;

export type CoverSize = (typeof COVER_SIZES)[number];

const COVER_NAME = /^(.+) - (N3_[A-Z_]+)\.parsed$/;

const isCoverSize = (size: string): size is CoverSize =>
  (COVER_SIZES as readonly string[]).includes(size);

/** Splits a `.kobo-images` file name into its ImageId and size, or null for any other file. */
export function parseCoverName(name: string): { imageId: string; size: CoverSize } | null {
  const match = COVER_NAME.exec(name);
  if (!match?.[1] || !match[2] || !isCoverSize(match[2])) return null;
  return { imageId: match[1], size: match[2] };
}

/** Book ids per ImageId; books without one are left out. */
export function booksByImageId(highlights: readonly Highlight[]): Map<string, Set<string>> {
  const books = new Map<string, Set<string>>();
  for (const h of highlights) {
    if (!h.imageId) continue;
    const ids = books.get(h.imageId) ?? new Set<string>();
    ids.add(h.bookId);
    books.set(h.imageId, ids);
  }
  return books;
}

/** Candidate files per book id, preferred size first. */
export function matchCovers<T extends { name: string }>(
  files: Iterable<T>,
  highlights: readonly Highlight[],
): Map<string, T[]> {
  const books = booksByImageId(highlights);
  const found = new Map<string, { file: T; rank: number }[]>();
  for (const file of files) {
    const cover = parseCoverName(file.name);
    const ids = cover && books.get(cover.imageId);
    if (!cover || !ids) continue;
    for (const id of ids) {
      const list = found.get(id) ?? [];
      list.push({ file, rank: COVER_SIZES.indexOf(cover.size) });
      found.set(id, list);
    }
  }
  return new Map(
    [...found].map(([id, list]) => [id, list.sort((a, b) => a.rank - b.rank).map((c) => c.file)]),
  );
}

/** The image type of the bytes, from their signature, or null when they are not a JPEG or PNG. */
export function imageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, i) => bytes[i] === byte)) return 'image/png';
  return null;
}

/** Reads the best usable cover of each book; unreadable files and non-images are skipped. */
export async function readCovers(
  files: Iterable<File>,
  highlights: readonly Highlight[],
): Promise<Map<string, Blob>> {
  const covers = new Map<string, Blob>();
  // A file shared by two books, e.g. a duplicate, is read once.
  const read = new Map<File, Promise<Blob | null>>();
  const toBlob = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = imageType(bytes);
      return type ? new Blob([bytes], { type }) : null;
    } catch {
      return null;
    }
  };
  for (const [bookId, candidates] of matchCovers(files, highlights)) {
    for (const file of candidates) {
      let pending = read.get(file);
      if (!pending) {
        pending = toBlob(file);
        read.set(file, pending);
      }
      const blob = await pending;
      if (blob) {
        covers.set(bookId, blob);
        break;
      }
    }
  }
  return covers;
}
