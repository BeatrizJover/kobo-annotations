// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseKobo } from '../../src/kobo/parse';
import type { Highlight, KoboLibrary } from '../../src/kobo/types';
import { createIdbStore, StoreError, type HighlightStore } from '../../src/store/db';

let library: KoboLibrary;
let noColor: KoboLibrary;
let factory: IDBFactory;
let store: HighlightStore;

beforeAll(async () => {
  const SQL = await initSqlJs();
  const read = (name: string) =>
    new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
  library = parseKobo(SQL, read('KoboReader.sqlite'));
  noColor = parseKobo(SQL, read('KoboReader-nocolor.sqlite'));
});

beforeEach(() => {
  factory = new IDBFactory();
  store = createIdbStore(factory);
});

const EMPTY = { highlights: [], hasColor: false, imports: [] };
const ids = (list: readonly { id: string }[]) => list.map((h) => h.id);

async function storeErrorCode(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(StoreError);
  return (error as StoreError).code;
}

describe('createIdbStore', () => {
  it('starts empty', async () => {
    expect(await store.load()).toEqual(EMPTY);
  });

  it('saves an upload and loads it back in export order from a new connection', async () => {
    const total = library.highlights.length;
    const saved = await store.save(library);
    expect(ids(saved.highlights)).toEqual(ids(library.highlights));
    expect(saved.imports).toMatchObject([
      { id: 1, hasColor: true, total, added: total, removed: 0 },
    ]);
    expect(await createIdbStore(factory).load()).toEqual(saved);
  });

  it('merges later uploads and keeps what left the device', async () => {
    await store.save(library);
    const gone = library.highlights[0]?.bookId;
    const rest = library.highlights.filter((h) => h.bookId !== gone);
    const saved = await store.save({ ...library, highlights: rest });

    expect(saved.imports.map((i) => i.id)).toEqual([1, 2]);
    expect(saved.imports[1]).toMatchObject({
      added: 0,
      removed: library.highlights.length - rest.length,
    });
    expect(ids(saved.highlights)).toEqual(ids(library.highlights));
    const offDevice = saved.highlights.filter((h) => !h.onDevice);
    expect(offDevice.length).toBeGreaterThan(0);
    expect(offDevice.every((h) => h.bookId === gone)).toBe(true);
    expect(await store.load()).toEqual(saved);
  });

  it('remembers colour support from any upload', async () => {
    await store.save(library);
    expect((await store.save(noColor)).hasColor).toBe(true);
    await store.clear();
    expect((await store.save(noColor)).hasColor).toBe(false);
  });

  it('clears every saved highlight and upload', async () => {
    await store.save(library);
    await store.clear();
    expect(await store.load()).toEqual(EMPTY);
    expect((await store.save(library)).imports[0]?.id).toBe(1);
  });

  it('rolls back a failed save', async () => {
    const before = await store.save(library);
    const broken = { ...library.highlights[0], id: undefined } as unknown as Highlight;
    expect(await storeErrorCode(store.save({ ...library, highlights: [broken] }))).toBe('failed');
    expect(await store.load()).toEqual(before);
  });

  it('reports a browser without IndexedDB as unavailable', async () => {
    expect(typeof indexedDB).toBe('undefined');
    expect(await storeErrorCode(createIdbStore().load())).toBe('unavailable');
  });
});
