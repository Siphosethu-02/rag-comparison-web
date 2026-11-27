import { FieldValue } from "firebase-admin/firestore";
import { getDb, KB_COLLECTION } from "./firebase";
import { embed } from "./embeddings";
import { callLLM, BASE_LLM, FINETUNED_LLM } from "./llm";

export const TOP_K = 4;

export type Chunk = { text: string; source: string; page: number | null };

export async function retrieve(question: string, k = TOP_K): Promise<Chunk[]> {
  const qv = await embed(question);
  const snap = await getDb()
    .collection(KB_COLLECTION)
    .findNearest({
      vectorField: "embedding",
      queryVector: FieldValue.vector(qv),
      limit: k,
      distanceMeasure: "COSINE",
    })
    .get();
  return snap.docs.map((d) => ({
    text: d.get("text") as string,
    source: d.get("source") as string,
    page: (d.get("page") as number | null) ?? null,
  }));
}

// A short citation like "PEM-03, p.11" for display.
export function cite(c: Chunk): string {
  return c.page ? `${c.source}, p.${c.page}` : c.source;
}

export type ScoredChunk = Chunk & { score: number };

// Retrieval-only search: returns ranked passages with a similarity score (for the Search tab).
export async function searchKB(question: string, k = TOP_K): Promise<ScoredChunk[]> {
  const qv = await embed(question);
  const snap = await getDb()
    .collection(KB_COLLECTION)
    .findNearest({
      vectorField: "embedding",
      queryVector: FieldValue.vector(qv),
      limit: k,
      distanceMeasure: "COSINE",
      distanceResultField: "_distance",
    })
    .get();
  return snap.docs.map((d) => ({
    text: d.get("text") as string,
    source: d.get("source") as string,
    page: (d.get("page") as number | null) ?? null,
    // COSINE distance in [0,2]; similarity = 1 - distance.
    score: Math.round((1 - (d.get("_distance") as number)) * 1000) / 1000,
  }));
}

const ragPrompt = (ctx: string, q: string) =>
  `Answer the question using only the context below. If the context is insufficient, say so.\n\nContext:\n${ctx}\n\nQuestion: ${q}\nAnswer:`;

// If the fine-tuned model isn't hosted/available, fall back to the base model so
// the demo shows a labelled answer instead of an error. Disable with
// FINETUNED_FALLBACK=false.
const FT_FALLBACK = process.env.FINETUNED_FALLBACK !== "false";

async function finetunedAnswer(prompt: string): Promise<string> {
  try {
    return await callLLM(FINETUNED_LLM, prompt);
  } catch (e: any) {
    if (!FT_FALLBACK) return `[error: ${e.message}]`;
    try {
      return "[fine-tuned model unavailable — base model stand-in]\n" + (await callLLM(BASE_LLM, prompt));
    } catch (e2: any) {
      return `[error: ${e2.message}]`;
    }
  }
}

// Retrieve once and reuse for both RAG and Hybrid to save embedding calls.
export async function answerAll(question: string) {
  const chunks = await retrieve(question);
  const ctx = chunks.map((c) => c.text).join("\n\n");
  const [rag, finetuned, hybrid] = await Promise.all([
    callLLM(BASE_LLM, ragPrompt(ctx, question)).catch((e) => `[error: ${e.message}]`),
    finetunedAnswer(`Question: ${question}\nAnswer:`),
    finetunedAnswer(ragPrompt(ctx, question)),
  ]);
  return { rag, finetuned, hybrid, context: chunks };
}

