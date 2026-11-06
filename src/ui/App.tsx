import { useEffect, useRef, useState } from 'preact/hooks';
import type { KoboLibrary } from '../kobo/types';
import { StoreError, type HighlightStore, type StoreErrorCode } from '../store/db';
import { persistStorage } from '../store/persist';
import { LoadError, type LoadErrorCode, type LoadLibrary, type Phase } from '../worker/protocol';
import { BookView } from './BookView';
import { DropZone } from './DropZone';
import { ExportPanel } from './ExportPanel';
import { FileHelp } from './FileHelp';
import { Library } from './Library';
import { ReadingIllustration } from './ReadingIllustration';
import { SavedData } from './SavedData';

type Task =
  | { status: 'idle' }
  | { status: 'loading'; phase: Phase }
  | { status: 'error'; code: LoadErrorCode };

interface Shown {
  library: KoboLibrary;
  /** Whether `library` is what the browser has saved. */
  saved: boolean;
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
  // Whether the browser holds saved highlights, which may differ from what is shown.
  const [hasSaved, setHasSaved] = useState(false);
  const [openBook, setOpenBook] = useState<string | null>(null);
  // Only Back returns focus to the book tile; a new file keeps it where the user is.
  const [returning, setReturning] = useState(false);
  // A file read before the saved data arrives wins over it.
  const opened = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useBlockStrayDrops();

  useEffect(() => {
    let active = true;
    store.load().then(
      (library) => {
        if (!active || library.highlights.length === 0) return;
        setHasSaved(true);
        if (!opened.current) setShown({ library, saved: true });
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
    setTask({ status: 'loading', phase: 'reading' });
    let parsed: KoboLibrary;
    try {
      parsed = await load(file, (phase) => setTask({ status: 'loading', phase }));
    } catch (error) {
      setTask({ status: 'error', code: error instanceof LoadError ? error.code : 'unexpected' });
      return;
    }
    opened.current = true;
    setOpenBook(null);
    setReturning(false);
    try {
      const library = await store.save(parsed);
      setShown({ library, saved: true });
      setHasSaved(true);
      setStoreError(null);
      void persistStorage();
    } catch (error) {
      setShown({ library: parsed, saved: false });
      setStoreError(storeErrorCode(error));
    }
    setTask({ status: 'idle' });
  };

  const clear = async () => {
    try {
      await store.clear();
      setShown(null);
      setOpenBook(null);
      setReturning(false);
      setHasSaved(false);
      setStoreError(null);
      // The clear controls are gone, so focus moves to the next useful action.
      fileInput.current?.focus();
    } catch (error) {
      setStoreError(storeErrorCode(error));
    }
  };

  const forget = async (bookId: string) => {
    try {
      const library = await store.forgetBook(bookId);
      setStoreError(null);
      // The user may have gone back and opened another book while this one was being deleted.
      setOpenBook((open) => (open === bookId ? null : open));
      if (library.highlights.length === 0) {
        setShown(null);
        setHasSaved(false);
        setReturning(false);
        fileInput.current?.focus();
        return;
      }
      setShown({ library, saved: true });
      setReturning(true);
    } catch (error) {
      setStoreError(storeErrorCode(error));
    }
  };

  const busy = task.status === 'loading';

  return (
    <main class="app">
      <h1>
        Kobo <span class="highlighter">Annotations</span>
      </h1>
      <p>Hold on to every line you loved.</p>

      <div class="upload">
        <div>
          <DropZone busy={busy} onFile={open} inputRef={fileInput} />
          <FileHelp />
        </div>
        <ReadingIllustration />
      </div>

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
          <ExportPanel library={shown.library} />
          <Library
            library={shown.library}
            hidden={openBook !== null}
            restoreFocus={returning}
            onOpen={setOpenBook}
          />
          {openBook !== null && (
            <BookView
              library={shown.library}
              bookId={openBook}
              onBack={() => {
                setOpenBook(null);
                setReturning(true);
              }}
              onForget={shown.saved ? () => forget(openBook) : undefined}
            />
          )}
        </>
      )}
      {(hasSaved || storeError === 'failed') && (
        <SavedData current={shown?.saved ?? false} disabled={busy} onClear={clear} />
      )}
    </main>
  );
}
