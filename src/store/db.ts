import { sortHighlights } from '../kobo/parse';
import type { KoboLibrary } from '../kobo/types';
import { mergeImport } from './merge';
import type { ImportRecord, SavedHighlight, SavedLibrary } from './types';

const DB_NAME = 'kobo-annotations';
const DB_VERSION = 1;
const HIGHLIGHTS = 'highlights';
const IMPORTS = 'imports';

export type StoreErrorCode = 'unavailable' | 'full' | 'failed';

/** A storage failure that carries only a code, never user data. */
export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, options?: ErrorOptions) {
    super(`Storage failed: ${code}`, options);
    this.name = 'StoreError';
    this.code = code;
  }
}

/** Highlights saved in this browser across uploads; every method rejects with a `StoreError`. */
export interface HighlightStore {
  load(): Promise<SavedLibrary>;
  /** Merges an upload into the saved highlights and returns the result. */
  save(library: KoboLibrary): Promise<SavedLibrary>;
  clear(): Promise<void>;
}

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

const completion = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

const toStoreError = (cause: unknown) =>
  cause instanceof StoreError
    ? cause
    : new StoreError(
        cause instanceof DOMException && cause.name === 'QuotaExceededError' ? 'full' : 'failed',
        { cause },
      );

function open(factory: IDBFactory): Promise<IDBDatabase> {
  const req = factory.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(HIGHLIGHTS)) {
      db.createObjectStore(HIGHLIGHTS, { keyPath: 'id' }).createIndex('bookId', 'bookId');
    }
    if (!db.objectStoreNames.contains(IMPORTS)) {
      db.createObjectStore(IMPORTS, { keyPath: 'id' });
    }
  };
  return request(req).then((db) => {
    // Lets a newer version of the app, open in another tab, upgrade the schema.
    db.onversionchange = () => db.close();
    return db;
  });
}

/** Opens the store lazily on first use; `factory` defaults to the browser's `indexedDB`. */
export function createIdbStore(factory?: IDBFactory): HighlightStore {
  let connection: Promise<IDBDatabase> | undefined;

  const connect = () => {
    const idb = factory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
    if (!idb) return Promise.reject(new StoreError('unavailable'));
    connection ??= open(idb).catch((cause: unknown) => {
      connection = undefined;
      throw new StoreError('unavailable', { cause });
    });
    return connection;
  };

  async function run<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>) {
    const db = await connect();
    let tx: IDBTransaction;
    try {
      tx = db.transaction([HIGHLIGHTS, IMPORTS], mode);
    } catch (cause) {
      throw toStoreError(cause);
    }
    const done = completion(tx);
    try {
      const result = await work(tx);
      await done;
      return result;
    } catch (cause) {
      done.catch(() => undefined);
      try {
        tx.abort();
      } catch {
        // Already finished or aborted.
      }
      throw toStoreError(cause);
    }
  }

  const readAll = async (tx: IDBTransaction) => ({
    highlights: await request<SavedHighlight[]>(tx.objectStore(HIGHLIGHTS).getAll()),
    imports: await request<ImportRecord[]>(tx.objectStore(IMPORTS).getAll()),
  });

  return {
    load: () =>
      run('readonly', async (tx) => {
        const { highlights, imports } = await readAll(tx);
        return {
          highlights: sortHighlights(highlights),
          hasColor: imports.some((i) => i.hasColor),
          imports,
        };
      }),

    save: (library) =>
      run('readwrite', async (tx) => {
        const saved = await readAll(tx);
        const id = (saved.imports.at(-1)?.id ?? 0) + 1;
        const { highlights, added, removed } = mergeImport(
          saved.highlights,
          library.highlights,
          id,
        );
        const record: ImportRecord = {
          id,
          at: new Date().toISOString(),
          hasColor: library.hasColor,
          total: library.highlights.length,
          added,
          removed,
        };
        const store = tx.objectStore(HIGHLIGHTS);
        for (const h of highlights) store.put(h);
        tx.objectStore(IMPORTS).add(record);
        const imports = [...saved.imports, record];
        return { highlights, hasColor: imports.some((i) => i.hasColor), imports };
      }),

    clear: () =>
      run('readwrite', async (tx) => {
        await Promise.all([
          request(tx.objectStore(HIGHLIGHTS).clear()),
          request(tx.objectStore(IMPORTS).clear()),
        ]);
      }),
  };
}
