import { NextRequest, NextResponse } from "next/server";
import { parsePdfBuffer } from "@/lib/parsePdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    const buffer = await (file as File).arrayBuffer();
    const items = await parsePdfBuffer(buffer);
    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to parse PDF";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
