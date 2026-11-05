import type { SqlValue } from 'sql.js';

export type Cell = SqlValue | undefined;

const SOFT_HYPHEN = /\u00AD/g;

export const text = (value: Cell): string => (typeof value === 'string' ? value : '');

export const num = (value: Cell, fallback: number): number =>
  typeof value === 'number' ? value : fallback;

export const clean = (value: Cell): string => text(value).replace(SOFT_HYPHEN, '').trim();
