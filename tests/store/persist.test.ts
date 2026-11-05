// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistStorage } from '../../src/store/persist';

afterEach(() => {
  vi.unstubAllGlobals();
});

const withStorage = (storage: Partial<StorageManager>) => {
  vi.stubGlobal('navigator', { storage });
  return storage;
};

describe('persistStorage', () => {
  it('resolves false without the Storage API', async () => {
    vi.stubGlobal('navigator', {});
    expect(await persistStorage()).toBe(false);
  });

  it('does not ask again when the data is already persisted', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    withStorage({ persisted: () => Promise.resolve(true), persist });
    expect(await persistStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([true, false])('returns the browser answer (%s) when asked', async (granted) => {
    withStorage({
      persisted: () => Promise.resolve(false),
      persist: () => Promise.resolve(granted),
    });
    expect(await persistStorage()).toBe(granted);
  });

  it('resolves false when the browser throws', async () => {
    withStorage({
      persisted: () => Promise.resolve(false),
      persist: () => Promise.reject(new Error('denied')),
    });
    expect(await persistStorage()).toBe(false);
  });
});
