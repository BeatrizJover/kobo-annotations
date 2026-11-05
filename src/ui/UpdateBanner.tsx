import { useEffect, useState } from 'preact/hooks';

/** Subscribes to new app versions; `onUpdate` receives a function that activates and reloads. */
export type RegisterUpdates = (onUpdate: (apply: () => void) => void) => void;

export function UpdateBanner({ register }: { register: RegisterUpdates }) {
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => register((next) => setApply(() => next)), [register]);

  // The live region stays mounted so screen readers announce content added to it.
  return (
    <div role="status">
      {apply && (
        <div class="update-banner">
          <span>A new version of Kobo Annotations is available.</span>
          <div class="update-actions">
            <button type="button" class="button" onClick={apply}>
              Reload
            </button>
            <button type="button" class="button-plain" onClick={() => setApply(null)}>
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
