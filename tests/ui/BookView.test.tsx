/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseKobo } from '../../src/kobo/parse';
import type { Highlight, KoboLibrary } from '../../src/kobo/types';
import { BookView } from '../../src/ui/BookView';

let library: KoboLibrary;
let noColor: KoboLibrary;

beforeAll(async () => {
  const SQL = await initSqlJs();
  // happy-dom gives import.meta.url an http scheme, so the path is relative to the project root.
  const read = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));
  library = parseKobo(SQL, read('KoboReader.sqlite'));
  noColor = parseKobo(SQL, read('KoboReader-nocolor.sqlite'));
});

afterEach(cleanup);

// Two fixture books share a title, so a VolumeID fragment can pick one of them.
const bookOf = (lib: KoboLibrary, title: string, volume = '') => {
  const found = lib.highlights.find((h) => h.book === title && h.bookId.includes(volume));
  if (!found) throw new Error(`fixture book missing: ${title}`);
  return found.bookId;
};

const rowsOf = (lib: KoboLibrary, bookId: string) =>
  lib.highlights.filter((h) => h.bookId === bookId);

function show(lib: KoboLibrary, bookId: string, onBack = vi.fn()) {
  render(<BookView library={lib} bookId={bookId} onBack={onBack} />);
  return onBack;
}

const cards = () => {
  const list = screen.queryByRole('list');
  return list ? within(list).getAllByRole('listitem') : [];
};
const cardTexts = () => cards().map((card) => card.querySelector('.card-text')?.textContent);
const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('BookView', () => {
  it('shows the book and focuses its title', () => {
    const id = bookOf(library, 'The Glass Orchard');
    show(library, id);
    const heading = screen.getByRole('heading', { level: 2, name: 'The Glass Orchard' });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('dir')).toBe('auto');
    screen.getByText(rowsOf(library, id)[0]?.author ?? '');
  });

  it('opens on Highlights with every row, oldest first', () => {
    const id = bookOf(library, 'The Glass Orchard');
    show(library, id);
    expect(tab(/^Highlights/).getAttribute('aria-selected')).toBe('true');
    const expected = [...rowsOf(library, id)]
      .sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0))
      .map((h) => h.text);
    expect(cardTexts()).toEqual(expected);

    fireEvent.click(screen.getByRole('radio', { name: 'Newest first' }));
    expect(cardTexts()).toEqual([...expected].reverse());
  });

  it('counts each tab and lists only rows with a note under Notes', () => {
    const id = bookOf(library, 'The Glass Orchard');
    show(library, id);
    const all = rowsOf(library, id);
    const noted = all.filter((h) => h.note !== '');
    expect(tab(/^Highlights/).textContent).toBe(`Highlights (${all.length})`);
    expect(tab(/^Notes/).textContent).toBe(`Notes (${noted.length})`);

    fireEvent.click(tab(/^Notes/));
    expect(cardTexts()).toEqual(noted.map((h) => h.text));
    expect(cards().map((card) => card.querySelector('.card-note [dir]')?.textContent)).toEqual(
      noted.map((h) => h.note),
    );
  });

  it('says so when a book has no notes', () => {
    show(library, bookOf(library, 'Shared Title', 'Bo Lantern'));
    fireEvent.click(tab(/^Notes/));
    screen.getByText('This book has no notes.');
    expect(cards()).toEqual([]);
  });

  it('moves between tabs with the arrow, Home and End keys', () => {
    show(library, bookOf(library, 'The Glass Orchard'));
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab(/^Notes/));
    expect(tab(/^Notes/).getAttribute('aria-selected')).toBe('true');
    expect(tab(/^Notes/).tabIndex).toBe(0);
    expect(tab(/^Highlights/).tabIndex).toBe(-1);

    fireEvent.keyDown(list, { key: 'End' });
    expect(document.activeElement).toBe(tab(/^Stats/));
    screen.getByText('Stats are coming in a later version.');

    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab(/^Highlights/));
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tab(/^Stats/));
    fireEvent.keyDown(list, { key: 'Home' });
    expect(document.activeElement).toBe(tab(/^Highlights/));
  });

  it('filters by colour, with All selecting or clearing every colour', () => {
    const id = bookOf(library, 'The Glass Orchard');
    show(library, id);
    const all = rowsOf(library, id);
    const pink = all.filter((h) => h.color === 'pink');
    const box = (name: RegExp) => screen.getByRole('checkbox', { name });
    expect(box(/^Pink/).parentElement?.textContent).toBe(`Pink (${pink.length})`);

    fireEvent.click(box(/^All$/));
    expect(box(/^All$/)).toHaveProperty('checked', false);
    screen.getByText('No highlights match the selected colors.');

    fireEvent.click(box(/^Pink/));
    expect(cardTexts()).toEqual(pink.map((h) => h.text));
    for (const card of cards()) within(card).getByRole('img', { name: 'Pink' });

    fireEvent.click(box(/^All$/));
    expect(cards()).toHaveLength(all.length);
  });

  it('shows the chapter number, or says it is unknown', () => {
    const known = bookOf(library, 'The Glass Orchard');
    show(library, known);
    const first = [...rowsOf(library, known)].sort((a, b) =>
      a.created < b.created ? -1 : 1,
    )[0] as Highlight;
    expect(cards()[0]?.querySelector('.card-chapter')?.textContent).toBe(
      `Chapter ${first.chapterNo}`,
    );
    cleanup();

    show(library, bookOf(library, 'Shared Title', 'Dee Harrow'));
    for (const card of cards()) {
      expect(card.querySelector('.card-chapter')?.textContent).toBe('Chapter –unknown');
    }
  });

  it('marks text containers for right-to-left content', () => {
    show(library, bookOf(library, 'كتاب تجريبي'));
    for (const card of cards()) {
      expect(card.querySelector('.card-text')?.getAttribute('dir')).toBe('auto');
    }
  });

  it('hides the colour filter and swatches on devices without colours', () => {
    const first = noColor.highlights[0] as Highlight;
    show(noColor, first.bookId);
    expect(screen.queryByRole('group', { name: 'Colors' })).toBeNull();
    expect(screen.queryAllByRole('img')).toEqual([]);
    expect(cards()).toHaveLength(rowsOf(noColor, first.bookId).length);
  });

  it('goes back to the library', () => {
    const onBack = show(library, bookOf(library, 'The Glass Orchard'));
    fireEvent.click(screen.getByRole('button', { name: '← All books' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
