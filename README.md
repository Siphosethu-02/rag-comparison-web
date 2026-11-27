# RAG vs Fine-tuning vs Hybrid — Next.js + Firebase (Vercel)

A serverless version of the three-way comparison, built to deploy on **Vercel**
with **Firestore** as the vector database.

- **UI + API:** Next.js (App Router, TypeScript) — sidebar layout with four tabs:
  **Search** (ranked passages with source/page/score, retrieval only), **Compare**
  (RAG vs fine-tuned vs hybrid), **Evaluate** (LLM-judge + latency table), and
  **Knowledge base** (indexed chunk/document count, plus **drag-in upload** — a
  PDF/.md/.txt uploaded here is parsed, chunked and embedded to Firestore live).
  API routes in `app/api/*`.
- **Embeddings:** `BAAI/bge-large-en-v1.5` via the **Hugging Face Inference API**
  (the model can't run inside a Vercel function, so it's called over HTTP).
- **Vector store:** **Firestore vector search** (`findNearest`, cosine).
- **LLMs:** base model + judge on **Groq**, fine-tuned model on the **HF Hub**.

## Architecture
```
Browser ──> Next.js (Vercel)
                │  app/api/compare   -> retrieve (Firestore KNN) + Groq/HF
                │  app/api/evaluate  -> run test set + LLM-judge -> Firestore
                ▼
   HF Inference (bge-large embeddings)   Firestore (vectors + results)
   Groq (base/judge)                     HF Hub (fine-tuned model)
```
Heavy indexing is done **offline** by `scripts/build-index.mjs`; the deployed app
only queries.

## 1. Firebase setup
1. Create a Firebase project; enable **Firestore** (Native mode).
2. Project settings -> Service accounts -> **Generate new private key** -> use its
   `project_id`, `client_email`, `private_key` for the env vars below.
3. Create the **vector index** on the embedding field (once), via gcloud CLI:
   ```bash
   gcloud firestore indexes composite create \
     --collection-group=kb_chunks --query-scope=COLLECTION \
     --field-config field-path=embedding,vector-config='{"dimension":1024,"flat":{}}'
   ```
   (Or run `npm run build-index` first — Firestore's error message includes a
   one-click link to create the exact index it needs.)

## 2. Environment variables
Copy `.env.local.example` to `.env.local` and fill in:
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
`GROQ_API_KEY`, `HF_TOKEN`, `FINETUNED_MODEL`.

## 3. Install + build the index (local, one-time)
Put your source documents in `data/kb/`. **PDFs are supported** (SAHPRA-style):
each PDF is read page by page, split into ~300-word windows, and stored with its
`source` filename and `page` number, so retrieved context cites "file.pdf, p.11".
`.md`/`.txt` also work (no page number).
```bash
npm install
npm run build-index      # extracts + embeds data/kb/* -> Firestore vectors
```

## 4. Run locally
```bash
npm run dev              # http://localhost:3000
```

## 5. Deploy to Vercel
1. Push this folder to a GitHub repo.
2. vercel.com -> New Project -> import the repo (Next.js auto-detected).
3. Settings -> Environment Variables: add all six from step 2.
4. Deploy -> you get a public `https://<project>.vercel.app` link.

The index lives in Firestore, so you build it once (step 3) and every deploy uses
it — no rebuild on deploy.

## The fine-tuned model
Fine-tune a small (1-3B) model, merge the LoRA, `push_to_hub` to your HF account,
and set `FINETUNED_MODEL` to that repo id. The `hf` backend serves it via HF
Inference Providers. Until it exists, the Fine-tuned and Hybrid columns will error
while RAG works on its own.

## Notes
- **BERTScore** isn't in this web app (it's a Python library). The web evaluation
  uses the LLM-judge + latency; keep the Python tool for BERTScore if you need it.
- `maxDuration` is set to 60s (compare) / 300s (evaluate). On Vercel's Hobby plan
  function timeouts are shorter — keep the test set small, or upgrade the plan.
- Firestore vector search is in GA for small/medium corpora; for very large KBs
  consider a dedicated vector DB.
