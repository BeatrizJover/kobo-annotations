/// <reference types="node" />
import { writeFileSync } from 'node:fs';
import initSqlJs from 'sql.js';

type SqlJsStatic = initSqlJs.SqlJsStatic;
type Type = 'highlight' | 'note' | 'dogear' | 'markup';

interface TocEntry {
  file: string;
  anchor?: string;
  title: string;
  depth: number;
}

interface Book {
  id: string;
  title: string;
  author: string;
  language: string;
  /** Kobo stores the file path as the chapter title; `title` overrides it. */
  chapters: { file: string; title?: string | null }[];
  /** Table of contents in reading order (content type 899). */
  toc: TocEntry[];
}

interface Mark {
  book: number;
  chapter: number;
  anchor?: string;
  type: Type;
  text: string | null;
  annotation?: string | null;
  color?: number;
  progress: number;
  created: string;
  modified?: string;
  hidden?: boolean;
  context?: string;
  extra?: Uint8Array;
}

const SIDELOAD = 'file:///mnt/onboard/Synthetic/';
const STORE_ID = '0b7e4c2a-5d1f-4e8a-9c3b-6a2d8f1e0c47';
const DUPLICATE_ID = `${SIDELOAD}Eva Rumbo - El Faro Apagado.kepub.epub`;

const FARO_TOC: TocEntry[] = [
  { file: 'Text/cap01.xhtml', title: 'Capítulo uno', depth: 1 },
  { file: 'Text/cap02.xhtml', title: 'Medianoche', depth: 1 },
];

const BOOKS: Book[] = [
  {
    id: `${SIDELOAD}Ada Quill - The Glass Orchard.kepub.epub`,
    title: 'The Glass Orchard',
    author: 'Ada Quill',
    language: 'en',
    chapters: [
      { file: 'Text/ch01.xhtml' },
      { file: 'Text/ch02.xhtml', title: '' },
      { file: 'Text/ch03.xhtml' },
    ],
    // ch03 has no entry, so it inherits the last one of ch02; notes.xhtml is not a chapter file.
    toc: [
      { file: 'Text/ch01.xhtml', title: 'Seeds', depth: 1 },
      { file: 'Text/ch02.xhtml', anchor: 'section-1', title: 'Interlude', depth: 1 },
      { file: 'Text/ch02.xhtml', anchor: 'section-2', title: 'Second\u00AD Section ', depth: 2 },
      { file: 'Text/notes.xhtml', title: 'Endnotes', depth: 1 },
    ],
  },
  {
    id: `${SIDELOAD}Bo Lantern, Cy Marsh - Shared Title.kepub.epub`,
    title: 'Shared Title',
    author: 'Bo Lantern, Cy Marsh',
    language: 'en',
    chapters: [
      { file: 'Text/part1.xhtml' },
      { file: 'Text/part2.xhtml' },
      { file: 'Text/part3.xhtml' },
    ],
    // The TOC lists a later file first; part3 inherits from part2, the last entry in file order.
    toc: [
      { file: 'Text/part2.xhtml', title: 'Part Two', depth: 1 },
      { file: 'Text/part1.xhtml', title: 'Part One', depth: 1 },
    ],
  },
  {
    id: `${SIDELOAD}Dee Harrow - Shared Title.kepub.epub`,
    title: 'Shared Title',
    author: 'Dee Harrow',
    language: 'en',
    chapters: [{ file: 'Text/intro.xhtml' }],
    toc: [],
  },
  {
    id: STORE_ID,
    title: 'El Faro Apagado',
    author: 'Eva Rumbo',
    language: 'es',
    chapters: [{ file: 'Text/cap01.xhtml', title: null }, { file: 'Text/cap02.xhtml' }],
    toc: FARO_TOC,
  },
  {
    id: `${SIDELOAD}rtl-sample.kepub.epub`,
    title: 'كتاب تجريبي',
    author: 'مؤلف مجهول',
    language: 'ar',
    chapters: [{ file: 'Text/fasl1.xhtml' }],
    toc: [{ file: 'Text/fasl1.xhtml', title: 'الفصل الأول', depth: 1 }],
  },
  // A sideloaded copy of the store book above, given the same highlights below.
  {
    id: DUPLICATE_ID,
    title: 'El Faro Apagado',
    author: 'Eva Rumbo',
    language: 'es',
    chapters: [{ file: 'Text/cap01.xhtml', title: null }, { file: 'Text/cap02.xhtml' }],
    toc: FARO_TOC,
  },
];

// Inserted out of reading order so the parser's sorting is actually exercised.
const MARKS: Mark[] = [
  {
    book: 0,
    chapter: 2,
    type: 'highlight',
    color: 3,
    progress: 0.7,
    created: '2025-03-02T18:04:11.000',
    text: 'The wind carried seeds across the frozen river.\t\n',
  },
  {
    book: 0,
    chapter: 0,
    type: 'highlight',
    color: 0,
    progress: 0.1,
    created: '2025-03-01T09:26:53.000',
    text: 'The orchard was made of glass, and every branch rang like a bell.',
  },
  {
    book: 0,
    chapter: 0,
    type: 'highlight',
    color: 1,
    progress: 0.1,
    created: '2025-03-01T09:20:00.000',
    text: 'She counted the panes twice; the numbers never matched.',
  },
  {
    book: 0,
    chapter: 1,
    anchor: 'section-2',
    type: 'highlight',
    color: 2,
    progress: 0.4,
    created: '2025-03-01T21:12:40.000',
    text: '"Nothing breaks," he said, "unless you listen for it."',
  },
  {
    book: 0,
    chapter: 1,
    type: 'highlight',
    color: 0,
    progress: 0.45,
    created: '2025-03-01T21:30:02.000',
    text: 'First line of the verse.\nSecond line of the verse.\nThird line.',
  },
  {
    book: 0,
    chapter: 2,
    type: 'note',
    color: 0,
    progress: 0.75,
    created: '2025-03-02T18:10:00.000',
    modified: '2025-03-05T08:00:00Z',
    text: 'Light bends where the glass is thickest.',
    annotation: 'Compare with the opening scene.\nCheck later. ',
  },
  {
    book: 0,
    chapter: 0,
    type: 'highlight',
    color: 2,
    progress: 0.2,
    created: '2025-03-01T10:00:00.000',
    hidden: true,
    text: 'This highlight was deleted on the device.',
  },
  {
    book: 0,
    chapter: 0,
    type: 'dogear',
    progress: 0.15,
    created: '2025-03-01T09:40:00.000',
    text: null,
    context: 'Synthetic page context.',
  },
  {
    book: 0,
    chapter: 1,
    type: 'markup',
    progress: 0.5,
    created: '2025-03-01T22:00:00.000',
    text: null,
    extra: new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0xa0, 0xa1, 0xf0, 0x28, 0x8c, 0xbc]),
  },
  {
    book: 1,
    chapter: 0,
    type: 'highlight',
    color: 1,
    progress: 0.05,
    created: '2025-04-10T12:00:00.000',
    text: '=SUM(A1:A3) is not a formula here.',
  },
  {
    book: 1,
    chapter: 0,
    type: 'highlight',
    color: 2,
    progress: 0.15,
    created: '2025-04-10T12:05:00.000',
    text: '- a dash opens this line.',
  },
  {
    book: 1,
    chapter: 0,
    type: 'highlight',
    color: 3,
    progress: 0.25,
    created: '2025-04-10T12:10:00.000',
    text: '+ a plus sign comes first.',
  },
  {
    book: 1,
    chapter: 0,
    type: 'highlight',
    color: 0,
    progress: 0.35,
    created: '2025-04-10T12:15:00.000',
    text: '@handle style opening.',
  },
  {
    book: 1,
    chapter: 2,
    type: 'highlight',
    color: 0,
    progress: 0.5,
    created: '2025-04-11T08:00:00.000',
    text: 'The third part has no entry of its own.',
  },
  {
    book: 2,
    chapter: 0,
    type: 'highlight',
    color: 0,
    progress: 0.3,
    created: '2025-05-20T07:45:00.000',
    text: ' Leading space, soft\u00ADhyphen and a non\u00A0breaking space. ',
  },
  {
    book: 2,
    chapter: 0,
    type: 'highlight',
    color: 1,
    progress: 0.6,
    created: '2025-05-20T07:50:00.000',
    text: ' \n\t',
  },
  {
    book: 2,
    chapter: 0,
    type: 'highlight',
    color: 3,
    progress: 0.8,
    created: '2025-05-20T08:05:00.000',
    text: 'Some firmware leaves the annotation NULL.',
    annotation: null,
  },
  {
    book: 3,
    chapter: 0,
    type: 'highlight',
    color: 3,
    progress: 0.2,
    created: '2025-12-31T23:45:10.000',
    text: 'El faro se apagó a medianoche.',
  },
  {
    book: 3,
    chapter: 1,
    type: 'note',
    color: 1,
    progress: 0.8,
    created: '2026-01-01T00:15:00.000',
    text: 'Nadie volvió a encenderlo.',
    annotation: 'Nota: revisar; "comillas" incluidas.',
  },
  {
    book: 4,
    chapter: 0,
    type: 'highlight',
    color: 2,
    progress: 0.5,
    created: '2025-06-01T15:00:00.000',
    text: 'هذا نص تجريبي مكتوب من اليمين إلى اليسار.',
  },
];

const storeBook = BOOKS.findIndex((book) => book.id === STORE_ID);
const duplicateBook = BOOKS.findIndex((book) => book.id === DUPLICATE_ID);

const ALL_MARKS: Mark[] = [
  ...MARKS,
  ...MARKS.filter((mark) => mark.book === storeBook).map((mark) => ({
    ...mark,
    book: duplicateBook,
  })),
];

const USER_ID = 'synthetic-user';

const BOOKMARK_COLUMNS = [
  'BookmarkID TEXT NOT NULL',
  'VolumeID TEXT NOT NULL',
  'ContentID TEXT NOT NULL',
  'StartContainerPath TEXT NOT NULL',
  'StartContainerChildIndex INTEGER NOT NULL',
  'StartOffset INTEGER NOT NULL',
  'EndContainerPath TEXT NOT NULL',
  'EndContainerChildIndex INTEGER NOT NULL',
  'EndOffset INTEGER NOT NULL',
  'Text TEXT',
  'Annotation TEXT',
  'ExtraAnnotationData BLOB',
  'DateCreated TEXT',
  'ChapterProgress REAL NOT NULL DEFAULT 0',
  'Hidden BOOL NOT NULL DEFAULT 0',
  'Version TEXT',
  'DateModified TEXT',
  'Creator TEXT',
  'UUID TEXT',
  'UserID TEXT',
  'SyncTime TEXT',
  'Published BIT default false',
  'ContextString TEXT',
  'Type TEXT',
  'Color INTEGER DEFAULT 0',
];

const CONTENT_DDL = `CREATE TABLE content(
  ContentID TEXT NOT NULL, ContentType TEXT NOT NULL, MimeType TEXT NOT NULL, BookID TEXT,
  BookTitle TEXT, ImageId TEXT, Title TEXT COLLATE NOCASE, Attribution TEXT COLLATE NOCASE,
  Description TEXT, DateCreated TEXT, ShortCoverKey TEXT, adobe_location TEXT, Publisher TEXT,
  IsEncrypted BOOL, DateLastRead TEXT, FirstTimeReading BOOL, ChapterIDBookmarked TEXT,
  ParagraphBookmarked INTEGER, BookmarkWordOffset INTEGER, NumShortcovers INTEGER,
  VolumeIndex INTEGER, ___NumPages INTEGER, ReadStatus INTEGER, ___SyncTime TEXT,
  ___UserID TEXT NOT NULL, PublicationId TEXT, ___FileOffset INTEGER, ___FileSize INTEGER,
  ___PercentRead INTEGER, ___ExpirationStatus INTEGER, FavouritesIndex NOT NULL DEFAULT -1,
  Accessibility INTEGER DEFAULT 1, ContentURL TEXT, Language TEXT, BookshelfTags TEXT,
  IsDownloaded BIT NOT NULL DEFAULT 1, FeedbackType INTEGER DEFAULT 0,
  AverageRating INTEGER DEFAULT 0, Depth INTEGER, PageProgressDirection TEXT,
  InWishlist BOOL NOT NULL DEFAULT FALSE, ISBN TEXT,
  WishlistedDate TEXT DEFAULT "0000-00-00T00:00:00.000", FeedbackTypeSynced INTEGER DEFAULT 0,
  IsSocialEnabled BOOL NOT NULL DEFAULT TRUE, EpubType INT NOT NULL DEFAULT -1,
  Monetization INTEGER DEFAULT 2, ExternalId TEXT, Series TEXT, SeriesNumber TEXT,
  Subtitle TEXT, WordCount INTEGER DEFAULT -1, Fallback TEXT, RestOfBookEstimate INTEGER,
  CurrentChapterEstimate INTEGER, CurrentChapterProgress FLOAT, PocketStatus INTEGER DEFAULT 0,
  UnsyncedPocketChanges TEXT, ImageUrl TEXT, DateAdded TEXT, WorkId TEXT, Properties TEXT,
  RenditionSpread TEXT, RatingCount INTEGER DEFAULT 0, ReviewsSyncDate TEXT, MediaOverlay TEXT,
  MediaOverlayType TEXT, RedirectPreviewUrl TEXT, PreviewFileSize INTEGER, EntitlementId TEXT,
  CrossRevisionId TEXT, DownloadUrl TEXT, ReadStateSynced BIT NOT NULL DEFAULT false,
  TimesStartedReading INTEGER, TimeSpentReading INTEGER, LastTimeStartedReading TEXT,
  LastTimeFinishedReading TEXT, ApplicableSubscriptions TEXT, ExternalIds TEXT,
  PurchaseRevisionId TEXT, SeriesID TEXT, SeriesNumberFloat REAL, AdobeLoanExpiration TEXT,
  HideFromHomePage bit, IsInternetArchive BOOL NOT NULL DEFAULT FALSE, titleKana TEXT,
  subtitleKana TEXT, seriesKana TEXT, attributionKana TEXT, publisherKana TEXT,
  IsPurchaseable BOOL DEFAULT TRUE, IsSupported BOOL DEFAULT TRUE, AnnotationsSyncToken TEXT,
  DateModified TEXT DEFAULT "0000-00-00T00:00:00.000", StorePages INTEGER DEFAULT 0,
  StoreWordCount INTEGER DEFAULT 0, StoreTimeToReadLowerEstimate INTEGER DEFAULT 0,
  StoreTimeToReadUpperEstimate INTEGER DEFAULT 0, Duration INTEGER DEFAULT 0,
  IsAbridged BOOL DEFAULT NULL, SyncConflictType INTEGER DEFAULT 0,
  PRIMARY KEY (ContentID)
)`;

// Sideloaded chapters drop the `file://` scheme; store chapters keep the bare UUID.
function chapterId(book: Book, file: string): string {
  return `${book.id.replace(/^file:\/\//, '')}!OEBPS!${file}`;
}

/** Builds the synthetic KoboReader.sqlite; `withColor: false` mimics non-colour firmware. */
export function buildFixture(SQL: SqlJsStatic, { withColor }: { withColor: boolean }): Uint8Array {
  const db = new SQL.Database();
  const columns = withColor
    ? BOOKMARK_COLUMNS
    : BOOKMARK_COLUMNS.filter((c) => !c.startsWith('Color '));
  db.run('PRAGMA page_size = 1024');
  db.run(`CREATE TABLE Bookmark ( ${columns.join(', ')}, PRIMARY KEY (BookmarkID) )`);
  db.run(CONTENT_DDL);
  db.run('CREATE TABLE DbVersion( version INTEGER NOT NULL, PRIMARY KEY(version))');
  db.run('CREATE INDEX content_bookid_index ON content (BookID)');
  db.run('CREATE INDEX bookmark_content ON bookmark (ContentID)');
  db.run('CREATE INDEX bookmark_volume ON bookmark (VolumeID)');
  db.run('INSERT INTO DbVersion VALUES (176)');

  const insertContent = db.prepare(
    `INSERT INTO content (ContentID, ContentType, MimeType, BookID, BookTitle, Title, Attribution,
       VolumeIndex, ___UserID, Language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const book of BOOKS) {
    insertContent.run([
      book.id,
      '6',
      'application/x-kobo-epub+zip',
      null,
      null,
      book.title,
      book.author,
      -1,
      USER_ID,
      book.language,
    ]);
    book.chapters.forEach((chapter, index) => {
      insertContent.run([
        chapterId(book, chapter.file),
        '9',
        'application/xhtml+xml',
        book.id,
        book.title,
        chapter.title === undefined ? chapter.file : chapter.title,
        book.author,
        index,
        USER_ID,
        book.language,
      ]);
    });
  }
  insertContent.free();

  const insertToc = db.prepare(
    `INSERT INTO content (ContentID, ContentType, MimeType, BookID, BookTitle, Title,
       ChapterIDBookmarked, VolumeIndex, ___UserID, Language, Depth)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const book of BOOKS) {
    // Inserted in reverse so the parser has to order entries by VolumeIndex.
    book.toc
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .forEach(({ entry, index }) => {
        const file = chapterId(book, entry.file);
        const anchor = entry.anchor ? `#${entry.anchor}` : '';
        insertToc.run([
          `${file}${anchor}-${index + 1}`,
          '899',
          'application/x-kobo-epub+zip',
          book.id,
          book.title,
          entry.title,
          file,
          index,
          USER_ID,
          book.language,
          entry.depth,
        ]);
      });
  }
  insertToc.free();

  const markColumns = [
    'BookmarkID',
    'VolumeID',
    'ContentID',
    'StartContainerPath',
    'StartContainerChildIndex',
    'StartOffset',
    'EndContainerPath',
    'EndContainerChildIndex',
    'EndOffset',
    'Text',
    'Annotation',
    'ExtraAnnotationData',
    'DateCreated',
    'ChapterProgress',
    'Hidden',
    'DateModified',
    'Published',
    'ContextString',
    'Type',
    ...(withColor ? ['Color'] : []),
  ];
  const insertMark = db.prepare(
    `INSERT INTO Bookmark (${markColumns.join(', ')}) VALUES (${markColumns.map(() => '?').join(', ')})`,
  );
  ALL_MARKS.forEach((mark, index) => {
    const book = BOOKS[mark.book];
    const chapter = book?.chapters[mark.chapter];
    if (!book || !chapter) throw new Error(`Mark ${index} points to a missing book or chapter`);
    const contentId = chapterId(book, chapter.file) + (mark.anchor ? `#${mark.anchor}` : '');
    const hasText = mark.text !== null;
    const path = `span#kobo\\.${index + 1}\\.1`;
    insertMark.run([
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      book.id,
      contentId,
      path,
      -99,
      0,
      path,
      -99,
      mark.text?.length ?? 0,
      mark.text,
      hasText && mark.annotation !== null ? (mark.annotation ?? '') : null,
      mark.extra ?? null,
      mark.created,
      mark.progress,
      mark.hidden ? 'true' : 'false',
      mark.modified ?? `${mark.created.slice(0, 19)}Z`,
      'false',
      mark.context ?? null,
      mark.type,
      ...(withColor ? [mark.color ?? 0] : []),
    ]);
  });
  insertMark.free();

  const bytes = db.export();
  db.close();
  return bytes;
}

export const FIXTURES = {
  'KoboReader.sqlite': { withColor: true },
  'KoboReader-nocolor.sqlite': { withColor: false },
} as const;

if (process.argv[1] === import.meta.filename) {
  const SQL = await initSqlJs();
  for (const [name, options] of Object.entries(FIXTURES)) {
    const target = new URL(`../tests/fixtures/${name}`, import.meta.url);
    writeFileSync(target, buildFixture(SQL, options));
    console.log(`Wrote ${target.pathname}`);
  }
}
