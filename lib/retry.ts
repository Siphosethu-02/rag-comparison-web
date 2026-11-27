// Retry transient failures (HF cold starts / 503 model-loading, rate limits,
// dropped connections) with linear backoff.
export async function withRetry<T>(fn: () => Promise<T>, tries = 4, baseMs = 1500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String((e as any)?.message || e);
      const transient = /50[23]|loading|currently loading|rate.?limit|429|timeout|ECONN|fetch failed/i.test(msg);
      if (!transient || i === tries - 1) break;
      await new Promise((r) => setTimeout(r, baseMs * (i + 1)));
    }
  }
  throw last;
}

