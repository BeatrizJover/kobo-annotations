const isFile = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;

const isDirectory = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry =>
  entry.isDirectory;

const fileOf = (entry: FileSystemFileEntry) =>
  new Promise<File>((resolve, reject) => entry.file(resolve, reject));

// readEntries returns at most about 100 entries per call, so it runs until a call returns none.
async function childrenOf(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return children;
    children.push(...batch);
  }
}

async function collect(
  entry: FileSystemEntry,
  keep: (name: string) => boolean,
  files: File[],
): Promise<void> {
  if (isFile(entry)) {
    if (keep(entry.name)) files.push(await fileOf(entry));
  } else if (isDirectory(entry)) {
    for (const child of await childrenOf(entry)) await collect(child, keep, files);
  }
}

/**
 * Files in the dropped folders and files, at any depth, whose name passes `keep`. The entries are
 * taken synchronously, since the drop data is gone once the event handler returns.
 */
export function filesFromDrop(
  data: DataTransfer,
  keep: (name: string) => boolean,
): Promise<File[]> {
  const entries = [...data.items]
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry() : null))
    .filter((entry) => entry !== null);
  if (entries.length === 0) {
    return Promise.resolve([...data.files].filter((file) => keep(file.name)));
  }
  return (async () => {
    const files: File[] = [];
    for (const entry of entries) await collect(entry, keep, files);
    return files;
  })();
}
