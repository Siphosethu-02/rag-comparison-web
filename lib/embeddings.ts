import { withRetry } from "./retry";

// Embeddings via Jina AI (free tier). jina-embeddings-v3 outputs 1024 dims.
export const EMBEDDING_MODEL = "jina-embeddings-v3";
export const EMBEDDING_DIM = 1024;

const JINA_URL = "https://api.jina.ai/v1/embeddings";

export async function embed(text: string): Promise<number[]> {
  const out = await withRetry(async () => {
    const res = await fetch(JINA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: [text] }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jina embeddings ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data[0].embedding;
  });
  return out;
}
