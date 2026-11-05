/** Asks the browser to keep saved data under storage pressure; resolves false when it won't. */
export async function persistStorage(): Promise<boolean> {
  try {
    const storage = 'storage' in navigator ? navigator.storage : undefined;
    if (typeof storage?.persist !== 'function') return false;
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}
