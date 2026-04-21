/**
 * Regenerates the checked-in fixture PDFs under `fixtures/sources/`.
 *
 * Why pdf-lib: tiny, pure-JS, no native deps — safe on Windows + CI.
 * Why a build script (not a runtime dep): the PDFs themselves are the
 * test artefact; we only need pdf-lib when we intentionally regenerate
 * fixtures. Keeps the production bundle lean.
 *
 * Determinism: we fix creation/mod dates to epoch and use a standard
 * font so regenerating twice produces byte-identical output. This keeps
 * the git diff quiet on unrelated runs of `pnpm fixtures:build`.
 *
 * Run: `pnpm fixtures:build`
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

type FixtureSpec = {
  filename: string;
  title: string;
  pages: string[][]; // page → lines
};

const OUT_DIR = path.resolve(process.cwd(), 'fixtures/sources');
const EPOCH = new Date(0);

const FIXTURES: FixtureSpec[] = [
  {
    filename: 'sample-report.pdf',
    title: 'Sample Report',
    pages: [
      [
        'Page One',
        '',
        'This is the first page of a fake report used by the OCR fake in tests.',
        '',
        'Recommendation 1: Establish a board-level risk committee to meet quarterly.',
        '',
        'Recommendation 2: Publish an annual safeguarding report within three months of year-end.',
      ],
      [
        'Page Two',
        '',
        'Second page content, distinct from page one so tests can assert page splitting.',
        '',
        'Recommendation 3: Rotate external auditors at least every seven financial years.',
      ],
    ],
  },
  {
    filename: 'sample-policy.pdf',
    title: 'Sample Policy Review',
    pages: [
      [
        'Policy Review — Page One',
        '',
        'Synthetic policy review fixture for pipeline tests.',
        '',
        'Recommendation 1: Adopt a written conflict-of-interest policy reviewed annually by trustees.',
        '',
        'Recommendation 2: Provide induction training for all new trustees within 60 days of appointment.',
      ],
      [
        'Policy Review — Page Two',
        '',
        'Continuation page.',
        '',
        'Recommendation 3: Publish trustee attendance statistics alongside the annual report.',
      ],
    ],
  },
];

async function buildPdf(spec: FixtureSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle(spec.title);
  pdf.setAuthor('open-recs-local fixtures');
  pdf.setCreationDate(EPOCH);
  pdf.setModificationDate(EPOCH);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;
  const lineHeight = 16;
  const margin = 50;

  for (const pageLines of spec.pages) {
    const page = pdf.addPage([595, 842]); // A4
    const { height } = page.getSize();
    let cursorY = height - margin;
    for (const line of pageLines) {
      page.drawText(line, { x: margin, y: cursorY, size: fontSize, font });
      cursorY -= lineHeight;
    }
  }

  // useObjectStreams:false keeps the raw object layout stable across runs.
  return pdf.save({ useObjectStreams: false });
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  for (const spec of FIXTURES) {
    const bytes = await buildPdf(spec);
    const outPath = path.join(OUT_DIR, spec.filename);
    await writeFile(outPath, bytes);
    // eslint-disable-next-line no-console
    console.log(`wrote ${outPath} (${bytes.length} bytes)`);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
