import { useEffect, useRef, useState } from 'preact/hooks';

export function ForgetBook({ onForget }: { onForget: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const forgetButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // Keeps keyboard focus on the control that replaces the one just pressed.
  useEffect(() => {
    if (!toggled.current) return;
    (confirming ? cancelButton : forgetButton).current?.focus();
  }, [confirming]);

  const toggle = (next: boolean) => {
    toggled.current = true;
    setConfirming(next);
  };

  // A successful forget unmounts this component, so only a failure resets it.
  const forget = async () => {
    setBusy(true);
    await onForget();
    if (!mounted.current) return;
    setBusy(false);
    toggle(false);
  };

  return confirming ? (
    <div class="forget">
      <p>
        Delete this book's saved highlights from this browser? Your Kobo and exported files are not
        affected.
      </p>
      <div class="actions">
        <button type="button" class="button" disabled={busy} onClick={() => void forget()}>
          Forget book
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
    </div>
  ) : (
    <button ref={forgetButton} type="button" class="button-plain" onClick={() => toggle(true)}>
      Forget this book
    </button>
  );
}
