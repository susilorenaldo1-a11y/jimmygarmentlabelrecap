import { JWT } from "google-auth-library";
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from "google-spreadsheet";

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

// The PDF uses SML/MED/LRG; the "barcode rrp" tab uses S/M/L.
const PDF_TO_SHEET_SIZE: Record<string, string> = {
  XXS: "XXS",
  XS: "XS",
  SML: "S",
  MED: "M",
  LRG: "L",
  XL: "XL",
  XXL: "XXL",
};

const SHEET_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];

interface ColMap {
  barcode: number;
  description: number;
  colour: number;
  price: number;
  sizes: Record<string, number>;
  totalQty: number;
  totalValue: number;
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

function normHeader(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function cellText(cell: { value: unknown }): string {
  return String(cell.value ?? "").trim();
}

function findHeaderRow(sheet: GoogleSpreadsheetWorksheet): number {
  const max = Math.min(sheet.rowCount, 40);
  for (let r = 0; r < max; r++) {
    for (let c = 0; c < sheet.columnCount; c++) {
      if (normHeader(cellText(sheet.getCell(r, c))) === "STYLE NUMBER") {
        return r;
      }
    }
  }
  throw new Error("Could not find the 'STYLE NUMBER' header row in the sheet.");
}

function buildColumnMap(sheet: GoogleSpreadsheetWorksheet, headerRow: number): ColMap {
  const map: ColMap = {
    barcode: -1,
    description: -1,
    colour: -1,
    price: -1,
    sizes: {},
    totalQty: -1,
    totalValue: -1,
  };
  let weightCol = -1;
  let hsCodeCol = -1;

  for (let c = 0; c < sheet.columnCount; c++) {
    const h = normHeader(cellText(sheet.getCell(headerRow, c)));
    if (h === "STYLE NUMBER") map.barcode = c;
    else if (h === "STYLE #") map.description = c;
    else if (h === "COLOUR") map.colour = c;
    else if (h.includes("UNIT PRICE") && map.price === -1) map.price = c;
    else if (SHEET_SIZES.includes(h)) map.sizes[h] = c;
    else if (h === "WEIGHT") weightCol = c;
    else if (h === "HS CODE") hsCodeCol = c;
  }

  if (hsCodeCol >= 0) {
    map.totalValue = hsCodeCol - 1;
    map.totalQty = hsCodeCol - 2;
  } else if (weightCol >= 0) {
    map.totalQty = weightCol + 1;
    map.totalValue = weightCol + 2;
  }

  if (map.barcode === -1) {
    throw new Error("Could not locate the 'STYLE NUMBER' column.");
  }
  return map;
}

function writeItem(
  sheet: GoogleSpreadsheetWorksheet,
  rowIdx: number,
  item: WriteRow,
  col: ColMap
) {
  sheet.getCell(rowIdx, col.barcode).value = item.barcode.trim();
  if (col.description >= 0) sheet.getCell(rowIdx, col.description).value = item.description || "";
  if (col.colour >= 0) sheet.getCell(rowIdx, col.colour).value = item.colour || "";
  if (col.price >= 0) sheet.getCell(rowIdx, col.price).value = item.price;

  for (const [pdfSize, sheetSize] of Object.entries(PDF_TO_SHEET_SIZE)) {
    const c = col.sizes[sheetSize];
    if (c >= 0) {
      sheet.getCell(rowIdx, c).value = item.sizes?.[pdfSize] ?? 0;
    }
  }

  if (col.totalQty >= 0) sheet.getCell(rowIdx, col.totalQty).value = item.total;
  if (col.totalValue >= 0) sheet.getCell(rowIdx, col.totalValue).value = item.total * item.price;
}

async function loadSheet(doc: GoogleSpreadsheet, title: string) {
  const sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    throw new Error(`Sheet tab "${title}" was not found in the spreadsheet.`);
  }
  await sheet.loadCells();
  const headerRow = findHeaderRow(sheet);
  const col = buildColumnMap(sheet, headerRow);
  return { sheet, headerRow, col };
}

export async function writeToSheet(rows: WriteRow[]): Promise<WriteResult> {
  const sheetId = normalizeSheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  const title = process.env.GOOGLE_SHEET_TITLE || "barcode rrp";

  const doc = new GoogleSpreadsheet(sheetId, getAuth());
  await doc.loadInfo();
  const { sheet, headerRow, col } = await loadSheet(doc, title);

  const existingBarcodes = new Set<string>();
  let lastDataRow = headerRow;
  for (let r = headerRow + 1; r < sheet.rowCount; r++) {
    const b = cellText(sheet.getCell(r, col.barcode));
    if (b) {
      existingBarcodes.add(b);
      lastDataRow = r;
    }
  }

  const toWrite = rows.filter((row) => {
    const barcode = (row.barcode || "").trim();
    if (!barcode || existingBarcodes.has(barcode)) return false;
    existingBarcodes.add(barcode);
    return true;
  });

  const skipped = rows.length - toWrite.length;

  const neededRows = lastDataRow + 1 + toWrite.length;
  if (neededRows > sheet.rowCount) {
    await sheet.resize({ rowCount: neededRows + 5, columnCount: sheet.columnCount });
    await sheet.loadCells();
  }

  let r = lastDataRow + 1;
  const addedBarcodes: string[] = [];
  for (const item of toWrite) {
    writeItem(sheet, r, item, col);
    addedBarcodes.push(item.barcode.trim());
    r++;
  }

  if (toWrite.length) {
    await sheet.saveUpdatedCells();
  }

  return {
    added: toWrite.length,
    skipped: rows.length - toWrite.length,
    sheetTitle: title,
    addedBarcodes,
  };
}

export async function deleteFromSheet(barcodes: string[]): Promise<{ deleted: number }> {
  const sheetId = normalizeSheetId(process.env.GOOGLE_SHEET_ID || "");
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  const title = process.env.GOOGLE_SHEET_TITLE || "barcode rrp";

  const doc = new GoogleSpreadsheet(sheetId, getAuth());
  await doc.loadInfo();
  const { sheet, headerRow, col } = await loadSheet(doc, title);

  const set = new Set(barcodes.map((b) => String(b).trim()).filter(Boolean));
  let deleted = 0;
  for (let r = headerRow + 1; r < sheet.rowCount; r++) {
    const b = cellText(sheet.getCell(r, col.barcode));
    if (set.has(b)) {
      sheet.getCell(r, col.barcode).value = "";
      if (col.description >= 0) sheet.getCell(r, col.description).value = "";
      if (col.colour >= 0) sheet.getCell(r, col.colour).value = "";
      if (col.price >= 0) sheet.getCell(r, col.price).value = "";
      for (const c of Object.values(col.sizes)) {
        if (c >= 0) sheet.getCell(r, c).value = "";
      }
      if (col.totalQty >= 0) sheet.getCell(r, col.totalQty).value = "";
      if (col.totalValue >= 0) sheet.getCell(r, col.totalValue).value = "";
      deleted++;
    }
  }

  if (deleted) {
    await sheet.saveUpdatedCells();
  }
  return { deleted };
}
