// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { csvFilename, filterHighlights, formatLocal, toCsv } from '../../src/export/csv';
import { parseKobo } from '../../src/kobo/parse';
import { COLORS, type Highlight } from '../../src/kobo/types';

const HEADER =
  '"Book";"Author";"Chapter No";"Chapter";"Highlight";"Note";"Color";"Date";"Time"\r\n';
const ALL = [...COLORS];
const NO_FILTER = { notesOnly: false };

let id = 0;
const make = (overrides: Partial<Highlight> = {}): Highlight => ({
  id: `bm-${++id}`,
  bookId: 'file:///mnt/onboard/book.epub',
  book: 'A Book',
  author: 'An Author',
  imageId: '',
  chapter: 'One',
  chapterNo: 3,
  chapterIndex: 0,
  progress: 0,
  type: 'highlight',
  text: 'Some text.',
  note: '',
  color: 'yellow',
  created: '2026-01-15T09:00:00.000Z',
  ...overrides,
});

const body = (csv: string) => csv.slice(1 + HEADER.length);
const texts = (list: Highlight[]) => list.map((h) => h.text);

const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Madrid';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('toCsv', () => {
  it('starts with a UTF-8 BOM and the header row', () => {
    const bytes = new TextEncoder().encode(toCsv([], NO_FILTER));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(HEADER);
  });

  it('quotes every field, joins with ; and ends rows with CRLF', () => {
    const csv = toCsv([make({ note: 'A note.', color: 'blue' })], NO_FILTER);
    expect(body(csv)).toBe(
      '"A Book";"An Author";"3";"One";"Some text.";"A note.";"blue";"2026-01-15";"10:00"\r\n',
    );
  });

  it('doubles inner quotes and keeps ; and newlines inside the field', () => {
    const csv = toCsv([make({ text: 'He said "go; now"\nand left.' })], NO_FILTER);
    expect(body(csv)).toContain('"He said ""go; now""\nand left."');
  });

  it.each(['=', '+', '-', '@', '\t', '\r'])('guards fields starting with %j', (start) => {
    const csv = toCsv(
      [make({ book: `${start}x`, text: `${start}1`, note: `${start}2` })],
      NO_FILTER,
    );
    expect(body(csv).startsWith(`"'${start}x";`)).toBe(true);
    expect(body(csv)).toContain(`"'${start}1";"'${start}2"`);
  });

  it('does not guard a formula character in the middle of a field', () => {
    expect(body(toCsv([make({ text: 'a = b' })], NO_FILTER))).toContain('"a = b"');
  });

  it('writes an empty Color for unknown colours and empty Date and Time for missing dates', () => {
    const csv = toCsv([make({ color: null, created: '' })], NO_FILTER);
    expect(body(csv)).toMatch(/;"";"";""\r\n$/);
  });

  it('writes empty Chapter No and Chapter for unresolved chapters', () => {
    const csv = toCsv([make({ chapter: '', chapterNo: null })], NO_FILTER);
    expect(body(csv).startsWith('"A Book";"An Author";"";"";"Some text."')).toBe(true);
  });

  it('keeps NBSP and right-to-left text unchanged', () => {
    const text = 'قال\u00A0المعلم';
    expect(body(toCsv([make({ text })], NO_FILTER))).toContain(`"${text}"`);
  });

  it('keeps the input order', () => {
    const list = [make({ text: 'b' }), make({ text: 'a' })];
    expect(body(toCsv(list, NO_FILTER))).toMatch(/"b".*\r\n.*"a"/s);
  });
});

describe('filterHighlights', () => {
  const list = [
    make({ text: 'y', color: 'yellow' }),
    make({ text: 'p', color: 'pink', note: 'n' }),
    make({ text: 'b', color: 'blue' }),
    make({ text: 'g', color: 'green', type: 'note', note: 'n' }),
    make({ text: 'u', color: null }),
  ];

  it('keeps everything without a colour filter', () => {
    expect(texts(filterHighlights(list, NO_FILTER))).toEqual(['y', 'p', 'b', 'g', 'u']);
  });

  it('keeps unknown colours while every colour is selected', () => {
    expect(texts(filterHighlights(list, { colors: ALL, notesOnly: false }))).toEqual([
      'y',
      'p',
      'b',
      'g',
      'u',
    ]);
  });

  it('keeps only the selected colours and drops unknown ones', () => {
    expect(texts(filterHighlights(list, { colors: ['pink', 'green'], notesOnly: false }))).toEqual([
      'p',
      'g',
    ]);
  });

  it('keeps nothing when no colour is selected', () => {
    expect(filterHighlights(list, { colors: [], notesOnly: false })).toEqual([]);
  });

  it('keeps only rows with a note when notesOnly is set', () => {
    expect(texts(filterHighlights(list, { notesOnly: true }))).toEqual(['p', 'g']);
    expect(texts(filterHighlights(list, { colors: ['green'], notesOnly: true }))).toEqual(['g']);
  });

  it('applies the filter in toCsv', () => {
    const csv = toCsv(list, { colors: ['blue'], notesOnly: false });
    expect(body(csv).split('\r\n')).toHaveLength(2);
    expect(body(csv)).toContain('"b";"";"blue"');
  });
});

describe('formatLocal', () => {
  it('converts UTC to local time, across DST and midnight', () => {
    expect(formatLocal('2026-07-01T10:05:00.000Z')).toEqual(['2026-07-01', '12:05']);
    expect(formatLocal('2026-01-15T23:30:59.000Z')).toEqual(['2026-01-16', '00:30']);
  });

  it('returns empty strings for empty or invalid input', () => {
    expect(formatLocal('')).toEqual(['', '']);
    expect(formatLocal('not a date')).toEqual(['', '']);
  });
});

describe('csvFilename', () => {
  it('uses the local date', () => {
    expect(csvFilename(new Date('2026-03-04T23:30:00.000Z'))).toBe(
      'kobo-highlights-2026-03-05.csv',
    );
  });
});

describe('fixture export', () => {
  it('writes one CSV record per parsed highlight', async () => {
    const SQL = await initSqlJs();
    const bytes = new Uint8Array(
      readFileSync(new URL('../fixtures/KoboReader.sqlite', import.meta.url)),
    );
    const { highlights } = parseKobo(SQL, bytes);
    expect(highlights.some((h) => `${h.text}${h.note}`.includes('\r'))).toBe(false);
    const csv = toCsv(highlights, { colors: ALL, notesOnly: false });
    expect(csv.startsWith(`\uFEFF${HEADER}`)).toBe(true);
    expect(body(csv).split('\r\n').slice(0, -1)).toHaveLength(highlights.length);
    expect(csv).toContain(`"'=SUM(A1:A3) is not a formula here."`);
    expect(csv).not.toMatch(/\.x?html/);
  });
});
