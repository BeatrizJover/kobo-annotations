// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { KoboError, type KoboErrorCode } from '../../src/kobo/errors';
import { parseKobo } from '../../src/kobo/parse';
import type { Highlight, KoboLibrary } from '../../src/kobo/types';

type SqlJsStatic = initSqlJs.SqlJsStatic;

const STORE_ID = '0b7e4c2a-5d1f-4e8a-9c3b-6a2d8f1e0c47';

const readFixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

let SQL: SqlJsStatic;
let library: KoboLibrary;
let noColor: KoboLibrary;

const find = (start: string): Highlight => {
  const found = library.highlights.find((h) => h.text.startsWith(start));
  if (!found) throw new Error(`No highlight starts with "${start}"`);
  return found;
};

function withSql(bytes: Uint8Array, sql: string): Uint8Array {
  const db = new SQL.Database(bytes);
  db.run(sql);
  const out = db.export();
  db.close();
  return out;
}

function errorCode(run: () => unknown): KoboErrorCode | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof KoboError) return error.code;
    throw error;
  }
  return undefined;
}

beforeAll(async () => {
  SQL = await initSqlJs();
  library = parseKobo(SQL, readFixture('KoboReader.sqlite'));
  noColor = parseKobo(SQL, readFixture('KoboReader-nocolor.sqlite'));
});

describe('parseKobo rows', () => {
  it('keeps visible highlights and notes with text only', () => {
    const texts = library.highlights.map((h) => h.text);
    expect(texts).toHaveLength(15);
    expect(texts).not.toContain('This highlight was deleted on the device.');
    expect(texts.every((t) => t.trim() !== '')).toBe(true);
    expect(new Set(library.highlights.map((h) => h.type))).toEqual(new Set(['highlight', 'note']));
  });

  it('orders by book, chapter, progress and creation date', () => {
    const orchard = library.highlights
      .filter((h) => h.book === 'The Glass Orchard')
      .map((h) => h.text.slice(0, 12));
    expect(orchard).toEqual([
      'She counted ',
      'The orchard ',
      '"Nothing bre',
      'First line o',
      'The wind car',
      'Light bends ',
    ]);
    const books = [...new Set(library.highlights.map((h) => `${h.book} / ${h.author}`))];
    expect(books).toEqual([
      'El Faro Apagado / Eva Rumbo',
      'Shared Title / Bo Lantern, Cy Marsh',
      'Shared Title / Dee Harrow',
      'The Glass Orchard / Ada Quill',
      'كتاب تجريبي / مؤلف مجهول',
    ]);
  });

  it('cleans text and notes', () => {
    expect(find('The wind').text).toBe('The wind carried seeds across the frozen river.');
    expect(find('Leading space').text).toBe('Leading space, softhyphen and a non breaking space.');
    expect(find('First line').text).toBe(
      'First line of the verse.\nSecond line of the verse.\nThird line.',
    );
    expect(find('Light bends').note).toBe('Compare with the opening scene.\nCheck later.');
    expect(find('Some firmware').note).toBe('');
    expect(find('The orchard').note).toBe('');
  });

  it('resolves chapters, including #anchor ContentIDs', () => {
    expect(find('"Nothing breaks').chapterIndex).toBe(1);
    expect(find('"Nothing breaks').chapter).toBe('');
    expect(find('The wind').chapter).toBe('Frost');
    expect(find('El faro').chapter).toBe('');
    expect(find('Nadie').chapter).toBe('Medianoche');
  });

  it('maps colours by name', () => {
    expect(library.hasColor).toBe(true);
    expect(find('The orchard').color).toBe('yellow');
    expect(find('She counted').color).toBe('pink');
    expect(find('"Nothing breaks').color).toBe('blue');
    expect(find('The wind').color).toBe('green');
  });

  it('returns creation dates as UTC ISO strings', () => {
    expect(find('El faro').created).toBe('2025-12-31T23:45:10.000Z');
    expect(find('Nadie').created).toBe('2026-01-01T00:15:00.000Z');
  });

  it('keeps notes typed as notes', () => {
    expect(find('Nadie').type).toBe('note');
    expect(find('Nadie').note).toBe('Nota: revisar; "comillas" incluidas.');
  });
});

describe('parseKobo books', () => {
  it('keeps the store copy of a duplicate book', () => {
    const faro = new Set(
      library.highlights.filter((h) => h.book === 'El Faro Apagado').map((h) => h.bookId),
    );
    expect(faro).toEqual(new Set([STORE_ID]));
  });

  it('keeps books that share only a title', () => {
    const shared = new Set(
      library.highlights.filter((h) => h.book === 'Shared Title').map((h) => h.bookId),
    );
    expect(shared.size).toBe(2);
  });
});

describe('parseKobo unusual values', () => {
  const byText = (rows: Highlight[], start: string) => rows.find((h) => h.text.startsWith(start));

  it('normalises dates that carry a zone and blanks missing or invalid ones', () => {
    const bytes = withSql(
      readFixture('KoboReader.sqlite'),
      `UPDATE Bookmark SET DateCreated = '2025-03-01T09:20:00Z' WHERE Text LIKE 'She counted%';
       UPDATE Bookmark SET DateCreated = '2025-03-01T09:26:53+02:00' WHERE Text LIKE 'The orchard%';
       UPDATE Bookmark SET DateCreated = 'garbage' WHERE Text LIKE 'The wind%';
       UPDATE Bookmark SET DateCreated = NULL WHERE Text LIKE 'First line%';`,
    );
    const { highlights } = parseKobo(SQL, bytes);
    expect(byText(highlights, 'She counted')?.created).toBe('2025-03-01T09:20:00.000Z');
    expect(byText(highlights, 'The orchard')?.created).toBe('2025-03-01T07:26:53.000Z');
    expect(byText(highlights, 'The wind')?.created).toBe('');
    expect(byText(highlights, 'First line')?.created).toBe('');
  });

  it('returns null for an unknown colour value', () => {
    const bytes = withSql(
      readFixture('KoboReader.sqlite'),
      "UPDATE Bookmark SET Color = 7 WHERE Text LIKE 'The orchard%'",
    );
    expect(byText(parseKobo(SQL, bytes).highlights, 'The orchard')?.color).toBeNull();
  });

  it('keeps a highlight whose chapter cannot be resolved', () => {
    const bytes = withSql(
      readFixture('KoboReader.sqlite'),
      "UPDATE Bookmark SET ContentID = 'missing#anchor' WHERE Text LIKE 'The wind%'",
    );
    const wind = byText(parseKobo(SQL, bytes).highlights, 'The wind');
    expect(wind?.chapterIndex).toBe(-1);
    expect(wind?.chapter).toBe('');
  });
});

describe('parseKobo without a Color column', () => {
  it('reports no colour support and the same rows', () => {
    expect(noColor.hasColor).toBe(false);
    expect(noColor.highlights.every((h) => h.color === null)).toBe(true);
    expect(noColor.highlights.map((h) => h.text)).toEqual(library.highlights.map((h) => h.text));
  });
});

describe('parseKobo validation', () => {
  it('rejects files that are not SQLite', () => {
    expect(errorCode(() => parseKobo(SQL, new Uint8Array()))).toBe('not-sqlite');
    expect(errorCode(() => parseKobo(SQL, new TextEncoder().encode('Book;Author\n')))).toBe(
      'not-sqlite',
    );
  });

  it('rejects SQLite databases that are not a Kobo library', () => {
    const db = new SQL.Database();
    db.run('CREATE TABLE notes (id INTEGER)');
    const bytes = db.export();
    db.close();
    expect(errorCode(() => parseKobo(SQL, bytes))).toBe('not-kobo');
  });

  it('rejects a Bookmark table missing a required column', () => {
    const bytes = withSql(
      readFixture('KoboReader.sqlite'),
      'ALTER TABLE Bookmark DROP COLUMN Text',
    );
    expect(errorCode(() => parseKobo(SQL, bytes))).toBe('not-kobo');
  });

  it('reports a corrupt database as unreadable', () => {
    const bytes = readFixture('KoboReader.sqlite').slice(0, 2048);
    bytes.fill(0xff, 100);
    expect(errorCode(() => parseKobo(SQL, bytes))).toBe('unreadable');
  });

  it('returns no highlights for an empty library', () => {
    const bytes = withSql(readFixture('KoboReader.sqlite'), 'DELETE FROM Bookmark');
    expect(parseKobo(SQL, bytes)).toEqual({ highlights: [], hasColor: true });
  });

  it('keeps error messages free of file content', () => {
    expect.assertions(1);
    try {
      parseKobo(SQL, new TextEncoder().encode('secret highlight text'));
    } catch (error) {
      expect((error as Error).message).not.toContain('secret');
    }
  });
});
