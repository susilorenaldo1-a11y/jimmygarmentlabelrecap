import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";

export const HEADERS = ["STYLE NUMBER", "STYLE #", "COLOUR", "UNIT PRICE (USD)"];

export interface WriteRow {
  barcode: string;
  description: string;
  colour: string;
  price: number;
}

export interface WriteResult {
  added: number;
  skipped: number;
  sheetTitle: string;
  items: WriteRow[];
}

function getAuth(): JWT {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }
  return new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function writeToSheet(rows: WriteRow[]): Promise<WriteResult> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  const title = process.env.GOOGLE_SHEET_TITLE || "Recap";

  const doc = new GoogleSpreadsheet(sheetId, getAuth());
  await doc.loadInfo();

  let sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues: HEADERS });
  }

  await sheet.loadHeaderRow();
  let header = sheet.headerValues || [];
  if (!header || header.length < 4) {
    await sheet.setHeaderRow(HEADERS);
    header = HEADERS;
  }

  const existingRows = await sheet.getRows();
  const existingBarcodes = new Set(
    existingRows.map((r) => String(r.get(header[0]) ?? "").trim())
  );

  const toAdd: Record<string, string | number>[] = [];
  let skipped = 0;
  for (const row of rows) {
    const barcode = (row.barcode || "").trim();
    if (!barcode) continue;
    if (existingBarcodes.has(barcode)) {
      skipped++;
      continue;
    }
    toAdd.push({
      [header[0]]: barcode,
      [header[1]]: row.description || "",
      [header[2]]: row.colour || "",
      [header[3]]: row.price,
    });
    existingBarcodes.add(barcode);
  }

  if (toAdd.length) {
    await sheet.addRows(toAdd);
  }

  return { added: toAdd.length, skipped, sheetTitle: title, items: rows };
}
