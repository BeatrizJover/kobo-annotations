import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KoboLibrary } from '../../src/kobo/types';
import { loadInWorker } from '../../src/worker/client';
import { LoadError, type Phase, type WorkerResponse } from '../../src/worker/protocol';

const { FakeWorker } = vi.hoisted(() => {
  class Fake {
    static last: Fake | undefined;
    onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    posted: unknown[] = [];
    terminate = vi.fn();

    constructor() {
      Fake.last = this;
    }

    postMessage(message: unknown) {
      this.posted.push(message);
    }

    send(message: WorkerResponse) {
      this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
    }
  }
  return { FakeWorker: Fake };
});
type FakeWorker = InstanceType<typeof FakeWorker>;

vi.mock('../../src/worker/kobo.worker?worker', () => ({ default: FakeWorker }));

const LIBRARY: KoboLibrary = { hasColor: true, highlights: [] };
const file = () => new File(['SQLite format 3'], 'KoboReader.sqlite');

async function started(phases: Phase[] = []) {
  FakeWorker.last = undefined;
  const result = loadInWorker(file(), (phase) => phases.push(phase));
  const current = () => FakeWorker.last;
  await vi.waitFor(() => expect(current()).toBeDefined());
  return { result, worker: current() as FakeWorker };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadInWorker', () => {
  it('posts the file bytes, forwards phases and terminates on success', async () => {
    const phases: Phase[] = [];
    const { result, worker } = await started(phases);
    expect(worker.posted).toEqual([{ buffer: expect.any(ArrayBuffer) }]);

    worker.send({ kind: 'phase', phase: 'starting' });
    worker.send({ kind: 'phase', phase: 'parsing' });
    worker.send({ kind: 'done', library: LIBRARY });

    await expect(result).resolves.toBe(LIBRARY);
    expect(phases).toEqual(['reading', 'starting', 'parsing']);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects with the code the worker reports and terminates', async () => {
    const { result, worker } = await started();
    worker.send({ kind: 'error', code: 'not-kobo' });
    await expect(result).rejects.toEqual(new LoadError('not-kobo'));
    await expect(result).rejects.toHaveProperty('code', 'not-kobo');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('treats a crashed worker as unexpected', async () => {
    const { result, worker } = await started();
    const event = new Event('error', { cancelable: true });
    worker.onerror?.(event);
    await expect(result).rejects.toHaveProperty('code', 'unexpected');
    expect(event.defaultPrevented).toBe(true);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('treats an undecodable message as unexpected', async () => {
    const { result, worker } = await started();
    worker.onmessageerror?.();
    await expect(result).rejects.toHaveProperty('code', 'unexpected');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('reports an unreadable file without starting a worker', async () => {
    FakeWorker.last = undefined;
    const broken = file();
    vi.spyOn(broken, 'arrayBuffer').mockRejectedValue(new DOMException('gone', 'NotReadableError'));
    await expect(loadInWorker(broken, () => undefined)).rejects.toHaveProperty(
      'code',
      'unreadable',
    );
    expect(FakeWorker.last as FakeWorker | undefined).toBeUndefined();
  });
});
