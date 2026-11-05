/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { csvFilename, filterHighlights, toCsv } from '../../src/export/csv';
import { parseKobo } from '../../src/kobo/parse';
import { COLORS, type Color, type KoboLibrary } from '../../src/kobo/types';
import { App } from '../../src/ui/App';
import { LoadError, type LoadLibrary, type Phase } from '../../src/worker/protocol';

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
});

const file = () => new File(['x'], 'KoboReader.sqlite');
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
  render(<App load={resolving(result)} />);
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
  it('renders the title, the privacy promise and the file help', () => {
    render(<App load={resolving(library)} />);
    screen.getByRole('heading', { level: 1, name: 'Kobo Annotations' });
    screen.getByText(/never leaves this computer/);
    screen.getByText('Where is my file?');
  });

  it('shows each loading phase and disables the input meanwhile', async () => {
    let report: (phase: Phase) => void = () => undefined;
    let finish: (result: KoboLibrary) => void = () => undefined;
    const load: LoadLibrary = (_file, onPhase) => {
      report = onPhase;
      return new Promise((resolve) => (finish = resolve));
    };
    render(<App load={load} />);
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
    render(<App load={load} />);
    const dropped = file();
    fireEvent.drop(screen.getByTestId('drop-zone'), { dataTransfer: { files: [dropped] } });
    await screen.findByRole('region', { name: 'Export' });
    expect(load).toHaveBeenCalledWith(dropped, expect.any(Function));
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
    render(<App load={resolving({ hasColor: true, highlights: [] })} />);
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
    render(<App load={() => Promise.reject(new LoadError(code))} />);
    choose();
    expect((await screen.findByRole('alert')).textContent).toMatch(message);
  });

  it('treats an unknown failure as unexpected and lets the user retry', async () => {
    const load = vi
      .fn<LoadLibrary>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(library);
    render(<App load={load} />);
    choose();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Something went wrong/);
    choose();
    await screen.findByRole('region', { name: 'Export' });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
