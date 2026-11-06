import { expect, test, type Locator } from '@playwright/test';

const FIXTURE = 'tests/fixtures/KoboReader.sqlite';
const COVERS = 'tests/fixtures/kobo-images';

// A decoded image proves the CSP lets blob: URLs through.
const decoded = (images: Locator) =>
  images.evaluateAll((list) =>
    list.every((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0),
  );

test('adds covers from a folder and keeps them across visits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./');
  await page.getByLabel('Choose file').setInputFiles(FIXTURE);
  const books = page.getByRole('region', { name: 'Your books' });
  await expect(books.getByRole('listitem').first()).toBeVisible();

  await page.getByLabel('Choose folder').setInputFiles(COVERS);
  await expect(page.getByText('Added covers for 4 books.')).toBeVisible();
  const covers = books.locator('img.book-cover');
  await expect(covers).toHaveCount(4);
  await expect.poll(() => decoded(covers)).toBe(true);

  await page.reload();
  await expect(covers).toHaveCount(4);
  await expect.poll(() => decoded(covers)).toBe(true);

  await page.getByRole('button', { name: /^The Glass Orchard/ }).click();
  const cover = page.getByRole('region', { name: 'The Glass Orchard' }).locator('img');
  await expect(cover).toHaveCount(1);
  await expect.poll(() => decoded(cover)).toBe(true);
  expect(errors).toEqual([]);
});
