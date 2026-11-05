import KoboWorker from './kobo.worker?worker';
import { LoadError, type LoadLibrary, type WorkerResponse } from './protocol';

// A fresh worker per file, terminated afterwards, so the copy of the database in WASM memory is freed.
export const loadInWorker: LoadLibrary = async (file, onPhase) => {
  onPhase('reading');
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new LoadError('unreadable');
  }

  const worker = new KoboWorker();
  return new Promise((resolve, reject) => {
    const fail = (error: LoadError) => {
      worker.terminate();
      reject(error);
    };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.kind === 'phase') {
        onPhase(message.phase);
      } else if (message.kind === 'done') {
        worker.terminate();
        resolve(message.library);
      } else {
        fail(new LoadError(message.code));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(new LoadError('unexpected'));
    };
    worker.onmessageerror = () => fail(new LoadError('unexpected'));
    worker.postMessage({ buffer }, [buffer]);
  });
};
