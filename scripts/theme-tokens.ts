/// <reference types="node" />
import { readFileSync } from 'node:fs';

const THEME = readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8');

/** Reads a hex colour token from `src/styles/theme.css`, so build assets share the app palette. */
export function themeColor(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(THEME);
  if (!match?.[1]) throw new Error(`theme.css has no hex colour token --${name}`);
  return match[1];
}
