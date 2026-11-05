import type { KoboErrorCode } from '../kobo/errors';
import type { KoboLibrary } from '../kobo/types';

/** Loading steps shown to the user; `reading` runs on the main thread. */
export type Phase = 'reading' | 'starting' | 'parsing';

export type LoadErrorCode = KoboErrorCode | 'unexpected';

export interface WorkerRequest {
  buffer: ArrayBuffer;
}

export type WorkerResponse =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'done'; library: KoboLibrary }
  | { kind: 'error'; code: LoadErrorCode };

/** Reads a KoboReader.sqlite file, reporting each phase; rejects with a `LoadError`. */
export type LoadLibrary = (file: File, onPhase: (phase: Phase) => void) => Promise<KoboLibrary>;

/** A load failure that carries only a code, never user data. */
export class LoadError extends Error {
  readonly code: LoadErrorCode;

  constructor(code: LoadErrorCode) {
    super(`Load failed: ${code}`);
    this.name = 'LoadError';
    this.code = code;
  }
}
