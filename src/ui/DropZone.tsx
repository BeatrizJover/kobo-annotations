import { useState } from 'preact/hooks';

interface DropZoneProps {
  busy: boolean;
  onFile: (file: File) => void;
}

export function DropZone({ busy, onFile }: DropZoneProps) {
  const [over, setOver] = useState(false);

  const pick = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file && !busy) onFile(file);
  };

  return (
    <div
      class={over ? 'drop-zone is-over' : 'drop-zone'}
      data-testid="drop-zone"
      onDragOver={(event) => {
        event.preventDefault();
        setOver(!busy);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
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
