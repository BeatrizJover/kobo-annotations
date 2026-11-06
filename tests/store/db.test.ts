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

  it('forgets one book and keeps the rest and the uploads', async () => {
    await store.save(library);
    const gone = library.highlights[0]?.bookId;
    const left = await store.forgetBook(gone ?? '');

    expect(ids(left.highlights)).toEqual(ids(library.highlights.filter((h) => h.bookId !== gone)));
    expect(left.imports).toHaveLength(1);
    expect(left.hasColor).toBe(true);
    expect(await createIdbStore(factory).load()).toEqual(left);
  });

  it('drops the uploads too when the last book is forgotten', async () => {
    await store.save(library);
    let left = await store.load();
    for (const id of new Set(library.highlights.map((h) => h.bookId))) {
      left = await store.forgetBook(id);
    }
    expect(left).toEqual(EMPTY);
    expect(await store.load()).toEqual(EMPTY);
    expect((await store.save(library)).imports[0]?.id).toBe(1);
  });

  it('leaves the store untouched when forgetting an unknown book', async () => {
    const saved = await store.save(library);
    expect(await store.forgetBook('missing-volume')).toEqual(saved);
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

    // Undo the broken add before reading back what was saved.
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
    const upgrade = factory.open('kobo-annotations', 3);
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

describe('createIdbStore covers', () => {
  const jpeg = (marker: number) =>
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, marker])], { type: 'image/jpeg' });
  const bytesOf = async (covers: Map<string, Blob>) =>
    new Map(
      await Promise.all(
        [...covers].map(
          async ([id, blob]) =>
            [id, [blob.type, ...new Uint8Array(await blob.arrayBuffer())]] as const,
        ),
      ),
    );
  const bookIds = () => [...new Set(library.highlights.map((h) => h.bookId))];

  it('saves covers, replaces them per book and loads them from a new connection', async () => {
    const [first = '', second = ''] = bookIds();
    await store.saveCovers(new Map([[first, jpeg(1)]]));
    await store.saveCovers(
      new Map([
        [first, jpeg(2)],
        [second, jpeg(3)],
      ]),
    );
    expect(await bytesOf(await createIdbStore(factory).loadCovers())).toEqual(
      new Map([
        [first, ['image/jpeg', 0xff, 0xd8, 0xff, 2]],
        [second, ['image/jpeg', 0xff, 0xd8, 0xff, 3]],
      ]),
    );
  });

  it('clears covers with the saved data', async () => {
    await store.save(library);
    await store.saveCovers(new Map(bookIds().map((id) => [id, jpeg(1)])));
    await store.clear();
    expect((await store.loadCovers()).size).toBe(0);
  });

  it("forgets a book's cover with the book", async () => {
    await store.save(library);
    const [gone = '', kept = ''] = bookIds();
    await store.saveCovers(
      new Map([
        [gone, jpeg(1)],
        [kept, jpeg(2)],
      ]),
    );
    await store.forgetBook(gone);
    expect([...(await store.loadCovers()).keys()]).toEqual([kept]);
  });

  it('drops every cover when the last book is forgotten', async () => {
    const [only = ''] = bookIds();
    await store.save({
      ...library,
      highlights: library.highlights.filter((h) => h.bookId === only),
    });
    await store.saveCovers(
      new Map([
        [only, jpeg(1)],
        ['orphan', jpeg(2)],
      ]),
    );
    await store.forgetBook(only);
    expect((await store.loadCovers()).size).toBe(0);
  });

  it('reports a cover that cannot be read as a failure and saves none', async () => {
    const [first = '', second = ''] = bookIds();
    const broken = Object.assign(jpeg(1), { arrayBuffer: () => Promise.reject(new Error('gone')) });
    const result = store.saveCovers(
      new Map([
        [first, jpeg(2)],
        [second, broken],
      ]),
    );
    expect(await storeErrorCode(result)).toBe('failed');
    expect((await store.loadCovers()).size).toBe(0);
  });

  it('keeps the highlights of a version 1 database when adding the covers store', async () => {
    const v1 = factory.open('kobo-annotations', 1);
    v1.onupgradeneeded = () => {
      v1.result.createObjectStore('highlights', { keyPath: 'id' }).createIndex('bookId', 'bookId');
      v1.result.createObjectStore('imports', { keyPath: 'id' });
      v1.transaction?.objectStore('highlights').put({
        ...library.highlights[0],
        imageId: undefined,
        firstSeen: 1,
        lastSeen: 1,
        onDevice: true,
      });
    };
    await new Promise((resolve, reject) => {
      v1.onsuccess = () => {
        v1.result.close();
        resolve(undefined);
      };
      v1.onerror = () => reject(v1.error ?? new Error('open failed'));
    });
    const [loaded] = (await store.load()).highlights;
    expect(loaded?.id).toBe(library.highlights[0]?.id);
    expect(loaded?.imageId).toBe('');
    expect((await store.loadCovers()).size).toBe(0);
  });
});
