// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { forceCloseDatabase, IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseKobo } from '../../src/kobo/parse';
import type { Highlight, KoboLibrary } from '../../src/kobo/types';
import { createIdbStore, StoreError, toStoreError, type HighlightStore } from '../../src/store/db';

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

afterEach(() => {
  vi.restoreAllMocks();
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

  it('rolls back a save whose write fails after the merge', async () => {
    const before = await store.save(library);
    // Reuses import id 1, so the add fails asynchronously once the merge has returned.
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      return add.call(this, { ...(value as object), id: 1 }, key);
    });
    const error: unknown = await store.save(noColor).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StoreError);
    expect((error as StoreError).code).toBe('failed');
    expect((error as StoreError).cause).toMatchObject({ name: 'ConstraintError' });

    vi.restoreAllMocks();
    expect(await store.load()).toEqual(before);
  });

  it('tells a full disk apart from other failures', () => {
    expect(toStoreError(new DOMException('', 'QuotaExceededError')).code).toBe('full');
    expect(toStoreError(new DOMException('', 'AbortError')).code).toBe('failed');
    expect(toStoreError(new Error('boom')).code).toBe('failed');
    const unavailable = new StoreError('unavailable');
    expect(toStoreError(unavailable)).toBe(unavailable);
  });

  it('reopens after the browser closes the connection', async () => {
    const open = factory.open.bind(factory);
    const connections: IDBDatabase[] = [];
    vi.spyOn(factory, 'open').mockImplementation((name, version) => {
      const req = open(name, version);
      req.addEventListener('success', () => connections.push(req.result));
      return req;
    });
    const saved = await store.save(library);
    const [first] = connections;
    if (!first) throw new Error('no connection opened');
    // fake-indexeddb types the parameter as the class instead of an instance.
    forceCloseDatabase(first as unknown as typeof IDBDatabase);

    expect(await store.load()).toEqual(saved);
    expect(connections).toHaveLength(2);
  });

  it('lets another tab upgrade the schema, then reports itself unavailable', async () => {
    await store.save(library);
    const upgrade = factory.open('kobo-annotations', 2);
    const newer = await new Promise<IDBDatabase>((resolve, reject) => {
      upgrade.onsuccess = () => resolve(upgrade.result);
      upgrade.onerror = () => reject(upgrade.error ?? new Error('upgrade failed'));
      upgrade.onblocked = () => reject(new Error('blocked'));
    });
    newer.close();
    expect(await storeErrorCode(store.load())).toBe('unavailable');
  });

  it('reports a browser without IndexedDB as unavailable', async () => {
    expect(typeof indexedDB).toBe('undefined');
    expect(await storeErrorCode(createIdbStore().load())).toBe('unavailable');
  });
});
