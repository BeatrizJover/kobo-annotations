import { expect, test } from '@playwright/test';

const FIXTURE = 'tests/fixtures/KoboReader.sqlite';

test('keeps the highlights across visits until the saved data is cleared', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./');
  await page.getByLabel('Choose file').setInputFiles(FIXTURE);
  const books = page.getByRole('region', { name: 'Your books' }).getByRole('listitem');
  await expect(books.first()).toBeVisible();
  const count = await books.count();
  expect(count).toBeGreaterThan(1);

  const ascending = await books.allTextContents();
  await page.getByRole('radio', { name: 'Title (Z–A)' }).check();
  await expect(books).toHaveText([...ascending].reverse());

  await page.reload();
  await expect(page.getByText(/^Found .+ highlights in .+ books\.$/)).toBeVisible();
  await expect(books).toHaveCount(count);

  await page.getByRole('button', { name: 'Clear saved data' }).click();
  await page.getByRole('button', { name: 'Delete saved data' }).click();
  await expect(page.getByRole('region', { name: 'Your books' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Choose file')).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Export' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
