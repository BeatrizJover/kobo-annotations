import { useEffect, useRef, useState } from 'preact/hooks';

interface SavedDataProps {
  /** Whether the highlights on screen are the ones saved in this browser. */
  current: boolean;
  /** True while a file loads, since its save would write the data back. */
  disabled: boolean;
  onClear: () => Promise<void>;
}

export function SavedData({ current, disabled, onClear }: SavedDataProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const clearButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);

  // Keeps keyboard focus on the control that replaces the one just pressed.
  useEffect(() => {
    if (!toggled.current) return;
    (confirming ? cancelButton : clearButton).current?.focus();
  }, [confirming]);

  const toggle = (next: boolean) => {
    toggled.current = true;
    setConfirming(next);
  };

  const clear = async () => {
    setBusy(true);
    try {
      await onClear();
    } finally {
      setBusy(false);
      toggle(false);
    }
  };

  const locked = busy || disabled;

  return (
    <section class="saved-data" aria-label="Saved data">
      <p class="hint">
        {current
          ? 'Your highlights are saved in this browser, so they are here next time.'
          : 'This browser may still hold highlights saved from earlier files.'}{' '}
        They never leave this computer.
      </p>
      {confirming ? (
        <>
          <p>
            Delete the highlights saved in this browser? Your Kobo and exported files are not
            affected.
          </p>
          <div class="actions">
            <button type="button" class="button" disabled={locked} onClick={() => void clear()}>
              Delete saved data
            </button>
            <button
              ref={cancelButton}
              type="button"
              class="button-plain"
              disabled={busy}
              onClick={() => toggle(false)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button
          ref={clearButton}
          type="button"
          class="button-plain"
          disabled={locked}
          onClick={() => toggle(true)}
        >
          Clear saved data
        </button>
      )}
    </section>
  );
}
