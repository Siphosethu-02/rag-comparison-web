"use client";
import { useEffect, useState } from "react";

type Scored = { text: string; source: string; page: number | null; score: number };
type CompareResult = {
  rag: string;
  finetuned: string;
  hybrid: string;
  context: { text: string; source: string; page: number | null }[];
};
type EvalRow = { approach: string; llm_judge: number; avg_latency_s: number; n: number };
type Tab = "search" | "compare" | "evaluate" | "kb";

const cite = (c: { source: string; page: number | null }) =>
  c.page ? `${c.source} · p.${c.page}` : c.source;

// Generic placeholders — edit these to match your documents once you pick them.
const SEARCH_EXAMPLES = ["key requirements", "definitions", "main points"];
const COMPARE_EXAMPLES = [
  "What is this document about?",
  "Summarize the key points.",
];

const ICONS: Record<string, string> = {
  search: "M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z",
  compare: "M4 4h16v16H4z M10 4v16 M15 4v16",
  chart: "M4 20V10 M10 20V4 M16 20V13 M3.5 20h17",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  file: "M14 3v5h5 M7 3h8l5 5v11a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z",
  upload: "M12 15V4 M8 8l4-4 4 4 M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2",
  logo: "M12 3l9 5-9 5-9-5 9-5z M3 12l9 5 9-5",
};
function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "search", label: "Search", icon: "search" },
  { id: "compare", label: "Compare", icon: "compare" },
  { id: "evaluate", label: "Evaluate", icon: "chart" },
  { id: "kb", label: "Knowledge base", icon: "folder" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("search");
  const [kb, setKb] = useState<{ count: number; sources: string[] } | null>(null);

  const loadKb = () =>
    fetch("/api/kb").then((r) => r.json()).then((j) => !j.error && setKb(j)).catch(() => {});
  useEffect(() => { loadKb(); }, []);

  const title = NAV.find((n) => n.id === tab)!.label;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo"><Icon name="logo" /></div>
          <div className="title">Knowledge Assistant</div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
              <Icon name={n.icon} />
              {n.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="content">
        <div className="topbar">
          <span className="page-title">{title}</span>
          {kb && <span className="badge">{kb.count} chunks · {kb.sources.length} docs</span>}
        </div>
        <div className="main">
          <div hidden={tab !== "search"}><Search /></div>
          <div hidden={tab !== "compare"}><Compare /></div>
          <div hidden={tab !== "evaluate"}><Evaluate /></div>
          <div hidden={tab !== "kb"}><KnowledgeBase kb={kb} onRefresh={loadKb} /></div>
        </div>
      </div>
    </div>
  );
}

function Search() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Scored[] | null>(null);
  const [err, setErr] = useState("");

  async function run(override?: string) {
    const query = (override ?? q).trim();
    if (!query) return;
    if (override) setQ(override);
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "request failed");
      setResults(j.results);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Search the knowledge base</h2>
      <div className="search">
        <div className="field">
          <Icon name="search" />
          <input
            placeholder="Search passages..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
        </div>
        <button className="btn" onClick={() => run()} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      <div className="chips">
        {SEARCH_EXAMPLES.map((ex) => (
          <button className="chip" key={ex} onClick={() => run(ex)}>{ex}</button>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
      {loading && <Skeletons />}
      {!loading && results && <p className="meta">{results.length} passages found</p>}
      {!loading && results?.map((c, i) => (
        <div className="result" key={i}>
          <div className="head">
            <span className="src"><Icon name="file" />{cite(c)}</span>
            <span className="score">{c.score.toFixed(2)}</span>
          </div>
          <div className="body">{c.text}</div>
        </div>
      ))}
      {!loading && !results && !err && (
        <EmptyState icon="search" t="Search your documents" s="Type a query or pick an example above." />
      )}
    </div>
  );
}

function Compare() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<CompareResult | null>(null);
  const [err, setErr] = useState("");

  async function run(override?: string) {
    const question = (override ?? q).trim();
    if (!question) return;
    if (override) setQ(override);
    setLoading(true);
    setErr("");
    setRes(null);
    try {
      const r = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "request failed");
      setRes(j);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Compare approaches</h2>
      <div className="search">
        <div className="field">
          <Icon name="compare" />
          <input
            placeholder="Ask a question..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
        </div>
        <button className="btn" onClick={() => run()} disabled={loading}>
          {loading ? "Thinking…" : "Compare"}
        </button>
      </div>
      <div className="chips">
        {COMPARE_EXAMPLES.map((ex) => (
          <button className="chip" key={ex} onClick={() => run(ex)}>{ex}</button>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
      {res && (
        <>
          <div className="cols">
            <div className="card rag"><div className="ch"><Icon name="search" />RAG</div><div className="cb">{res.rag}</div></div>
            <div className="card ft"><div className="ch"><Icon name="file" />Fine-tuned</div><div className="cb">{res.finetuned}</div></div>
            <div className="card hy"><div className="ch"><Icon name="compare" />Hybrid</div><div className="cb">{res.hybrid}</div></div>
          </div>
          <div className="ctx">
            <h4>Retrieved context (RAG &amp; hybrid)</h4>
            {res.context.map((c, i) => (
              <p key={i}><em>{cite(c)}</em> — {c.text}</p>
            ))}
          </div>
        </>
      )}
      {!res && !err && !loading && (
        <EmptyState icon="compare" t="Compare the three approaches" s="Ask a question or pick an example above." />
      )}
    </div>
  );
}

function Evaluate() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<EvalRow[] | null>(null);
  const [err, setErr] = useState("");

  async function run() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/evaluate", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "request failed");
      setRows(j.summary);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Evaluate</h2>
      <p className="lead">Scores all three approaches on the test set with an LLM judge.</p>
      <button className="btn" onClick={run} disabled={loading}>
        {loading ? "Running…" : "Run evaluation"}
      </button>
      {err && <p className="error" style={{ marginTop: 12 }}>{err}</p>}
      {rows && (
        <table style={{ marginTop: 18 }}>
          <thead>
            <tr><th>Approach</th><th>LLM-judge</th><th>Avg latency (s)</th><th>N</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.approach}>
                <td style={{ fontWeight: 500 }}>{r.approach}</td>
                <td>{r.llm_judge}</td>
                <td>{r.avg_latency_s}</td>
                <td>{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows && (
        <div className="bars">
          <p className="meta" style={{ marginBottom: 8 }}>LLM-judge score</p>
          {rows.map((r) => (
            <div className="bar-row" key={r.approach}>
              <span className="bar-label">{r.approach}</span>
              <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round(r.llm_judge * 100)}%` }} /></span>
              <span className="bar-val">{r.llm_judge.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {!rows && !err && !loading && (
        <div style={{ marginTop: 18 }}>
          <EmptyState icon="chart" t="No evaluation yet" s="Run the evaluation to score all three approaches." />
        </div>
      )}
    </div>
  );
}

function KnowledgeBase({ kb, onRefresh }: { kb: { count: number; sources: string[] } | null; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setMsg(`Indexing ${file.name}…`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/kb/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "upload failed");
      setMsg(`Indexed ${j.indexed} chunks from ${j.source}${j.truncated ? " (truncated to first 120 chunks)" : ""}.`);
      onRefresh();
    } catch (e: any) {
      setMsg("Error: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Knowledge base</h2>
      <label className={`dropzone ${busy ? "busy" : ""}`}>
        <input type="file" accept=".pdf,.md,.txt" disabled={busy} style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Icon name="upload" />
        {busy ? "Indexing…" : "Click to upload a PDF, .md or .txt — it indexes to Firestore"}
      </label>
      {msg && <p className="meta">{msg}</p>}
      {!kb ? (
        <Skeletons />
      ) : kb.sources.length === 0 ? (
        <EmptyState icon="folder" t="No documents yet" s="Upload a file above, or run npm run build-index." />
      ) : (
        <>
          <p className="meta">{kb.count} chunks indexed from {kb.sources.length} document(s)</p>
          {kb.sources.map((s) => (
            <div className="result" key={s}>
              <span className="src"><Icon name="file" />{s}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function EmptyState({ icon, t, s }: { icon: string; t: string; s: string }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div className="t">{t}</div>
      <div className="s">{s}</div>
    </div>
  );
}

function Skeletons() {
  return (
    <div style={{ marginTop: 16 }}>
      {[0, 1, 2].map((i) => (
        <div className="skel" key={i}>
          <div className="line" />
          <div className="line" />
          <div className="line" />
        </div>
      ))}
    </div>
  );
}