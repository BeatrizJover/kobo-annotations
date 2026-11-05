import { useEffect, useRef, useState } from 'preact/hooks';
import type { KoboLibrary } from '../kobo/types';
import { LoadError, type LoadErrorCode, type LoadLibrary, type Phase } from '../worker/protocol';
import { DropZone } from './DropZone';
import { ExportPanel } from './ExportPanel';
import { FileHelp } from './FileHelp';

type State =
  | { status: 'idle' }
  | { status: 'loading'; phase: Phase }
  | { status: 'error'; code: LoadErrorCode }
  | { status: 'ready'; library: KoboLibrary; loadId: number };

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

export function App({ load }: { load: LoadLibrary }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const loads = useRef(0);
  useBlockStrayDrops();

  const open = async (file: File) => {
    setState({ status: 'loading', phase: 'reading' });
    try {
      const library = await load(file, (phase) => setState({ status: 'loading', phase }));
      setState({ status: 'ready', library, loadId: ++loads.current });
    } catch (error) {
      setState({ status: 'error', code: error instanceof LoadError ? error.code : 'unexpected' });
    }
  };

  return (
    <main class="app">
      <h1>Kobo Annotations</h1>
      <p>Export your Kobo highlights to CSV. Your data never leaves this computer.</p>

      <DropZone busy={state.status === 'loading'} onFile={open} />

      <div class="status" role="status">
        {state.status === 'loading' && (
          <div class="progress">
            <progress aria-label="Loading" />
            <span>{PHASE_LABELS[state.phase]}</span>
          </div>
        )}
      </div>
      {state.status === 'error' && (
        <p class="error" role="alert">
          {ERROR_MESSAGES[state.code]}
        </p>
      )}
      {state.status === 'ready' && <ExportPanel key={state.loadId} library={state.library} />}

      <FileHelp />
    </main>
  );
}
