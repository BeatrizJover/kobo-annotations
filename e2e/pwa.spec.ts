/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const FIXTURE = 'tests/fixtures/KoboReader.sqlite';

interface Manifest {
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; purpose?: string }[];
}

test('serves an installable web app manifest', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href ?? '', page.url()).href;
  const response = await request.get(manifestUrl);
  expect(response.ok()).toBe(true);

  const manifest = (await response.json()) as Manifest;
  expect(manifest).toMatchObject({
    start_url: '/kobo-annotations/',
    scope: '/kobo-annotations/',
    display: 'standalone',
  });
  expect(manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose ?? 'any'}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ]);
  for (const icon of manifest.icons) {
    const image = await request.get(new URL(icon.src, manifestUrl).href);
    expect(image.headers()['content-type']).toBe('image/png');
  }
});

test('loads the database and exports offline after the first visit', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await page.getByLabel('Choose file').setInputFiles(FIXTURE);
  await expect(page.getByText(/^Found .+ highlights in .+ books\.$/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Download CSV/ }).click(),
  ]);
  const bytes = await readFile(await download.path());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(bytes.subarray(3).toString('utf8')).toMatch(/^"Book";"Author";/);
});
