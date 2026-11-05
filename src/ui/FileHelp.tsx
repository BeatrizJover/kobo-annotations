export function FileHelp() {
  return (
    <details class="help">
      <summary>Where is my file?</summary>
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
          <strong>View › Show › Hidden items</strong>.
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
      <p>The file is only read, never changed. Eject the Kobo when you are done.</p>
    </details>
  );
}
