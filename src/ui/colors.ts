import type { Color, Highlight, KoboLibrary } from '../kobo/types';

export const COLOR_LABELS: Record<Color, string> = {
  yellow: 'Yellow',
  pink: 'Pink',
  blue: 'Blue',
  green: 'Green',
};

export function countByColor(highlights: readonly Highlight[]): Record<Color, number> {
  const counts: Record<Color, number> = { yellow: 0, pink: 0, blue: 0, green: 0 };
  for (const h of highlights) if (h.color) counts[h.color]++;
  return counts;
}

// Devices without colour support store every highlight as yellow, so a lone yellow means no colours.
export const usesColors = ({ hasColor, highlights }: KoboLibrary) =>
  hasColor && highlights.some((h) => h.color !== null && h.color !== 'yellow');
