/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { IDBFactory } from 'fake-indexeddb';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { csvFilename, filterHighlights, toCsv } from '../../src/export/csv';
import { parseKobo } from '../../src/kobo/parse';
import { COLORS, type Color, type KoboLibrary } from '../../src/kobo/types';
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

const LABELS: Record<Color, string> = {
  yellow: 'Yellow',
  pink: 'Pink',
  blue: 'Blue',
  green: 'Green',
};

const downloadButton = () => screen.getByRole('button', { name: /^Download CSV/ });
const colorBox = (label: string) => screen.getByRole('checkbox', { name: new RegExp(`^${label}`) });

describe('App', () => {
  it('renders the title, the privacy promise and the file help', async () => {
    start(resolving(library));
    screen.getByRole('heading', { level: 1, name: 'Kobo Annotations' });
    screen.getByText(/never leaves this computer/);
    screen.getByText('Where is my file?');
    screen.getByText('KoboReader_20261105.sqlite');
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

  it('summarises the library and counts each colour', async () => {
    await loaded(library);
    const books = new Set(library.highlights.map((h) => h.bookId)).size;
    screen.getByText(`Found ${library.highlights.length} highlights in ${books} books.`);
    for (const color of COLORS) {
      const count = library.highlights.filter((h) => h.color === color).length;
      expect(count).toBeGreaterThan(0);
      expect(colorBox(LABELS[color]).parentElement?.textContent).toContain(`(${count})`);
      expect(colorBox(LABELS[color])).toHaveProperty('checked', true);
    }
    expect(downloadButton().textContent).toContain(`(${library.highlights.length} rows)`);
  });

  it('updates the row count when a colour is unticked', async () => {
    await loaded(library);
    fireEvent.click(colorBox('Pink'));
    const expected = filterHighlights(library.highlights, {
      colors: ['yellow', 'blue', 'green'],
      notesOnly: false,
    }).length;
    expect(downloadButton().textContent).toContain(`(${expected} rows)`);
  });

  it('counts only notes when "Notes only" is ticked', async () => {
    await loaded(library);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Notes only' }));
    const notes = library.highlights.filter((h) => h.note !== '');
    expect(notes.length).toBeGreaterThan(0);
    expect(downloadButton().textContent).toContain(`(${notes.length} `);
    for (const color of COLORS) {
      const count = notes.filter((h) => h.color === color).length;
      expect(colorBox(LABELS[color]).parentElement?.textContent).toContain(`(${count})`);
    }
  });

  it('disables the download when no row matches', async () => {
    await loaded(library);
    for (const color of COLORS) fireEvent.click(colorBox(LABELS[color]));
    expect(downloadButton()).toHaveProperty('disabled', true);
    screen.getByText('No highlights match the selected filters.');
  });

  it('downloads the filtered CSV with the dated filename', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filename = this.download;
    });

    await loaded(library);
    fireEvent.click(colorBox('Blue'));
    fireEvent.click(downloadButton());

    const blob = created.mock.calls[0]?.[0] as Blob;
    const expected = toCsv(library.highlights, {
      colors: ['yellow', 'pink', 'green'],
      notesOnly: false,
    });
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

  it('hides the colour filter on databases without a Color column', async () => {
    await loaded(noColor);
    expect(screen.queryByRole('group', { name: 'Colors' })).toBeNull();
    expect(downloadButton().textContent).toContain(`(${noColor.highlights.length} rows)`);
  });

  it('hides the colour filter when every highlight is yellow', async () => {
    await loaded({
      hasColor: true,
      highlights: library.highlights.map((h) => ({ ...h, color: 'yellow' as const })),
    });
    expect(screen.queryByRole('group', { name: 'Colors' })).toBeNull();
    screen.getByRole('checkbox', { name: 'Notes only' });
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

    expect(screen.getByRole('radio', { name: 'Title (A–Z)' })).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('radio', { name: 'Title (Z–A)' }));
    expect(tileTexts()).toEqual([...ascending].reverse());

    const counted = tileTexts().map((text) => Number(/(\d+) highlights?$/.exec(text)?.[1]));
    expect(counted.reduce((a, b) => a + b, 0)).toBe(library.highlights.length);
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
    fireEvent.click(screen.getByRole('radio', { name: 'Title (Z–A)' }));
    const tile = screen.getByRole('button', { name: /^The Glass Orchard/ });
    fireEvent.click(tile);

    expect(screen.queryByRole('region', { name: 'Your books' })).toBeNull();
    const view = screen.getByRole('region', { name: 'The Glass Orchard' });
    expect(document.activeElement).toBe(within(view).getByRole('heading', { level: 2 }));
    screen.getByRole('region', { name: 'Export' });

    fireEvent.click(screen.getByRole('button', { name: '← All books' }));
    expect(screen.queryByRole('region', { name: 'The Glass Orchard' })).toBeNull();
    screen.getByRole('region', { name: 'Your books' });
    expect(document.activeElement).toBe(tile);
    expect(screen.getByRole('radio', { name: 'Title (Z–A)' })).toHaveProperty('checked', true);
  });

  it('closes the open book when a new file is loaded or the data is cleared', async () => {
    start(resolving(library), await savedStore());
    fireEvent.click(await screen.findByRole('button', { name: /^The Glass Orchard/ }));
    choose();
    await screen.findByRole('region', { name: 'Your books' });
    expect(screen.queryByRole('region', { name: 'The Glass Orchard' })).toBeNull();

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
    const store: HighlightStore = { load: unavailable, save: unavailable, clear: unavailable };
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
