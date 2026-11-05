import { sortHighlights } from '../kobo/parse';
import type { Highlight } from '../kobo/types';
import type { SavedHighlight } from './types';

export interface MergeResult {
  highlights: SavedHighlight[];
  added: number;
  removed: number;
}

/**
 * Merges an upload into the saved highlights by BookmarkID: the upload wins for every highlight it
 * contains, and saved ones it lacks are kept but marked as no longer on the device.
 */
export function mergeImport(
  saved: readonly SavedHighlight[],
  incoming: readonly Highlight[],
  importId: number,
): MergeResult {
  const previous = new Map(saved.map((h) => [h.id, h]));
  let added = 0;
  const merged = incoming.map((h): SavedHighlight => {
    const before = previous.get(h.id);
    previous.delete(h.id);
    if (!before) added++;
    return { ...h, firstSeen: before?.firstSeen ?? importId, lastSeen: importId, onDevice: true };
  });

  let removed = 0;
  for (const h of previous.values()) {
    if (h.onDevice) removed++;
    merged.push(h.onDevice ? { ...h, onDevice: false } : h);
  }
  return { highlights: sortHighlights(merged), added, removed };
}
