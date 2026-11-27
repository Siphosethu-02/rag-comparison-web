// Offline index builder, SAHPRA-style: ingests PDFs (and .md/.txt) from data/kb/,
// extracts text PER PAGE, chunks into ~300-word windows (like the w300 corpus),
// embeds with bge-large, and writes to Firestore with {text, source, page}.
// Run locally (not on Vercel):  npm run build-index
import { readdir, readFile } from "fs/promises";
import path from "path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HfInference } from "@huggingface/inference";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5";
const KB_DIR = path.join(process.cwd(), "data", "kb");
const COLLECTION = "kb_chunks";
const WINDOW = 300; // words per chunk (matches the SAHPRA w300 style)
const OVERLAP = 50;

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();
const hf = new HfInference(process.env.HF_TOKEN);

async function embed(text) {
  const out = await hf.featureExtraction({ model: EMBEDDING_MODEL, inputs: text });
  return Array.isArray(out[0]) ? out[0] : out;
}

// Split a string into ~WINDOW-word windows with OVERLAP words of overlap.
function windows(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i += WINDOW - OVERLAP) {
    const chunk = words.slice(i, i + WINDOW).join(" ");
    if (chunk.trim()) out.push(chunk);
    if (i + WINDOW >= words.length) break;
  }
  return out;
}

async function pdfPages(filePath) {
  const data = new Uint8Array(await readFile(filePath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(" "));
  }
  return pages; // index 0 = page 1
}

async function loadChunks() {
  const files = (await readdir(KB_DIR)).filter((f) => /\.(pdf|md|txt)$/i.test(f));
  const chunks = [];
  for (const f of files) {
    const full = path.join(KB_DIR, f);
    if (/\.pdf$/i.test(f)) {
      const pages = await pdfPages(full);
      pages.forEach((pageText, idx) => {
        windows(pageText).forEach((text, j) =>
          chunks.push({ id: `${f}-p${idx + 1}-${j}`, text, source: f, page: idx + 1 })
        );
      });
    } else {
      const text = await readFile(full, "utf-8");
      windows(text).forEach((t, j) =>
        chunks.push({ id: `${f}-${j}`, text: t, source: f, page: null })
      );
    }
  }
  return chunks;
}

async function main() {
  const chunks = await loadChunks();
  if (!chunks.length) {
    console.log(`No .pdf/.md/.txt files in ${KB_DIR}. Add your documents and re-run.`);
    return;
  }
  console.log(`Embedding ${chunks.length} chunks with ${EMBEDDING_MODEL} ...`);
  for (const c of chunks) {
    const vector = await embed(c.text);
    await db.collection(COLLECTION).doc(c.id).set({
      text: c.text,
      source: c.source,
      page: c.page,
      embedding: FieldValue.vector(vector),
    });
    process.stdout.write(".");
  }
  console.log(`\nIndexed ${chunks.length} chunks into '${COLLECTION}'.`);
}

main().then(() => process.exit(0));
