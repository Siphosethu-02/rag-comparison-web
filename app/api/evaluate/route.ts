import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { answerAll } from "@/lib/rag";
import { callLLM, JUDGE_LLM } from "@/lib/llm";
import { getDb, EVAL_COLLECTION } from "@/lib/firebase";

export const runtime = "nodejs";
export const maxDuration = 300;

const STRATEGIES = ["rag", "finetuned", "hybrid"] as const;

const judgePrompt = (ref: string, ans: string) =>
  `You are grading an answer against a reference answer.\nGive a single score from 0 to 1 for how well the answer matches the reference's meaning.\nReply with ONLY the number.\n\nReference: ${ref}\nAnswer: ${ans}\nScore:`;

async function judge(ref: string, ans: string): Promise<number> {
  try {
    const out = await callLLM(JUDGE_LLM, judgePrompt(ref, ans));
    // Grab the first number anywhere in the reply (handles "Score: 0.9", etc.)
    const m = out.match(/\d*\.\d+|\d+/);
    const n = m ? parseFloat(m[0]) : NaN;
    return isNaN(n) ? NaN : Math.max(0, Math.min(1, n));
  } catch {
    return NaN;
  }
}

export async function POST() {
  try {
    const raw = await readFile(path.join(process.cwd(), "data", "test.jsonl"), "utf-8");
    const all = raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { question: string; answer: string });
    const limit = parseInt(process.env.EVAL_LIMIT || "5", 10);
    const tests = all.slice(0, limit);

    const scores: Record<string, number[]> = { rag: [], finetuned: [], hybrid: [] };
    const latency: Record<string, number[]> = { rag: [], finetuned: [], hybrid: [] };

    for (const t of tests) {
      const t0 = Date.now();
      const ans = await answerAll(t.question);
      const elapsed = (Date.now() - t0) / 1000;
      for (const s of STRATEGIES) {
        scores[s].push(await judge(t.answer, (ans as any)[s]));
        latency[s].push(elapsed);
      }
    }

    const avg = (xs: number[]) => {
      const valid = xs.filter((x) => !isNaN(x));
      if (!valid.length) return 0;
      return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 1000) / 1000;
    };
    const summary = STRATEGIES.map((s) => ({
      approach: s,
      llm_judge: avg(scores[s]),
      avg_latency_s: avg(latency[s]),
      n: tests.length,
    }));

    const meta = { evaluated: tests.length, available: all.length };
    await getDb().collection(EVAL_COLLECTION).add({ at: new Date().toISOString(), summary, ...meta });
    return NextResponse.json({ summary, ...meta });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}