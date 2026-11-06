export function FileHelp() {
  return (
    <details class="help">
      <summary>Where are my files?</summary>
      <p>
        Plug your Kobo into the computer with its USB cable and tap <strong>Connect</strong> on the
        e-reader. A drive called <strong>KOBOeReader</strong> appears.
      </p>
      <h3>Windows</h3>
      <ol>
        <li>
          Open <strong>This PC › KOBOeReader › .kobo</strong> and choose{' '}
          <strong>KoboReader.sqlite</strong>.
        </li>
        <li>
          If there is no <strong>.kobo</strong> folder, in File Explorer go to{' '}
          <strong>View › Show › Hidden items</strong> (Windows 11) or tick{' '}
          <strong>View › Hidden items</strong> (Windows 10).
        </li>
      </ol>
      <h3>Linux</h3>
      <ol>
        <li>
          In the file window, pick <strong>KOBOeReader</strong> under Devices or Places.
        </li>
        <li>
          Press <kbd>Ctrl</kbd>+<kbd>H</kbd> to show hidden folders, open <strong>.kobo</strong> and
          choose <strong>KoboReader.sqlite</strong>.
        </li>
        <li>
          Or press <kbd>Ctrl</kbd>+<kbd>L</kbd> and type{' '}
          <code>/media/your-user-name/KOBOeReader/.kobo/KoboReader.sqlite</code>.
        </li>
      </ol>
      <h3>Covers (optional)</h3>
      <p>
        Book covers are in another hidden folder, <strong>.kobo-images</strong>, at the top of the{' '}
        <strong>KOBOeReader</strong> drive. After loading your highlights, click{' '}
        <strong>Choose folder</strong> under <strong>Your books</strong>:
      </p>
      <ol>
        <li>
          Windows: open <strong>This PC › KOBOeReader</strong>, select <strong>.kobo-images</strong>{' '}
          and click <strong>Upload</strong> or <strong>Select Folder</strong>. Hidden folders show
          up as for <strong>.kobo</strong> above.
        </li>
        <li>
          Linux: pick <strong>KOBOeReader</strong>, press <kbd>Ctrl</kbd>+<kbd>H</kbd>, select{' '}
          <strong>.kobo-images</strong> and click <strong>Select</strong> or <strong>Upload</strong>
          . Or press <kbd>Ctrl</kbd>+<kbd>L</kbd> and type{' '}
          <code>/media/your-user-name/KOBOeReader/.kobo-images</code>.
        </li>
        <li>
          If the browser asks whether to upload the files, confirm: they are only read on this
          computer, nothing is sent anywhere.
        </li>
      </ol>
      <p>The files are only read, never changed. Eject the Kobo when you are done.</p>
      <p>
        Tip: before you sync or delete books, copy <strong>KoboReader.sqlite</strong> to your
        computer with the date in its name, for example <code>KoboReader_20261105.sqlite</code>.
        Highlights of deleted books stay in that copy, and you can load it here later.
      </p>
    </details>
  );
}
