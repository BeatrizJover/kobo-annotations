import { describe, expect, it } from 'vitest';
import { filesFromDrop } from '../../src/ui/folder';

type Node = File | { name: string; children: Node[] };

/** Mimics the entries API, returning a directory's children in batches of two. */
function entry(node: Node): FileSystemEntry {
  if (node instanceof File) {
    return {
      name: node.name,
      isFile: true,
      isDirectory: false,
      file: (resolve: (file: File) => void) => resolve(node),
    } as unknown as FileSystemFileEntry;
  }
  return {
    name: node.name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let next = 0;
      return {
        readEntries: (resolve: (entries: FileSystemEntry[]) => void) => {
          resolve(node.children.slice(next, next + 2).map(entry));
          next += 2;
        },
      };
    },
  } as unknown as FileSystemDirectoryEntry;
}

const dataTransfer = (nodes: Node[], files: File[] = []) =>
  ({
    items: nodes.map((node) => ({ kind: 'file', webkitGetAsEntry: () => entry(node) })),
    files,
  }) as unknown as DataTransfer;

const file = (name: string) => new File(['x'], name);
const keepCovers = (name: string) => name.endsWith('.parsed');

describe('filesFromDrop', () => {
  it('collects matching files from nested folders, past the first batch of entries', async () => {
    const folder: Node = {
      name: '.kobo-images',
      children: [
        { name: '1', children: [{ name: '2', children: [file('a.parsed'), file('b.txt')] }] },
        file('c.parsed'),
        file('d.parsed'),
        { name: '3', children: [] },
        file('e.parsed'),
      ],
    };
    const files = await filesFromDrop(dataTransfer([folder]), keepCovers);
    expect(files.map((f) => f.name)).toEqual(['a.parsed', 'c.parsed', 'd.parsed', 'e.parsed']);
  });

  it('takes loose dropped files too', async () => {
    const files = await filesFromDrop(dataTransfer([file('a.parsed'), file('b.txt')]), keepCovers);
    expect(files.map((f) => f.name)).toEqual(['a.parsed']);
  });

  it('falls back to the file list when there are no entries', async () => {
    const files = await filesFromDrop(
      dataTransfer([], [file('a.parsed'), file('b.txt')]),
      keepCovers,
    );
    expect(files.map((f) => f.name)).toEqual(['a.parsed']);
  });

  it('rejects when a folder cannot be read', async () => {
    const broken = {
      items: [
        {
          kind: 'file',
          webkitGetAsEntry: () => ({
            name: 'x',
            isFile: false,
            isDirectory: true,
            createReader: () => ({
              readEntries: (_: unknown, reject: (error: Error) => void) => reject(new Error('no')),
            }),
          }),
        },
      ],
      files: [],
    } as unknown as DataTransfer;
    await expect(filesFromDrop(broken, keepCovers)).rejects.toThrow();
  });
});
