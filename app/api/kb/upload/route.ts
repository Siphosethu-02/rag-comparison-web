import { NextRequest, NextResponse } from "next/server";
import { ingestFile } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
    if (!/\.(pdf|md|txt)$/i.test(file.name)) {
      return NextResponse.json({ error: "only .pdf, .md or .txt files" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const { indexed, truncated } = await ingestFile(file.name, buf);
    return NextResponse.json({ source: file.name, indexed, truncated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

