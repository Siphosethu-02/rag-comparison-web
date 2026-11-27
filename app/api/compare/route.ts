import { NextRequest, NextResponse } from "next/server";
import { answerAll } from "@/lib/rag";

export const runtime = "nodejs"; // firebase-admin needs Node, not Edge
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }
    const result = await answerAll(question.trim());
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

