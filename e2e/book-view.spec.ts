import { expect, test } from '@playwright/test';

const FIXTURE = 'tests/fixtures/KoboReader.sqlite';

test('opens a book, switches tabs, filters by colour and goes back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./');
  await page.getByLabel('Choose file').setInputFiles(FIXTURE);

  const tile = page.getByRole('button', { name: /^The Glass Orchard/ });
  await tile.click();
  const view = page.getByRole('region', { name: 'The Glass Orchard' });
  await expect(view.getByRole('heading', { level: 2 })).toBeFocused();
  const cards = view.getByRole('listitem');
  const total = await cards.count();
  expect(total).toBeGreaterThan(1);

  await view.getByRole('checkbox', { name: 'All' }).uncheck();
  await expect(view.getByText('No highlights match the selected colors.')).toBeVisible();
  await view.getByRole('checkbox', { name: /^Pink/ }).check();
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThan(total);

  await view.getByRole('tab', { name: /^Highlights/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(view.getByRole('tab', { name: /^Notes/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(view.getByText('Stats are coming in a later version.')).toBeVisible();

  await view.getByRole('button', { name: '← All books' }).click();
  await expect(view).toHaveCount(0);
  await expect(tile).toBeFocused();
  expect(errors).toEqual([]);
});
