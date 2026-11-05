import { useRef, useState } from 'preact/hooks';

interface DropZoneProps {
  busy: boolean;
  onFile: (file: File) => void;
}

export function DropZone({ busy, onFile }: DropZoneProps) {
  const [over, setOver] = useState(false);
  // Counts nested enter/leave pairs, since Safari's dragleave carries no relatedTarget.
  const depth = useRef(0);

  const pick = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file && !busy) onFile(file);
  };

  return (
    <div
      class={over && !busy ? 'drop-zone is-over' : 'drop-zone'}
      data-testid="drop-zone"
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
        pick(event.dataTransfer?.files);
      }}
    >
      <p>Drag your KoboReader.sqlite file here, or</p>
      <label class={busy ? 'button is-disabled' : 'button'}>
        Choose file
        <input
          type="file"
          accept=".sqlite"
          class="visually-hidden"
          disabled={busy}
          onChange={(event) => {
            pick(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
      </label>
    </div>
  );
}
