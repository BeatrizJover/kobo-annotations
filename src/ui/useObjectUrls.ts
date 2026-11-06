import { useEffect, useMemo } from 'preact/hooks';

/** Object URLs for the blobs, revoked when the map changes or the component unmounts. */
export function useObjectUrls(blobs: ReadonlyMap<string, Blob>): ReadonlyMap<string, string> {
  const urls = useMemo(
    () => new Map([...blobs].map(([key, blob]) => [key, URL.createObjectURL(blob)])),
    [blobs],
  );
  useEffect(
    () => () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
    [urls],
  );
  return urls;
}
