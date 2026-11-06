/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { IDBFactory } from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildCovers } from '../../scripts/make-fixture';
import { csvFilename, filterHighlights, toCsv } from '../../src/export/csv';
import { parseKobo } from '../../src/kobo/parse';
import { COLORS, type KoboLibrary } from '../../src/kobo/types';
import { createIdbStore, StoreError, type HighlightStore } from '../../src/store/db';
import { App } from '../../src/ui/App';
import { LoadError, type LoadLibrary, type Phase } from '../../src/worker/protocol';

const { persistStorage } = vi.hoisted(() => ({
  persistStorage: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../src/store/persist', () => ({ persistStorage }));

let library: KoboLibrary;
let noColor: KoboLibrary;

beforeAll(async () => {
  const SQL = await initSqlJs();
  // happy-dom gives import.meta.url an http scheme, so the path is relative to the project root.
  const read = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));
  library = parseKobo(SQL, read('KoboReader.sqlite'));
  noColor = parseKobo(SQL, read('KoboReader-nocolor.sqlite'));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  persistStorage.mockClear();
});

const file = () => new File(['x'], 'KoboReader.sqlite');

/** Renders the app with an empty store unless one is given. */
function start(load: LoadLibrary, store: HighlightStore = createIdbStore(new IDBFactory())) {
  return render(<App load={load} store={store} />);
}

const resolving =
  (result: KoboLibrary): LoadLibrary =>
  () =>
    Promise.resolve(result);

function choose(target = file()) {
  const input = screen.getByLabelText('Choose file');
  Object.defineProperty(input, 'files', { value: [target], configurable: true });
  fireEvent.change(input);
}

async function loaded(result: KoboLibrary) {
  start(resolving(result));
  choose();
  await screen.findByRole('region', { name: 'Export' });
}

const downloadButton = () => screen.getByRole('button', { name: 'Download CSV' });
const sortGroup = () => screen.getByRole('group', { name: 'Sort by' });
const sortField = (name: 'Title' | 'Author') =>
  within(sortGroup()).getByRole('button', { name: new RegExp(`^${name}`) });

/** Opens a sort field and picks a direction. */
function sortBy(name: 'Title' | 'Author', direction: 'A–Z' | 'Z–A') {
  fireEvent.click(sortField(name));
  fireEvent.click(within(sortGroup()).getByRole('button', { name: direction }));
}

describe('App', () => {
  it('renders the title, the tagline and the file help', async () => {
    start(resolving(library));
    screen.getByRole('heading', { level: 1, name: 'Kobo Annotations' });
    screen.getByText('Hold on to every line you loved.');
    screen.getByText('Where are my files?');
    screen.getByText('KoboReader_20261105.sqlite');
  });

  it('puts the file help right below the drop zone, next to a hidden illustration', () => {
    const { container } = start(resolving(library));
    const zone = screen.getByTestId('drop-zone');
    expect(zone.nextElementSibling).toBe(
      screen.getByText('Where are my files?').closest('details'),
    );
    expect(container.querySelector('svg.illustration')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('stops the browser from opening files dropped outside the zone, until unmounted', async () => {
    const stray = (type: string) => {
      const event = new Event(type, { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const { unmount } = start(resolving(library));
    expect(stray('dragover')).toBe(true);
    expect(stray('drop')).toBe(true);
    // Preact defers effect cleanups to the next flush; act() forces it.
    act(() => unmount());
    expect(stray('dragover')).toBe(false);
    expect(stray('drop')).toBe(false);
  });

  it('shows each loading phase and disables the input meanwhile', async () => {
    let report: (phase: Phase) => void = () => undefined;
    let finish: (result: KoboLibrary) => void = () => undefined;
    const load: LoadLibrary = (_file, onPhase) => {
      report = onPhase;
      return new Promise((resolve) => (finish = resolve));
    };
    start(load);
    choose();

    await screen.findByText('Reading the file…');
    expect(screen.getByLabelText('Choose file')).toHaveProperty('disabled', true);
    report('starting');
    await screen.findByText('Starting the database engine…');
    report('parsing');
    await screen.findByText('Looking for your highlights…');

    finish(library);
    await screen.findByRole('region', { name: 'Export' });
    expect(screen.queryByText('Looking for your highlights…')).toBeNull();
    expect(screen.getByLabelText('Choose file')).toHaveProperty('disabled', false);
  });

  it('loads a file dropped on the drop zone', async () => {
    const load = vi.fn<LoadLibrary>(resolving(library));
    start(load);
    const dropped = file();
    fireEvent.drop(screen.getByTestId('drop-zone'), { dataTransfer: { files: [dropped] } });
    await screen.findByRole('region', { name: 'Export' });
    expect(load).toHaveBeenCalledWith(dropped, expect.any(Function));
  });

  it('keeps the drop highlight while dragging over child elements', async () => {
    start(resolving(library));
    const zone = screen.getByTestId('drop-zone');
    fireEvent.dragEnter(zone);
    fireEvent.dragEnter(zone.querySelector('label') as Element);
    fireEvent.dragLeave(zone);
    expect(zone.classList.contains('is-over')).toBe(true);
    fireEvent.dragLeave(zone);
    expect(zone.classList.contains('is-over')).toBe(false);
  });

  it('refuses drops while a file is loading', async () => {
    const load = vi.fn<LoadLibrary>(() => new Promise(() => undefined));
    start(load);
    choose();
    await screen.findByText('Reading the file…');

    const zone = screen.getByTestId('drop-zone');
    let dropEffect = '';
    zone.addEventListener('dragover', (event) => {
      dropEffect = event.dataTransfer?.dropEffect ?? '';
    });
    fireEvent.dragEnter(zone);
    fireEvent.dragOver(zone, { dataTransfer: { dropEffect: 'copy' } });
    expect(dropEffect).toBe('none');
    expect(zone.classList.contains('is-over')).toBe(false);
    fireEvent.drop(zone, { dataTransfer: { files: [file()] } });
    expect(load).toHaveBeenCalledOnce();
  });

  it('summarises the library without filters or other actions', async () => {
    await loaded(library);
    const books = new Set(library.highlights.map((h) => h.bookId)).size;
    screen.getByText(`Found ${library.highlights.length} highlights in ${books} books.`);
    expect(downloadButton().textContent).toBe('Download CSV');
    const panel = screen.getByRole('region', { name: 'Export' });
    expect(within(panel).queryByRole('checkbox')).toBeNull();
    expect(within(panel).getAllByRole('button')).toEqual([downloadButton()]);
  });

  it('downloads every highlight with the dated filename', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download;
    });

    await loaded(library);
    fireEvent.click(downloadButton());

    const blob = created.mock.calls[0]?.[0] as Blob;
    const expected = toCsv(library.highlights, { notesOnly: false });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new TextEncoder().encode(expected));
    expect(filename).toBe(csvFilename());
  });

  it('revokes the download URL once the browser has had time to read it', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);
    await loaded(library);

    vi.useFakeTimers();
    try {
      fireEvent.click(downloadButton());
      expect(revoked).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000);
      expect(revoked).toHaveBeenCalledWith('blob:csv');
    } finally {
      vi.useRealTimers();
    }
  });

  it('downloads every highlight on databases without a Color column', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);
    await loaded(noColor);
    fireEvent.click(downloadButton());
    const blob = created.mock.calls[0]?.[0] as Blob;
    const expected = toCsv(noColor.highlights, { notesOnly: false });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new TextEncoder().encode(expected));
  });

  it('says so when the file has no highlights', async () => {
    start(resolving({ hasColor: true, highlights: [] }));
    choose();
    await screen.findByText('No highlights or notes were found in this file.');
    expect(screen.queryByRole('button', { name: /^Download CSV/ })).toBeNull();
  });

  it.each([
    ['not-sqlite', /is not a Kobo database/],
    ['not-kobo', /does not come from a Kobo/],
    ['unreadable', /could not be read/],
    ['unexpected', /Something went wrong/],
  ] as const)('explains the %s error in plain words', async (code, message) => {
    start(() => Promise.reject(new LoadError(code)));
    choose();
    expect((await screen.findByRole('alert')).textContent).toMatch(message);
  });

  it('treats an unknown failure as unexpected and lets the user retry', async () => {
    const load = vi
      .fn<LoadLibrary>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(library);
    start(load);
    choose();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Something went wrong/);
    choose();
    await screen.findByRole('region', { name: 'Export' });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('App saved library', () => {
  const bookCount = () => new Set(library.highlights.map((h) => h.bookId)).size;
  const bookTiles = () =>
    within(screen.getByRole('region', { name: 'Your books' })).getAllByRole('listitem');
  const tileTexts = () => bookTiles().map((tile) => tile.textContent ?? '');

  async function savedStore() {
    const store = createIdbStore(new IDBFactory());
    await store.save(library);
    return store;
  }

  it('shows the saved highlights on start, without loading a file', async () => {
    const load = vi.fn<LoadLibrary>();
    start(load, await savedStore());
    await screen.findByRole('region', { name: 'Export' });
    screen.getByRole('heading', { level: 2, name: 'Your books' });
    expect(bookTiles()).toHaveLength(bookCount());
    expect(load).not.toHaveBeenCalled();
  });

  it('saves an upload so the next visit shows it', async () => {
    const factory = new IDBFactory();
    start(resolving(library), createIdbStore(factory));
    choose();
    await screen.findByText(/saved in this browser/);
    cleanup();

    start(resolving(library), createIdbStore(factory));
    await screen.findByRole('region', { name: 'Export' });
    expect(bookTiles()).toHaveLength(bookCount());
  });

  it('lists every book with its count and sorts the mosaic', async () => {
    start(resolving(library), await savedStore());
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    const ascending = tileTexts();
    expect(ascending).toHaveLength(bookCount());

    expect(sortField('Title').textContent).toBe('Title A–Z');
    sortBy('Title', 'Z–A');
    expect(tileTexts()).toEqual([...ascending].reverse());
    expect(sortField('Title').textContent).toBe('Title Z–A');

    const counted = tileTexts().map((text) => Number(/(\d+) highlights?$/.exec(text)?.[1]));
    expect(counted.reduce((a, b) => a + b, 0)).toBe(library.highlights.length);
  });

  it('sorts by author and marks the active field and direction', async () => {
    start(resolving(library), await savedStore());
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    const authors = () =>
      bookTiles().map((tile) => tile.querySelector('.book-author')?.textContent ?? '');
    const title = sortField('Title');
    const author = sortField('Author');
    expect(title.getAttribute('aria-expanded')).toBe('false');
    expect(title.classList.contains('is-active')).toBe(true);
    expect(author.textContent).toBe('Author');

    fireEvent.click(author);
    expect(author.getAttribute('aria-expanded')).toBe('true');
    const options = screen.getByRole('group', { name: 'Author order' });
    expect(author.getAttribute('aria-controls')).toBe(options.id);
    expect(within(options).getByRole('button', { name: 'A–Z' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.click(within(options).getByRole('button', { name: 'Z–A' }));

    expect(screen.queryByRole('group', { name: 'Author order' })).toBeNull();
    expect(document.activeElement).toBe(author);
    expect(author.textContent).toBe('Author Z–A');
    expect(author.classList.contains('is-active')).toBe(true);
    expect(title.textContent).toBe('Title');
    const sorted = authors();
    expect(sorted).toEqual(
      [...sorted].sort((a, b) =>
        b.localeCompare(a, undefined, { sensitivity: 'base', numeric: true }),
      ),
    );

    fireEvent.click(author);
    expect(
      within(screen.getByRole('group', { name: 'Author order' }))
        .getByRole('button', { name: 'Z–A' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('closes the sort options with Escape, another field or a click outside', async () => {
    start(resolving(library), await savedStore());
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    const title = sortField('Title');

    fireEvent.click(title);
    const option = within(sortGroup()).getByRole('button', { name: 'Z–A' });
    option.focus();
    fireEvent.keyDown(option, { key: 'Escape' });
    expect(title.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(title);

    fireEvent.click(title);
    fireEvent.click(sortField('Author'));
    expect(title.getAttribute('aria-expanded')).toBe('false');
    expect(sortField('Author').getAttribute('aria-expanded')).toBe('true');

    fireEvent.pointerDown(document.body);
    expect(sortField('Author').getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the sort options when focus leaves the control', async () => {
    start(resolving(library), await savedStore());
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    const title = sortField('Title');
    fireEvent.click(title);
    const option = within(sortGroup()).getByRole('button', { name: 'Z–A' });

    fireEvent.focusOut(title, { relatedTarget: option });
    expect(title.getAttribute('aria-expanded')).toBe('true');
    fireEvent.focusOut(option, { relatedTarget: downloadButton() });
    expect(title.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(title);
    const next = within(sortGroup()).getByRole('button', { name: 'Z–A' });
    fireEvent.focusOut(next, { relatedTarget: sortField('Author') });
    expect(title.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the sort options with Escape even when no sort button has focus', async () => {
    start(resolving(library), await savedStore());
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    const author = sortField('Author');
    fireEvent.click(author);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(author.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(author);
  });

  it('clears the saved data after confirmation', async () => {
    const store = await savedStore();
    start(resolving(library), store);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear saved data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved data' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Export' })).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Your books' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Choose file'));
    expect((await store.load()).highlights).toEqual([]);
  });

  it('opens a book from its tile and returns to the same tile', async () => {
    start(resolving(library), await savedStore());
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    sortBy('Title', 'Z–A');
    const tile = screen.getByRole('button', { name: /^The Glass Orchard/ });
    fireEvent.click(tile);

    expect(screen.queryByRole('region', { name: 'Your books' })).toBeNull();
    const view = screen.getByRole('region', { name: 'The Glass Orchard' });
    expect(document.activeElement).toBe(within(view).getByRole('heading', { level: 2 }));
    screen.getByRole('region', { name: 'Export' });

    fireEvent.click(screen.getByRole('button', { name: 'All books' }));
    expect(screen.queryByRole('region', { name: 'The Glass Orchard' })).toBeNull();
    screen.getByRole('region', { name: 'Your books' });
    expect(document.activeElement).toBe(tile);
    expect(sortField('Title').textContent).toBe('Title Z–A');
  });

  it('closes the open book when a new file is loaded or the data is cleared', async () => {
    start(resolving(library), await savedStore());
    fireEvent.click(await screen.findByRole('button', { name: /^The Glass Orchard/ }));
    const input = screen.getByLabelText('Choose file');
    input.focus();
    choose();
    await screen.findByRole('region', { name: 'Your books' });
    expect(screen.queryByRole('region', { name: 'The Glass Orchard' })).toBeNull();
    await screen.findByText(/saved in this browser/);
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: /^The Glass Orchard/ }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^The Glass Orchard/ }));
    const clearButton = screen.getByRole('button', { name: 'Clear saved data' });
    await waitFor(() => expect(clearButton).toHaveProperty('disabled', false));
    fireEvent.click(clearButton);
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved data' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'The Glass Orchard' })).toBeNull(),
    );
  });

  it('keeps the saved data when the confirmation is cancelled', async () => {
    const store = await savedStore();
    start(resolving(library), store);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear saved data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    screen.getByRole('button', { name: 'Clear saved data' });
    expect((await store.load()).highlights).toHaveLength(library.highlights.length);
  });

  it('still exports the upload when saving fails, and says why', async () => {
    const store: HighlightStore = {
      ...createIdbStore(new IDBFactory()),
      save: () => Promise.reject(new StoreError('full')),
    };
    start(resolving(library), store);
    choose();
    await screen.findByRole('region', { name: 'Export' });
    expect(screen.getByRole('alert').textContent).toMatch(/no space left/);
    expect(screen.queryByRole('button', { name: 'Clear saved data' })).toBeNull();
  });

  it('warns when the browser cannot save, and still loads files', async () => {
    const unavailable = () => Promise.reject(new StoreError('unavailable'));
    const store: HighlightStore = {
      load: unavailable,
      save: unavailable,
      clear: unavailable,
      forgetBook: unavailable,
      loadCovers: unavailable,
      saveCovers: unavailable,
    };
    start(resolving(library), store);
    expect((await screen.findByRole('alert')).textContent).toMatch(/not saving your highlights/);
    choose();
    await screen.findByRole('region', { name: 'Export' });
  });

  it('lets a file picked before the saved data arrives win over it', async () => {
    const saved = await (await savedStore()).load();
    const stale = { ...saved, highlights: saved.highlights.slice(0, 3) };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const store: HighlightStore = {
      ...createIdbStore(new IDBFactory()),
      load: () => gate.then(() => stale),
    };
    start(resolving(noColor), store);
    choose();
    const found = new RegExp(`^Found ${noColor.highlights.length} highlights`);
    await screen.findByText(found);

    release();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    screen.getByText(found);
  });

  it('asks the browser to keep the data only after a successful save', async () => {
    start(resolving(library));
    choose();
    await screen.findByText(/saved in this browser/);
    expect(persistStorage).toHaveBeenCalledOnce();
    cleanup();

    const store: HighlightStore = {
      ...createIdbStore(new IDBFactory()),
      save: () => Promise.reject(new StoreError('failed')),
    };
    start(resolving(library), store);
    choose();
    await screen.findByRole('alert');
    expect(persistStorage).toHaveBeenCalledOnce();
  });

  it('still offers to clear earlier data when a later save fails', async () => {
    const saved = await savedStore();
    const store: HighlightStore = {
      ...saved,
      save: () => Promise.reject(new StoreError('full')),
    };
    start(resolving(noColor), store);
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    choose();
    await screen.findByRole('alert');
    screen.getByText(/may still hold highlights saved from earlier files/);

    fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved data' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Clear saved data' })).toBeNull(),
    );
    expect((await saved.load()).highlights).toEqual([]);
  });

  it('offers to clear data restored after a file whose save then fails', async () => {
    const saved = await savedStore();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const store: HighlightStore = {
      ...saved,
      load: () => gate.then(() => saved.load()),
      save: () => gate.then(() => Promise.reject(new StoreError('full'))),
    };
    start(resolving(noColor), store);
    choose();
    // Lets the file finish reading while the saved data is still on its way.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    release();
    await screen.findByRole('alert');
    await screen.findByRole('button', { name: 'Clear saved data' });
    screen.getByText(/may still hold highlights saved from earlier files/);
  });

  it('keeps the library and says so when clearing fails', async () => {
    const store: HighlightStore = {
      ...(await savedStore()),
      clear: () => Promise.reject(new StoreError('failed')),
    };
    start(resolving(library), store);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear saved data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved data' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read or updated/);
    screen.getByRole('heading', { level: 2, name: 'Your books' });
    screen.getByRole('button', { name: 'Clear saved data' });
  });

  it('shows the saved library when it arrives after a file failed to load', async () => {
    const saved = await savedStore();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const store: HighlightStore = { ...saved, load: () => gate.then(() => saved.load()) };
    start(() => Promise.reject(new LoadError('not-sqlite')), store);
    choose();
    await screen.findByRole('alert');
    release();
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
  });

  it('moves keyboard focus through the clear confirmation', async () => {
    start(resolving(library), await savedStore());
    fireEvent.click(await screen.findByRole('button', { name: 'Clear saved data' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' })),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear saved data' })),
    );
  });

  it('cannot clear while a file is loading', async () => {
    start(() => new Promise(() => undefined), await savedStore());
    const clearButton = await screen.findByRole('button', { name: 'Clear saved data' });
    choose();
    await screen.findByText('Reading the file…');
    expect(clearButton).toHaveProperty('disabled', true);
  });

  it('keeps showing the saved library when a new file fails to load', async () => {
    start(() => Promise.reject(new LoadError('not-sqlite')), await savedStore());
    await screen.findByRole('region', { name: 'Export' });
    choose();
    expect((await screen.findByRole('alert')).textContent).toMatch(/is not a Kobo database/);
    screen.getByRole('region', { name: 'Export' });
    screen.getByRole('heading', { level: 2, name: 'Your books' });
  });
});

describe('App history', () => {
  const glass = () => library.highlights.find((h) => h.book === 'The Glass Orchard')?.bookId ?? '';
  const faro = () => library.highlights.find((h) => h.book === 'El Faro Apagado')?.bookId ?? '';
  const without = (...bookIds: string[]): KoboLibrary => ({
    ...library,
    highlights: library.highlights.filter((h) => !bookIds.includes(h.bookId)),
  });
  const rowsOf = (bookId: string) => library.highlights.filter((h) => h.bookId === bookId);
  const tile = (name: RegExp) => screen.getByRole('button', { name });

  async function storeWith(...uploads: KoboLibrary[]) {
    const store = createIdbStore(new IDBFactory());
    for (const upload of uploads) await store.save(upload);
    return store;
  }

  it('marks what is new since the last upload and books no longer on the Kobo', async () => {
    start(resolving(library), await storeWith(without(glass()), without(faro())));
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    const added = rowsOf(glass()).length;

    expect(tile(/^The Glass Orchard/).textContent).toContain(`${added} new`);
    expect(tile(/^El Faro Apagado/).textContent).toContain('Not on your Kobo');
    screen.getByText(`${added} highlights are new since last time.`);

    fireEvent.click(tile(/^The Glass Orchard/));
    const view = screen.getByRole('region', { name: 'The Glass Orchard' });
    expect(within(view).getAllByText('New')).toHaveLength(added);
    expect(within(view).queryByRole('button', { name: 'Forget this book' })).toBeNull();
  });

  it('marks nothing on the first upload', async () => {
    start(resolving(library), await storeWith(library));
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    expect(screen.queryByText(/new since last time/)).toBeNull();
    expect(screen.queryByText(/ new$/)).toBeNull();
    expect(screen.queryByText('Not on your Kobo')).toBeNull();
  });

  it('forgets a book that left the Kobo after confirmation', async () => {
    const store = await storeWith(library, without(glass()));
    start(resolving(library), store);
    fireEvent.click(await screen.findByRole('button', { name: /^The Glass Orchard/ }));
    screen.getByText(/no longer on your Kobo/);

    fireEvent.click(screen.getByRole('button', { name: 'Forget this book' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget book' }));

    const heading = await screen.findByRole('heading', { level: 2, name: 'Your books' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.queryByRole('button', { name: /^The Glass Orchard/ })).toBeNull();
    const left = (await store.load()).highlights;
    expect(left.some((h) => h.bookId === glass())).toBe(false);
    expect(left).toHaveLength(library.highlights.length - rowsOf(glass()).length);
  });

  it('keeps the book when the confirmation is cancelled', async () => {
    start(resolving(library), await storeWith(library, without(glass())));
    fireEvent.click(await screen.findByRole('button', { name: /^The Glass Orchard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget this book' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Forget this book' }));
    screen.getByRole('region', { name: 'The Glass Orchard' });
  });

  it('returns to the empty page when the last book is forgotten', async () => {
    const only: KoboLibrary = { ...library, highlights: rowsOf(glass()) };
    start(resolving(library), await storeWith(only, { ...library, highlights: [] }));
    fireEvent.click(await screen.findByRole('button', { name: /^The Glass Orchard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget this book' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget book' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Export' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Clear saved data' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Choose file'));
  });

  it('keeps the book and says so when forgetting fails', async () => {
    const store: HighlightStore = {
      ...(await storeWith(library, without(glass()))),
      forgetBook: () => Promise.reject(new StoreError('failed')),
    };
    start(resolving(library), store);
    fireEvent.click(await screen.findByRole('button', { name: /^The Glass Orchard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget this book' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget book' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read or updated/);
    screen.getByRole('region', { name: 'The Glass Orchard' });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Forget this book' })),
    );
  });

  it('leaves another open book alone when a slow forget finishes', async () => {
    const saved = await storeWith(library, without(glass(), faro()));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let finished: Promise<unknown> = Promise.resolve();
    const store: HighlightStore = {
      ...saved,
      forgetBook: (id) => {
        const result = gate.then(() => saved.forgetBook(id));
        finished = result;
        return result;
      },
    };
    start(resolving(library), store);
    fireEvent.click(await screen.findByRole('button', { name: /^The Glass Orchard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget this book' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget book' }));
    fireEvent.click(screen.getByRole('button', { name: 'All books' }));
    fireEvent.click(tile(/^El Faro Apagado/));

    await act(async () => {
      release();
      await finished;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    screen.getByRole('region', { name: 'El Faro Apagado' });
    fireEvent.click(screen.getByRole('button', { name: 'All books' }));
    expect(screen.queryByRole('button', { name: /^The Glass Orchard/ })).toBeNull();
  });

  it('downloads one book with the filters of its view', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download;
    });
    start(resolving(library), await storeWith(library));
    fireEvent.click(await screen.findByRole('button', { name: /^The Glass Orchard/ }));
    const view = screen.getByRole('region', { name: 'The Glass Orchard' });
    const rows = rowsOf(glass());
    const button = () => within(view).getByRole('button', { name: /^Download this book/ });
    const downloaded = async (call: number) =>
      new Uint8Array(await (created.mock.calls[call]?.[0] as Blob).arrayBuffer());
    const encoded = (text: string) => new TextEncoder().encode(text);

    fireEvent.click(within(view).getByRole('checkbox', { name: /^Blue/ }));
    const noBlue = { colors: ['yellow', 'pink', 'green'] as const, notesOnly: false };
    expect(toCsv(rows, noBlue)).not.toBe(toCsv(rows, { colors: COLORS, notesOnly: false }));
    fireEvent.click(button());
    expect(await downloaded(0)).toEqual(encoded(toCsv(rows, noBlue)));
    expect(filename).toBe(csvFilename());

    fireEvent.click(within(view).getByRole('tab', { name: /^Notes/ }));
    const notes = filterHighlights(rows, { ...noBlue, notesOnly: true });
    expect(button().textContent).toContain(`(${notes.length} `);
    fireEvent.click(button());
    expect(await downloaded(1)).toEqual(encoded(toCsv(rows, { ...noBlue, notesOnly: true })));
  });

  it('keeps focus off the book tiles after Back, a clear and a new file', async () => {
    start(resolving(library), await storeWith(library));
    fireEvent.click(await screen.findByRole('button', { name: /^The Glass Orchard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'All books' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved data' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Export' })).toBeNull());

    choose();
    await screen.findByText(/saved in this browser/);
    expect(document.activeElement).not.toBe(tile(/^The Glass Orchard/));
  });
});

describe('App covers', () => {
  const coverFiles = () =>
    [...buildCovers()].map(([path, bytes]) => new File([bytes], path.split('/').at(-1) ?? path));

  function chooseFolder(files: File[]) {
    const input = screen.getByLabelText('Choose folder');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    fireEvent.change(input);
  }

  const libraryRegion = () => screen.getByRole('region', { name: 'Your books' });
  const covers = () => libraryRegion().querySelectorAll('img.book-cover');
  const placeholders = () => libraryRegion().querySelectorAll('.book-cover.is-placeholder');
  const books = () => new Set(library.highlights.map((h) => h.bookId)).size;

  it('picks folders only, and shows no covers until some are added', async () => {
    await loaded(library);
    const input = screen.getByLabelText<HTMLInputElement>('Choose folder');
    expect(input.webkitdirectory).toBe(true);
    expect(covers()).toHaveLength(0);
    expect(placeholders()).toHaveLength(0);
  });

  it('adds covers from the chosen folder, with placeholders for the rest', async () => {
    await loaded(library);
    chooseFolder(coverFiles());
    await screen.findByText('Added covers for 4 books.');
    expect(covers()).toHaveLength(4);
    expect(placeholders()).toHaveLength(books() - 4);
    for (const img of covers()) expect(img.getAttribute('src')).toMatch(/^blob:/);

    fireEvent.click(screen.getByRole('button', { name: /^The Glass Orchard/ }));
    const view = screen.getByRole('region', { name: 'The Glass Orchard' });
    expect(view.querySelector('img.book-view-cover')?.getAttribute('src')).toMatch(/^blob:/);
  });

  it('shows no cover in the book view of a book without one', async () => {
    await loaded(library);
    chooseFolder(coverFiles());
    await screen.findByText('Added covers for 4 books.');
    fireEvent.click(screen.getByRole('button', { name: /^Shared Title\s*Dee Harrow/ }));
    expect(screen.getByRole('region', { name: 'Shared Title' }).querySelector('img')).toBeNull();
  });

  it('keeps the covers across visits and drops them with the saved data', async () => {
    const store = createIdbStore(new IDBFactory());
    start(resolving(library), store);
    choose();
    await screen.findByRole('region', { name: 'Export' });
    chooseFolder(coverFiles());
    await screen.findByText('Added covers for 4 books.');
    cleanup();

    start(resolving(library), store);
    await waitFor(() => expect(covers()).toHaveLength(4));
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved data' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Your books' })).toBeNull());
    expect((await store.loadCovers()).size).toBe(0);
  });

  it('says when the folder holds no covers for these books', async () => {
    await loaded(library);
    chooseFolder([new File(['x'], 'notes.txt')]);
    await screen.findByText(/^No covers for your books in that folder/);
    expect(covers()).toHaveLength(0);
  });

  it('asks for the database again when the highlights predate covers', async () => {
    const legacy = {
      ...library,
      highlights: library.highlights.map((h) => ({ ...h, imageId: '' })),
    };
    await loaded(legacy);
    chooseFolder(coverFiles());
    await screen.findByText(/Load your KoboReader.sqlite file again/);
  });

  it('still shows the covers when the browser cannot save them', async () => {
    const store: HighlightStore = {
      ...createIdbStore(new IDBFactory()),
      saveCovers: () => Promise.reject(new StoreError('full')),
    };
    start(resolving(library), store);
    choose();
    await screen.findByRole('region', { name: 'Export' });
    chooseFolder(coverFiles());
    await screen.findByText(/could not save them/);
    expect(covers()).toHaveLength(4);
  });

  it("drops a forgotten book's cover and keeps the others", async () => {
    const glass = library.highlights.find((h) => h.book === 'The Glass Orchard')?.bookId ?? '';
    const store = createIdbStore(new IDBFactory());
    await store.save(library);
    await store.save({
      ...library,
      highlights: library.highlights.filter((h) => h.bookId !== glass),
    });
    start(resolving(library), store);
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    chooseFolder(coverFiles());
    await screen.findByText('Added covers for 4 books.');

    fireEvent.click(screen.getByRole('button', { name: /^The Glass Orchard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget this book' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forget book' }));
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    await waitFor(() => expect(covers()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /^The Glass Orchard/ })).toBeNull();
    const saved = await store.loadCovers();
    expect(saved.size).toBe(3);
    expect(saved.has(glass)).toBe(false);
  });

  it('revokes the cover URLs it replaces and the ones the saved data took along', async () => {
    const revoked = vi.spyOn(URL, 'revokeObjectURL');
    const sources = () => [...covers()].map((img) => img.getAttribute('src'));
    await loaded(library);
    chooseFolder(coverFiles());
    await screen.findByText('Added covers for 4 books.');
    const first = sources();

    chooseFolder(coverFiles().slice(0, 3));
    await waitFor(() => expect(sources()).not.toEqual(first));
    await waitFor(() => {
      for (const url of first) expect(revoked).toHaveBeenCalledWith(url);
    });
    const second = sources();

    fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved data' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Your books' })).toBeNull());
    await waitFor(() => {
      for (const url of second) expect(revoked).toHaveBeenCalledWith(url);
    });
  });

  it('does not keep covers of highlights the browser could not save', async () => {
    const store: HighlightStore = {
      ...createIdbStore(new IDBFactory()),
      save: () => Promise.reject(new StoreError('full')),
    };
    start(resolving(library), store);
    choose();
    await screen.findByRole('region', { name: 'Export' });
    chooseFolder(coverFiles());
    await screen.findByText(/could not save them/);
    expect(covers()).toHaveLength(4);
    expect((await store.loadCovers()).size).toBe(0);
  });

  it('shows no placeholders when only books not shown have covers', async () => {
    const glass = library.highlights.find((h) => h.book === 'The Glass Orchard')?.bookId ?? '';
    const store = createIdbStore(new IDBFactory());
    await store.save({
      ...library,
      highlights: library.highlights.filter((h) => h.bookId !== glass),
    });
    await store.saveCovers(new Map([[glass, new Blob([new Uint8Array([0xff, 0xd8, 0xff])])]]));
    start(resolving(library), store);
    await screen.findByRole('heading', { level: 2, name: 'Your books' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(covers()).toHaveLength(0);
    expect(placeholders()).toHaveLength(0);
  });

  it('clears the covers message when another file is loaded', async () => {
    await loaded(library);
    chooseFolder(coverFiles());
    await screen.findByText('Added covers for 4 books.');
    choose();
    await waitFor(() => expect(screen.queryByText('Added covers for 4 books.')).toBeNull());
  });

  it('says when a dropped folder cannot be read', async () => {
    await loaded(library);
    const entry = {
      isFile: false,
      isDirectory: true,
      createReader: () => ({
        readEntries: (_: unknown, reject: (error: Error) => void) => reject(new Error('no')),
      }),
    };
    fireEvent.drop(screen.getByTestId('cover-drop-zone'), {
      dataTransfer: { items: [{ kind: 'file', webkitGetAsEntry: () => entry }], files: [] },
    });
    await screen.findByText('The folder could not be read. Please try again.');
  });
});
