import { useEffect, useState } from 'preact/hooks';

/** Subscribes to new app versions; `onUpdate` receives a function that activates and reloads. */
export type RegisterUpdates = (onUpdate: (apply: () => void) => void) => void;

export function UpdateBanner({ register }: { register: RegisterUpdates }) {
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => register((next) => setApply(() => next)), [register]);

  // The live region stays mounted and holds only the message, so screen readers announce just that.
  return (
    <div class={apply ? 'update-banner' : undefined}>
      <span role="status">{apply && 'A new version of Kobo Annotations is available.'}</span>
      {apply && (
        <div class="update-actions">
          <button type="button" class="button" onClick={apply}>
            Reload
          </button>
          <button type="button" class="button-plain" onClick={() => setApply(null)}>
            Later
          </button>
        </div>
      )}
    </div>
  );
}
