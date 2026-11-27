import { HfInference } from "@huggingface/inference";
import { withRetry } from "./retry";

export type Backend = "groq" | "hf" | "ollama";
export type Role = { backend: Backend; model: string };

// Base model (RAG) and judge run on Groq; the fine-tuned model runs locally in Ollama.
export const BASE_LLM: Role = { backend: "groq", model: "openai/gpt-oss-20b" };
export const JUDGE_LLM: Role = { backend: "groq", model: "openai/gpt-oss-20b" };
export const FINETUNED_LLM: Role = {
  backend: "ollama",
  model: process.env.FINETUNED_MODEL || "docs-ft",
};

async function groq(model: string, prompt: string): Promise<string> {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return (j.choices[0].message.content as string).trim();
}

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
async function ollama(model: string, prompt: string): Promise<string> {
  const r = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return (j.choices[0].message.content as string).trim();
}

const hf = new HfInference(process.env.HF_TOKEN);
async function hfChat(model: string, prompt: string): Promise<string> {
  const out = await hf.chatCompletion({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 512,
  });
  return (out.choices[0].message.content || "").trim();
}

export async function callLLM(role: Role, prompt: string): Promise<string> {
  return withRetry(() => {
    if (role.backend === "groq") return groq(role.model, prompt);
    if (role.backend === "ollama") return ollama(role.model, prompt);
    return hfChat(role.model, prompt);
  });
}