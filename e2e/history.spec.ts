import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import initSqlJs from 'sql.js';

const FIXTURE = 'tests/fixtures/KoboReader.sqlite';

/** The fixture as a Kobo would export it once one book's highlights were deleted. */
async function withoutBook(fragment: string) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(FIXTURE));
  db.run('DELETE FROM Bookmark WHERE VolumeID LIKE ?', [`%${fragment}%`]);
  const buffer = Buffer.from(db.export());
  db.close();
  return { name: 'KoboReader.sqlite', mimeType: 'application/octet-stream', buffer };
}

test('marks new highlights and forgets a book that left the Kobo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const reduced = await withoutBook('Ada Quill');
  const input = page.getByLabel('Choose file');
  const tile = page.getByRole('button', { name: /^The Glass Orchard/ });
  const found = page.getByText(/^Found .+ highlights in .+ books\.$/);
  await page.goto('./');

  await input.setInputFiles(reduced);
  await expect(found).toBeVisible();
  await expect(tile).toHaveCount(0);

  await input.setInputFiles(FIXTURE);
  await expect(tile).toContainText(/\d+ new/);
  await expect(page.getByText(/new since last time\.$/)).toBeVisible();

  await input.setInputFiles(reduced);
  await expect(tile).toContainText('Not on your Kobo');
  await tile.click();
  await page.getByRole('button', { name: 'Forget this book' }).click();
  await page.getByRole('button', { name: 'Forget book' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your books' })).toBeFocused();
  await expect(tile).toHaveCount(0);

  await page.reload();
  await expect(found).toBeVisible();
  await expect(tile).toHaveCount(0);
  expect(errors).toEqual([]);
});
