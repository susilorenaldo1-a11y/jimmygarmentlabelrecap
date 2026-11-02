import { NextRequest, NextResponse } from "next/server";
import { deleteFromSheet, errorMessage } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const barcodes: string[] = body?.barcodes;
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
      return NextResponse.json({ error: "No barcodes to delete" }, { status: 400 });
    }
    const result = await deleteFromSheet(barcodes);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
