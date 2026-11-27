import { FieldValue } from "firebase-admin/firestore";
import { getDb, KB_COLLECTION } from "./firebase";
import { embed } from "./embeddings";
// Legacy build runs in Node (no DOM). No bundled types for this path.
// @ts-ignore
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const WINDOW = 300; // words per chunk (SAHPRA w300 style)
const OVERLAP = 50;
// Cap chunks per upload so a browser upload stays within the serverless timeout.
const MAX_CHUNKS = 120;

type Chunk = { id: string; text: string; source: string; page: number | null };

export function windows(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += WINDOW - OVERLAP) {
    const chunk = words.slice(i, i + WINDOW).join(" ");
    if (chunk.trim()) out.push(chunk);
    if (i + WINDOW >= words.length) break;
  }
  return out;
}

async function pdfChunks(source: string, buf: Uint8Array): Promise<Chunk[]> {
  const doc = await getDocument({ data: buf, useSystemFonts: true }).promise;
  const chunks: Chunk[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join(" ");
    windows(text).forEach((t, j) =>
      chunks.push({ id: `${source}-p${p}-${j}`, text: t, source, page: p })
    );
  }
  return chunks;
}

// Index one uploaded document into Firestore. Returns how many chunks were stored.
export async function ingestFile(
  source: string,
  buf: Buffer
): Promise<{ indexed: number; truncated: boolean }> {
  let chunks: Chunk[];
  if (/\.pdf$/i.test(source)) {
    chunks = await pdfChunks(source, new Uint8Array(buf));
  } else {
    const text = buf.toString("utf-8");
    chunks = windows(text).map((t, j) => ({ id: `${source}-${j}`, text: t, source, page: null }));
  }
  const truncated = chunks.length > MAX_CHUNKS;
  const use = chunks.slice(0, MAX_CHUNKS);
  for (const c of use) {
    const vector = await embed(c.text);
    await getDb().collection(KB_COLLECTION).doc(c.id).set({
      text: c.text,
      source: c.source,
      page: c.page,
      embedding: FieldValue.vector(vector),
    });
  }
  return { indexed: use.length, truncated };
}

