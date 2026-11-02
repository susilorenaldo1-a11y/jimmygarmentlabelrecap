import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { SIZE_COLUMNS } from "./constants";

export const HEADERS = [
  "STYLE NUMBER",
  "STYLE #",
  "COLOUR",
  "UNIT PRICE (USD)",
  "TOTAL",
  ...SIZE_COLUMNS,
];

export interface WriteRow {
  barcode: string;
  description: string;
  colour: string;
  price: number;
  total: number;
  sizes: Record<string, number>;
}

export interface WriteResult {
  added: number;
  skipped: number;
  sheetTitle: string;
  addedBarcodes: string[];
}

function normalizePrivateKey(raw: string): string {
  let key = (raw || "").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/\\n/g, "\n").replace(/\r\n?/g, "\n");

  const beginRe = /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/;
  const endRe = /-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----/;
  const bm = key.match(beginRe);
  const em = key.match(endRe);
  if (!bm || !em) return key;

  const bodyStart = (bm.index ?? 0) + bm[0].length;
  const bodyEnd = em.index ?? key.length;
  const body = key.slice(bodyStart, bodyEnd).replace(/\s+/g, "");
  if (!body) return key;

  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${bm[0]}\n${wrapped}\n${em[0]}\n`;
}

function getAuth(): JWT {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const key = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY || "");
  if (!email) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL");
  }
  if (!/-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/.test(key)) {
    throw new Error(
      "GOOGLE_PRIVATE_KEY is not a valid PEM key. Paste the full 'private_key' value from your service-account JSON, including the -----BEGIN/END PRIVATE KEY----- lines."
    );
  }
  return new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export function errorMessage(e: unknown): string {
  const err = e as { response?: { data?: unknown }; message?: string };
  const data = err?.response?.data;
  if (data) {
    if (typeof data === "string") return data;
    const api = (data as { error?: unknown }).error;
    if (typeof api === "string") return api;
    const apiObj = api as { message?: string; errors?: { message?: string }[] };
    if (apiObj?.message) return apiObj.message;
    if (Array.isArray(apiObj?.errors) && apiObj.errors.length) {
      return apiObj.errors.map((x) => x.message).join("; ");
    }
  }
  return err?.message || "Unknown error";
}

function normalizeSheetId(raw: string): string {
  const s = (raw || "").trim();
  const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : s;
}

async function getSheet(doc: GoogleSpreadsheet, title: string) {
  let sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues: HEADERS });
  }
  await sheet.loadHeaderRow();
  let header = sheet.headerValues || [];
  if (!header || header.length < HEADERS.length) {
    await sheet.setHeaderRow(HEADERS);
    header = HEADERS;
  }
  return { sheet, header };
}

function rowToObject(row: WriteRow, header: string[]): Record<string, string | number> {
  const obj: Record<string, string | number> = {
    [header[0]]: row.barcode.trim(),
    [header[1]]: row.description || "",
    [header[2]]: row.colour || "",
    [header[3]]: row.price,
    [header[4]]: row.total,
  };
  SIZE_COLUMNS.forEach((size, idx) => {
    obj[header[5 + idx]] = row.sizes?.[size] ?? 0;
  });
  return obj;
}

export async function writeToSheet(rows: WriteRow[]): Promise<WriteResult> {
  const sheetId = normalizeSheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  const title = process.env.GOOGLE_SHEET_TITLE || "Recap";

  const doc = new GoogleSpreadsheet(sheetId, getAuth());
  await doc.loadInfo();
  const { sheet, header } = await getSheet(doc, title);

  const existingRows = await sheet.getRows();
  const existingBarcodes = new Set(
    existingRows.map((r) => String(r.get(header[0]) ?? "").trim())
  );

  const toAdd: Record<string, string | number>[] = [];
  const addedBarcodes: string[] = [];
  let skipped = 0;
  for (const row of rows) {
    const barcode = (row.barcode || "").trim();
    if (!barcode) continue;
    if (existingBarcodes.has(barcode)) {
      skipped++;
      continue;
    }
    toAdd.push(rowToObject(row, header));
    existingBarcodes.add(barcode);
    addedBarcodes.push(barcode);
  }

  if (toAdd.length) {
    await sheet.addRows(toAdd);
  }

  return { added: toAdd.length, skipped, sheetTitle: title, addedBarcodes };
}

export async function deleteFromSheet(barcodes: string[]): Promise<{ deleted: number }> {
  const sheetId = normalizeSheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  const title = process.env.GOOGLE_SHEET_TITLE || "Recap";

  const doc = new GoogleSpreadsheet(sheetId, getAuth());
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle[title];
  if (!sheet) return { deleted: 0 };

  await sheet.loadHeaderRow();
  const header = sheet.headerValues || [];
  const barcodeCol = header[0] || "STYLE NUMBER";

  const set = new Set(barcodes.map((b) => String(b).trim()).filter(Boolean));
  const rows = await sheet.getRows();
  let deleted = 0;
  for (const row of rows) {
    const b = String(row.get(barcodeCol) ?? "").trim();
    if (set.has(b)) {
      await row.delete();
      deleted++;
    }
  }
  return { deleted };
}
