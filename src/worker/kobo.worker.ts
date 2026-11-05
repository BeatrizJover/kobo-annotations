import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { KoboError } from '../kobo/errors';
import { parseKobo } from '../kobo/parse';
import type { WorkerRequest, WorkerResponse } from './protocol';

const post = (message: WorkerResponse) => self.postMessage(message);

let engine: Promise<SqlJsStatic> | undefined;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  post({ kind: 'phase', phase: 'starting' });
  try {
    engine ??= initSqlJs({ locateFile: () => wasmUrl });
    const SQL = await engine.catch((error: unknown) => {
      engine = undefined;
      throw error;
    });
    post({ kind: 'phase', phase: 'parsing' });
    post({ kind: 'done', library: parseKobo(SQL, new Uint8Array(event.data.buffer)) });
  } catch (error) {
    post({ kind: 'error', code: error instanceof KoboError ? error.code : 'unexpected' });
  }
};
