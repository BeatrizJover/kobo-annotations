import { sortHighlights } from '../kobo/parse';
import type { KoboLibrary } from '../kobo/types';
import { mergeImport } from './merge';
import type { ImportRecord, SavedHighlight, SavedLibrary } from './types';

const DB_NAME = 'kobo-annotations';
const DB_VERSION = 2;
const HIGHLIGHTS = 'highlights';
const IMPORTS = 'imports';
const COVERS = 'covers';

interface CoverRecord {
  bookId: string;
  bytes: ArrayBuffer;
  type: string;
}

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
  /** Deletes one book's highlights and returns what is left; the last book takes the uploads too. */
  forgetBook(bookId: string): Promise<SavedLibrary>;
  /** Cover images per book id. */
  loadCovers(): Promise<Map<string, Blob>>;
  /** Adds or replaces the given books' covers and keeps the others. */
  saveCovers(covers: ReadonlyMap<string, Blob>): Promise<void>;
}

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

const completion = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // tx.error is still null while a failed request's error event bubbles up.
    tx.onerror = (event) =>
      reject(
        (event.target as IDBRequest | null)?.error ??
          tx.error ??
          new Error('IndexedDB transaction failed'),
      );
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

/** Wraps any failure as a `StoreError`, telling a full disk apart from other failures. */
export const toStoreError = (cause: unknown) =>
  cause instanceof StoreError
    ? cause
    : new StoreError(
        cause instanceof DOMException && cause.name === 'QuotaExceededError' ? 'full' : 'failed',
        { cause },
      );

function open(factory: IDBFactory, onClose: () => void): Promise<IDBDatabase> {
  const req = factory.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(HIGHLIGHTS)) {
      db.createObjectStore(HIGHLIGHTS, { keyPath: 'id' }).createIndex('bookId', 'bookId');
    }
    if (!db.objectStoreNames.contains(IMPORTS)) {
      db.createObjectStore(IMPORTS, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(COVERS)) {
      db.createObjectStore(COVERS, { keyPath: 'bookId' });
    }
  };
  const blocked = new Promise<never>((_, reject) => {
    req.onblocked = () => {
      // The open may still succeed later; nobody would own that connection.
      req.onsuccess = () => req.result.close();
      reject(new Error('IndexedDB upgrade blocked by another tab'));
    };
  });
  return Promise.race([request(req), blocked]).then((db) => {
    // Lets a newer version of the app, open in another tab, upgrade the schema.
    db.onversionchange = () => {
      db.close();
      onClose();
    };
    // Fires when the browser closes the connection, e.g. after the user clears site data.
    db.onclose = onClose;
    return db;
  });
}

/** Opens the store lazily on first use; `factory` defaults to the browser's `indexedDB`. */
export function createIdbStore(factory?: IDBFactory): HighlightStore {
  let connection: Promise<IDBDatabase> | undefined;

  // Drops a closed or failed connection so the next call reopens, unless a newer one replaced it.
  const forget = (stale: Promise<IDBDatabase>) => {
    if (connection === stale) connection = undefined;
  };

  const connect = () => {
    if (connection) return connection;
    const idb = factory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
    if (!idb) return Promise.reject(new StoreError('unavailable'));
    const current: Promise<IDBDatabase> = open(idb, () => forget(current)).catch(
      (cause: unknown) => {
        forget(current);
        throw new StoreError('unavailable', { cause });
      },
    );
    connection = current;
    return current;
  };

  async function run<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>) {
    const db = await connect();
    let tx: IDBTransaction;
    try {
      tx = db.transaction([HIGHLIGHTS, IMPORTS, COVERS], mode);
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
    // Highlights saved before covers existed have no imageId.
    highlights: (
      await request<(Omit<SavedHighlight, 'imageId'> & { imageId?: string })[]>(
        tx.objectStore(HIGHLIGHTS).getAll(),
      )
    ).map((h): SavedHighlight => ({ ...h, imageId: h.imageId ?? '' })),
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
          request(tx.objectStore(COVERS).clear()),
        ]);
      }),

    forgetBook: (bookId) =>
      run('readwrite', async (tx) => {
        const store = tx.objectStore(HIGHLIGHTS);
        const keys = await request(store.index('bookId').getAllKeys(bookId));
        await Promise.all([
          ...keys.map((key) => request(store.delete(key))),
          request(tx.objectStore(COVERS).delete(bookId)),
        ]);
        const { highlights, imports } = await readAll(tx);
        if (highlights.length === 0) {
          await Promise.all([
            request(tx.objectStore(IMPORTS).clear()),
            request(tx.objectStore(COVERS).clear()),
          ]);
          return { highlights, hasColor: false, imports: [] };
        }
        return {
          highlights: sortHighlights(highlights),
          hasColor: imports.some((i) => i.hasColor),
          imports,
        };
      }),

    loadCovers: () =>
      run('readonly', async (tx) => {
        const records = await request<CoverRecord[]>(tx.objectStore(COVERS).getAll());
        return new Map(records.map((r) => [r.bookId, new Blob([r.bytes], { type: r.type })]));
      }),

    saveCovers: async (covers) => {
      // Reading the blobs inside the transaction would let it commit before the writes.
      let records: CoverRecord[];
      try {
        records = await Promise.all(
          [...covers].map(async ([bookId, blob]) => ({
            bookId,
            bytes: await blob.arrayBuffer(),
            type: blob.type,
          })),
        );
      } catch (cause) {
        throw toStoreError(cause);
      }
      await run('readwrite', async (tx) => {
        const store = tx.objectStore(COVERS);
        await Promise.all(records.map((record) => request(store.put(record))));
      });
    },
  };
}
