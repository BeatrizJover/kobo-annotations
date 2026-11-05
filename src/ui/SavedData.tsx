import { useState } from 'preact/hooks';

interface SavedDataProps {
  saved: boolean;
  onClear: () => Promise<void>;
}

export function SavedData({ saved, onClear }: SavedDataProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!saved) return null;

  const clear = async () => {
    setBusy(true);
    try {
      await onClear();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section class="saved-data" aria-label="Saved data">
      <p class="hint">
        Your highlights are saved in this browser, so they are here next time. They never leave this
        computer.
      </p>
      {confirming ? (
        <div class="actions">
          <p class="hint">
            Delete the highlights saved in this browser? Your Kobo and exported files are not
            affected.
          </p>
          <button type="button" class="button" disabled={busy} onClick={() => void clear()}>
            Delete saved data
          </button>
          <button
            type="button"
            class="button-plain"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" class="button-plain" onClick={() => setConfirming(true)}>
          Clear saved data
        </button>
      )}
    </section>
  );
}
