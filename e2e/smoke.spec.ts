/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import initSqlJs from 'sql.js';
import { toCsv } from '../src/export/csv';
import { parseKobo } from '../src/kobo/parse';

const FIXTURE = 'tests/fixtures/KoboReader.sqlite';
const HEADER = '"Book";"Author";"Chapter No";"Chapter";"Highlight";"Note";"Color";"Date";"Time"';

// Any console error fails the test; CSP violations are logged explicitly, since not every engine reports them.
async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const source = event.target instanceof Element ? event.target : null;
      const where = source
        ? ` on <${source.localName} class="${source.getAttribute('class') ?? ''}">`
        : '';
      console.error(
        `CSP violation: ${event.violatedDirective} ${event.blockedURI}${where} ${event.sample}`,
      );
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

// Fields never contain CR in the fixture, so CRLF only separates records.
const records = (csv: string) => csv.split('\r\n').filter(Boolean).sort();

test('loads the fixture and downloads every highlight as CSV', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('./');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).not.toMatch(/https?:|\*/);

  await page.getByLabel('Choose file').setInputFiles(FIXTURE);
  await expect(page.getByText(/^Found .+ highlights in .+ books\.$/)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^kobo-highlights-\d{4}-\d{2}-\d{2}\.csv$/);

  const bytes = await readFile(await download.path());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = bytes.toString('utf8');
  expect(csv.slice(1).startsWith(`${HEADER}\r\n`)).toBe(true);

  // Sorting the records ignores collation differences between the browser and Node.
  const SQL = await initSqlJs();
  const library = parseKobo(SQL, new Uint8Array(await readFile(FIXTURE)));
  const expected = toCsv(library.highlights, { notesOnly: false });
  expect(records(csv.slice(1))).toEqual(records(expected.slice(1)));
  expect(errors).toEqual([]);
});

test('explains that a file is not a Kobo database', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('./');
  await page.getByLabel('Choose file').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a database'),
  });
  await expect(page.getByRole('alert')).toContainText('is not a Kobo database');
  expect(errors).toEqual([]);
});
