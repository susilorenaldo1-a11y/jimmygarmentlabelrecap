# Barcode Recap — PDF → Google Sheets

A small web app (deployable to **Vercel**) that lets a customer upload a
text-based purchase-order PDF, automatically extracts each style's
**barcode (STYLE NUMBER)**, **description (STYLE #)**, **colour** and
**unit price**, then appends new styles to a **Google Sheet** that acts as the
global recap.

This removes the manual (error-prone) step of typing barcodes/descriptions into
the recap spreadsheet.

## How it works

1. User drops a PDF (e.g. `5614 JIMMY G AUS 001.PDF`).
2. `/api/parse` extracts the text with `pdfjs-dist`, reconstructs the table
   lines, and returns `barcode / description / colour / price` per style.
3. The user reviews the result in a table (can edit/untick before committing).
4. `/api/write` appends the rows to the Google Sheet, **skipping barcodes that
   already exist** (deduplication).

## Tech stack

- **Next.js 14** (App Router) — runs on Vercel as serverless functions.
- **pdfjs-dist** — text extraction (no OCR; these PDFs have a text layer).
- **google-spreadsheet** + **google-auth-library** — write to Sheets via a
  service account.

## 1. Local setup

```
cd barcode-app
npm install
cp .env.example .env.local
```

Fill `.env.local` (see below), then:

```
npm run dev
```

Open http://localhost:3000.

## 2. Google setup (one time)

1. Open the Google Cloud Console: https://console.cloud.google.com
2. Create/select a project, then enable the **Google Sheets API**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
4. Add a JSON **key** to the service account and download it.
5. Copy the service account **email** (e.g. `xxx@xxx.iam.gserviceaccount.com`).

Convert your recap spreadsheet to Google Sheets:

1. Upload `barcode C426.xls` to Google Drive → open with Google Sheets
   (or import via Drive). This gives you a live "global recap" the app can edit.
2. **Share** that spreadsheet with the service account email as **Editor**.
3. Copy the **spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/THIS_ID/edit`.

## 3. Environment variables

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the service account email |
| `GOOGLE_PRIVATE_KEY` | the `private_key` value from the JSON key (including the `-----BEGIN PRIVATE KEY-----` block) |
| `GOOGLE_SHEET_ID` | the spreadsheet ID from the URL |
| `GOOGLE_SHEET_TITLE` | worksheet tab to write to (default `Recap`) |

> `GOOGLE_PRIVATE_KEY` contains literal `\n` characters. The app converts those
> back to real newlines automatically — paste the value as-is (in Vercel, wrap
> it in double quotes so Vercel preserves the newlines).

## 4. Deploy to Vercel

1. Push this folder to a Git repo (GitHub/GitLab).
2. In Vercel: **New Project → import the repo**.
3. Framework preset: **Next.js** (auto-detected).
4. Add the four environment variables above.
5. Deploy.

That's it. The customer visits the URL, uploads a PDF, reviews, and clicks
"Write to Google Sheet".

## Output columns

The target sheet uses these four columns (created automatically if the tab is
missing):

```
STYLE NUMBER | STYLE # | COLOUR | UNIT PRICE (USD)
```

If you point `GOOGLE_SHEET_TITLE` at an existing tab, the app writes to its
first four columns and deduplicates on the first column (barcode).

## Notes / assumptions

- PDFs must have a **selectable text layer** (like the example). Scanned/image
  PDFs are not supported in this version.
- Prices are read from the PDF line items (the `11.80` style values). The
  `DOC SMS C127.xlsx` price list is a separate reference and is not auto-merged
  in this version.
- Barcodes are de-duplicated: a style already present in the target sheet is
  skipped on re-upload.
