// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildFixture, FIXTURES } from '../scripts/make-fixture';

type SqlJsStatic = initSqlJs.SqlJsStatic;
type Database = initSqlJs.Database;

const readFixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

const EXPORTED = "Type IN ('highlight', 'note')";

const EDGE_CASES: [string, string][] = [
  [
    'all four colours',
    `SELECT 1 FROM (SELECT COUNT(DISTINCT Color) AS n FROM Bookmark WHERE ${EXPORTED}) WHERE n = 4`,
  ],
  ['a note with an annotation', "SELECT 1 FROM Bookmark WHERE Type = 'note' AND Annotation <> ''"],
  ['a dogear without text', "SELECT 1 FROM Bookmark WHERE Type = 'dogear' AND Text IS NULL"],
  [
    'a markup with binary extra data',
    `SELECT 1 FROM Bookmark WHERE Type = 'markup' AND Text IS NULL
       AND typeof(ExtraAnnotationData) = 'blob'`,
  ],
  [
    'an #anchor chapter that resolves after stripping',
    `SELECT 1 FROM Bookmark b JOIN content c
       ON c.ContentID = substr(b.ContentID, 1, instr(b.ContentID, '#') - 1)
     WHERE instr(b.ContentID, '#') > 0 AND c.ContentType = '9'`,
  ],
  ['an empty chapter title', "SELECT 1 FROM content WHERE ContentType = '9' AND Title = ''"],
  ['a NULL chapter title', "SELECT 1 FROM content WHERE ContentType = '9' AND Title IS NULL"],
  ['trailing \\t\\n', `SELECT 1 FROM Bookmark WHERE Text LIKE '%' || char(9, 10)`],
  [
    'multiline text',
    `SELECT 1 FROM Bookmark WHERE ${EXPORTED} AND instr(trim(Text), char(10)) > 0`,
  ],
  [
    'formula-like prefixes',
    `SELECT 1 FROM (SELECT COUNT(DISTINCT substr(Text, 1, 1)) AS n FROM Bookmark
       WHERE ${EXPORTED} AND substr(Text, 1, 1) IN ('=', '-', '+', '@')) WHERE n = 4`,
  ],
  [
    'double quotes and semicolons',
    `SELECT 1 FROM Bookmark WHERE instr(Text || Annotation, '"') > 0
       AND instr(Text || Annotation, ';') > 0`,
  ],
  ['RTL text', `SELECT 1 FROM Bookmark WHERE Text GLOB '*[ء-ي]*'`],
  [
    'two annotated books with the same title and different authors',
    `SELECT 1 FROM content c WHERE ContentType = '6'
       AND EXISTS (SELECT 1 FROM Bookmark WHERE VolumeID = c.ContentID AND ${EXPORTED})
     GROUP BY Title HAVING COUNT(DISTINCT Attribution) > 1`,
  ],
  [
    'a duplicate book: same title and author, two volumes, identical highlights',
    `SELECT 1 FROM content a JOIN content b
       ON a.Title = b.Title AND a.Attribution = b.Attribution AND a.ContentID < b.ContentID
     WHERE a.ContentType = '6' AND b.ContentType = '6'
       AND EXISTS (SELECT 1 FROM Bookmark WHERE VolumeID = a.ContentID AND ${EXPORTED})
       AND NOT EXISTS (
         SELECT Text, Color FROM Bookmark WHERE VolumeID = a.ContentID AND ${EXPORTED}
         EXCEPT SELECT Text, Color FROM Bookmark WHERE VolumeID = b.ContentID AND ${EXPORTED})
       AND NOT EXISTS (
         SELECT Text, Color FROM Bookmark WHERE VolumeID = b.ContentID AND ${EXPORTED}
         EXCEPT SELECT Text, Color FROM Bookmark WHERE VolumeID = a.ContentID AND ${EXPORTED})`,
  ],
  [
    'highlights on both sides of UTC midnight',
    `SELECT 1 FROM (SELECT COUNT(DISTINCT substr(DateCreated, 12, 2)) AS n FROM Bookmark
       WHERE ${EXPORTED} AND substr(DateCreated, 12, 2) IN ('23', '00')) WHERE n = 2`,
  ],
  [
    'a store book with a UUID volume',
    `SELECT 1 FROM Bookmark WHERE VolumeID NOT LIKE 'file://%'
       AND VolumeID GLOB '????????-????-????-????-????????????'`,
  ],
  ['a hidden highlight', `SELECT 1 FROM Bookmark WHERE ${EXPORTED} AND Hidden = 'true'`],
  [
    'a soft hyphen and an NBSP',
    'SELECT 1 FROM Bookmark WHERE instr(Text, char(173)) > 0 AND instr(Text, char(160)) > 0',
  ],
  [
    'whitespace-only text',
    `SELECT 1 FROM Bookmark WHERE ${EXPORTED} AND trim(Text, ' ' || char(9, 10)) = ''`,
  ],
];

let SQL: SqlJsStatic;
let withColor: Database;
let noColor: Database;

beforeAll(async () => {
  SQL = await initSqlJs();
  withColor = new SQL.Database(readFixture('KoboReader.sqlite'));
  noColor = new SQL.Database(readFixture('KoboReader-nocolor.sqlite'));
});

afterAll(() => {
  withColor.close();
  noColor.close();
});

describe('synthetic fixture', () => {
  it.each(Object.entries(FIXTURES))('%s regenerates byte-identically', (name, options) => {
    expect(buildFixture(SQL, options)).toEqual(readFixture(name));
  });

  it.each(EDGE_CASES)('covers %s', (_, sql) => {
    expect(withColor.exec(sql)).not.toEqual([]);
  });

  it('has a variant without the Color column', () => {
    const [result] = noColor.exec("SELECT name FROM pragma_table_info('Bookmark')");
    expect(result?.values.flat()).toContain('Text');
    expect(result?.values.flat()).not.toContain('Color');
    const [rows] = noColor.exec(`SELECT COUNT(*) FROM Bookmark WHERE ${EXPORTED}`);
    expect(rows?.values[0]?.[0]).toBeGreaterThan(0);
  });
});
