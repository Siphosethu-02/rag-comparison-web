import { NextResponse } from "next/server";
import { getDb, KB_COLLECTION } from "@/lib/firebase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const countSnap = await getDb().collection(KB_COLLECTION).count().get();
    const count = countSnap.data().count;
    // Sample up to 500 chunks to list the distinct source documents.
    const sample = await getDb().collection(KB_COLLECTION).select("source").limit(500).get();
    const sources = Array.from(new Set(sample.docs.map((d) => d.get("source") as string))).sort();
    return NextResponse.json({ count, sources });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

