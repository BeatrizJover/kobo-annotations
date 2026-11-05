# kobo-annotations

Export the highlights from your Kobo e-reader to a CSV file, filtered by highlight color.
Everything runs in your browser: your reading data never leaves your computer.

Open it at <https://beatrizjover.github.io/kobo-annotations/>. In Chrome or Edge you can
install it as an app; after the first visit it also works offline.

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
