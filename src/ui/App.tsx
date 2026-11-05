import { useEffect, useRef, useState } from 'preact/hooks';
import type { KoboLibrary } from '../kobo/types';
import { StoreError, type HighlightStore, type StoreErrorCode } from '../store/db';
import { persistStorage } from '../store/persist';
import { LoadError, type LoadErrorCode, type LoadLibrary, type Phase } from '../worker/protocol';
import { DropZone } from './DropZone';
import { ExportPanel } from './ExportPanel';
import { FileHelp } from './FileHelp';
import { Library } from './Library';
import { SavedData } from './SavedData';

type Task =
  | { status: 'idle' }
  | { status: 'loading'; phase: Phase }
  | { status: 'error'; code: LoadErrorCode };

interface Shown {
  library: KoboLibrary;
  /** Whether `library` is what the browser has saved. */
  saved: boolean;
  /** Changes on every upload so the export filters reset. */
  key: number;
}

const PHASE_LABELS: Record<Phase, string> = {
  reading: 'Reading the file…',
  starting: 'Starting the database engine…',
  parsing: 'Looking for your highlights…',
};

const ERROR_MESSAGES: Record<LoadErrorCode, string> = {
  'not-sqlite':
    'This file is not a Kobo database. Choose KoboReader.sqlite from the .kobo folder on your Kobo.',
  'not-kobo':
    'This database does not come from a Kobo. Choose KoboReader.sqlite from the .kobo folder on your Kobo.',
  unreadable:
    'The file could not be read. It may be damaged or incomplete; copy it from the Kobo again and retry.',
  unexpected: 'Something went wrong while reading the file. Please try again.',
};

const STORE_MESSAGES: Record<StoreErrorCode, string> = {
  unavailable:
    'This browser is not saving your highlights (private browsing or storage turned off), so they will not be here next time. You can still export them.',
  full: 'There is no space left to save your highlights in this browser. You can still export them.',
  failed:
    'Your saved highlights could not be read or updated in this browser. You can still export them.',
};

const storeErrorCode = (error: unknown): StoreErrorCode =>
  error instanceof StoreError ? error.code : 'failed';

// Without this, a file dropped outside the drop zone makes the browser open or download it.
function useBlockStrayDrops() {
  useEffect(() => {
    const block = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);
}

interface AppProps {
  load: LoadLibrary;
  store: HighlightStore;
}

export function App({ load, store }: AppProps) {
  const [task, setTask] = useState<Task>({ status: 'idle' });
  const [shown, setShown] = useState<Shown | null>(null);
  const [storeError, setStoreError] = useState<StoreErrorCode | null>(null);
  const keys = useRef(0);
  // A file picked before the saved data arrives wins over it.
  const opened = useRef(false);
  useBlockStrayDrops();

  useEffect(() => {
    let active = true;
    store.load().then(
      (library) => {
        if (!active || opened.current || library.highlights.length === 0) return;
        setShown({ library, saved: true, key: ++keys.current });
      },
      (error: unknown) => {
        if (!active || opened.current) return;
        setStoreError(storeErrorCode(error));
      },
    );
    return () => {
      active = false;
    };
  }, [store]);

  const open = async (file: File) => {
    opened.current = true;
    setTask({ status: 'loading', phase: 'reading' });
    let parsed: KoboLibrary;
    try {
      parsed = await load(file, (phase) => setTask({ status: 'loading', phase }));
    } catch (error) {
      setTask({ status: 'error', code: error instanceof LoadError ? error.code : 'unexpected' });
      return;
    }
    try {
      const library = await store.save(parsed);
      setShown({ library, saved: true, key: ++keys.current });
      setStoreError(null);
      void persistStorage();
    } catch (error) {
      setShown({ library: parsed, saved: false, key: ++keys.current });
      setStoreError(storeErrorCode(error));
    }
    setTask({ status: 'idle' });
  };

  const clear = async () => {
    try {
      await store.clear();
      setShown(null);
      setStoreError(null);
    } catch (error) {
      setStoreError(storeErrorCode(error));
    }
  };

  const busy = task.status === 'loading';

  return (
    <main class="app">
      <h1>Kobo Annotations</h1>
      <p>Export your Kobo highlights to CSV. Your data never leaves this computer.</p>

      <DropZone busy={busy} onFile={open} />

      <div class="status" role="status">
        {task.status === 'loading' && (
          <div class="progress">
            <progress aria-label="Loading" />
            <span>{PHASE_LABELS[task.phase]}</span>
          </div>
        )}
      </div>
      {task.status === 'error' && (
        <p class="error" role="alert">
          {ERROR_MESSAGES[task.code]}
        </p>
      )}
      {storeError && (
        <p class="error" role="alert">
          {STORE_MESSAGES[storeError]}
        </p>
      )}

      {shown && (
        <>
          <ExportPanel key={shown.key} library={shown.library} />
          <Library highlights={shown.library.highlights} />
          <SavedData saved={shown.saved} onClear={clear} />
        </>
      )}

      <FileHelp />
    </main>
  );
}
