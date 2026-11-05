import { COLORS, type Color, type Highlight } from '../kobo/types';

export interface ExportFilter {
  /** Colours to keep; omit on devices without colours to skip colour filtering. */
  colors?: readonly Color[];
  notesOnly: boolean;
}

const BOM = '\uFEFF';
const CRLF = '\r\n';
const HEADER = [
  'Book',
  'Author',
  'Chapter No',
  'Chapter',
  'Highlight',
  'Note',
  'Color',
  'Date',
  'Time',
];
const FORMULA_START = /^[=+\-@\t\r]/;

const pad = (value: number) => String(value).padStart(2, '0');

const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Splits an ISO UTC timestamp into local `YYYY-MM-DD` and `HH:MM`, both '' when it is empty. */
export function formatLocal(iso: string): [date: string, time: string] {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return ['', ''];
  return [localDate(date), `${pad(date.getHours())}:${pad(date.getMinutes())}`];
}

export function csvFilename(date: Date = new Date()): string {
  return `kobo-highlights-${localDate(date)}.csv`;
}

// Rows with an unknown colour only survive while every colour is selected, so nothing is lost by default.
export function filterHighlights(
  highlights: readonly Highlight[],
  filter: ExportFilter,
): Highlight[] {
  const selected = filter.colors ? new Set(filter.colors) : undefined;
  const allColors = !selected || COLORS.every((color) => selected.has(color));
  return highlights.filter(
    (h) =>
      (!filter.notesOnly || h.note !== '') &&
      (h.color === null ? allColors : !selected || selected.has(h.color)),
  );
}

// The leading apostrophe stops Excel from evaluating the field as a formula.
function field(value: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}

const row = (values: readonly string[]) => values.map(field).join(';') + CRLF;

/** Builds the CSV text, BOM included, for the highlights that pass the filter. */
export function toCsv(highlights: readonly Highlight[], filter: ExportFilter): string {
  const rows = filterHighlights(highlights, filter).map((h) =>
    row([
      h.book,
      h.author,
      h.chapterNo === null ? '' : String(h.chapterNo),
      h.chapter,
      h.text,
      h.note,
      h.color ?? '',
      ...formatLocal(h.created),
    ]),
  );
  return BOM + row(HEADER) + rows.join('');
}
