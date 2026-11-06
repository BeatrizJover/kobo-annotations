import { useRef, useState } from 'preact/hooks';
import { parseCoverName } from '../covers/match';
import { filesFromDrop } from './folder';

const isCoverFile = (name: string) => parseCoverName(name) !== null;

interface CoverPickerProps {
  busy: boolean;
  /** Result of the last attempt, shown under the picker. */
  message: string | null;
  /** Receives the cover files of the chosen or dropped folder; rejects when it can't be read. */
  onFiles: (files: Promise<File[]>) => void;
}

export function CoverPicker({ busy, message, onFiles }: CoverPickerProps) {
  const [over, setOver] = useState(false);
  // Counts nested enter/leave pairs, since Safari's dragleave carries no relatedTarget.
  const depth = useRef(0);

  return (
    <>
      <div
        class={over && !busy ? 'cover-picker is-over' : 'cover-picker'}
        data-testid="cover-drop-zone"
        onDragEnter={() => {
          depth.current++;
          setOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          depth.current = 0;
          setOver(false);
          if (!busy && event.dataTransfer) onFiles(filesFromDrop(event.dataTransfer, isCoverFile));
        }}
      >
        <p>
          <strong>Add covers</strong> (optional): drag the <strong>.kobo-images</strong> folder from
          your Kobo here, or
        </p>
        <label class={busy ? 'button button-secondary is-disabled' : 'button button-secondary'}>
          Choose folder
          <input
            ref={(input) => {
              if (input) input.webkitdirectory = true;
            }}
            type="file"
            class="visually-hidden"
            disabled={busy}
            onChange={(event) => {
              const files = [...(event.currentTarget.files ?? [])].filter((f) =>
                isCoverFile(f.name),
              );
              event.currentTarget.value = '';
              onFiles(Promise.resolve(files));
            }}
          />
        </label>
      </div>
      <p class="hint cover-status" role="status">
        {message}
      </p>
    </>
  );
}
