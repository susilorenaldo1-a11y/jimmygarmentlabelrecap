import { NextRequest, NextResponse } from "next/server";
import { writeToSheet, WriteRow, errorMessage } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items: WriteRow[] = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items to write" }, { status: 400 });
    }
    const result = await writeToSheet(items);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
