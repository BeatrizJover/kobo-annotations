export type KoboErrorCode = 'not-sqlite' | 'not-kobo' | 'unreadable';

const MESSAGES: Record<KoboErrorCode, string> = {
  'not-sqlite': 'The file is not an SQLite database.',
  'not-kobo': 'The database is not a Kobo library.',
  unreadable: 'The database could not be read.',
};

/** A failure to read a Kobo database; messages never contain user data. */
export class KoboError extends Error {
  readonly code: KoboErrorCode;

  constructor(code: KoboErrorCode, options?: ErrorOptions) {
    super(MESSAGES[code], options);
    this.name = 'KoboError';
    this.code = code;
  }
}
