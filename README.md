# kobo-annotations

Export the highlights from your Kobo e-reader to a CSV file, filtered by highlight color.
Everything runs in your browser: your reading data never leaves your computer.

Open it at <https://beatrizjover.github.io/kobo-annotations/>. In Chrome, Edge or Safari
(Add to Dock) you can install it as an app; after the first visit it also works offline.

## User guide

You need your Kobo, its USB cable and a computer with Chrome, Edge, Firefox or Safari.

### 1. Connect your Kobo

Plug the Kobo into the computer with the USB cable and tap **Connect** on the e-reader.
A drive called **KOBOeReader** appears on the computer.

### 2. Open the app

Go to <https://beatrizjover.github.io/kobo-annotations/>. To install it, click the install icon
at the right end of the address bar (Chrome and Edge). Installing is optional.

### 3. Choose your `KoboReader.sqlite` file

Click **Choose file**, or drag the file onto the page.

**Windows**

1. In the file window, open **This PC › KOBOeReader › .kobo**.
2. Choose **KoboReader.sqlite**.
3. If there is no **.kobo** folder, open File Explorer and go to **View › Show › Hidden items**,
   then try again.

**Linux**

1. In the file window, pick **KOBOeReader** under Devices or Places.
2. Press <kbd>Ctrl</kbd>+<kbd>H</kbd> to show hidden folders, open **.kobo** and choose
   **KoboReader.sqlite**.
3. Or press <kbd>Ctrl</kbd>+<kbd>L</kbd> and type
   `/media/your-user-name/KOBOeReader/.kobo/KoboReader.sqlite`.

The app reads the file on your computer. It never uploads it and never changes it.

### 4. Pick what to export and download

The app shows how many highlights and books it found.

- **Colors**: untick the colors you don't want. The number next to each color is its count.
  On Kobo models without colored highlights this section is hidden.
- **Notes only**: tick it to export only the highlights where you wrote a note.

Click **Download CSV**. The file is saved as `kobo-highlights-YYYY-MM-DD.csv` in your
Downloads folder.

### 5. Open the CSV

Double-click the file to open it in Excel or LibreOffice Calc. Each row is one highlight, with
these columns: Book, Author, Chapter No, Chapter, Highlight, Note, Color, Date, Time.

### 6. Eject the Kobo

Eject the **KOBOeReader** drive before you unplug the cable.

### Keep a backup

Before you sync your Kobo or delete books from it, copy `KoboReader.sqlite` to your computer
with the date in its name, for example `KoboReader_20261105.sqlite`. Highlights of deleted
books stay in that copy, and you can load it in the app later.

### Common problems

- **"This file is not a Kobo database"** or **"This database does not come from a Kobo"**: you
  picked another file. Choose `KoboReader.sqlite` from the `.kobo` folder.
- **"The file could not be read"**: the copy may be incomplete. Copy it from the Kobo again
  and retry.
- **"No highlights or notes were found in this file"**: the Kobo has no highlights yet, or you
  loaded an old copy of the file.
- **Excel shows everything in one column**: the file uses `;` between columns, and your Excel
  expects `,`. In Excel, go to **Data › From Text/CSV**, choose the file and pick
  **Semicolon** as the delimiter.
- **The app shows an old version**: when a new version is out, the app shows a message with a
  **Reload** button. Click it.

### Privacy

The app is a static web page. It makes no network requests with your data and has no analytics.
Your file is read only inside your browser.

## Development

Requires Node.js 22.18 or later (see `.nvmrc`).

```sh
npm ci
npm run dev        # local dev server
npm run build      # production build in dist/
npm run fixture    # regenerate the synthetic test databases in tests/fixtures/
npm run icons      # regenerate the app icons in public/icons/ from the theme colours
```

Checks run in CI on every pull request:

```sh
npm run lint && npm run format:check && npm run typecheck && npm test
```

## License

MIT
