#!/usr/bin/env node
/**
 * P6.5: gateway tool-call / reasoning spike. Zero dependencies (Node >= 20).
 *
 *   GATEWAY_URL=... GATEWAY_MASTER_KEY=... node scripts/gateway-tool-spike.mjs <model-id> [<model-id> ...]
 *   node scripts/gateway-tool-spike.mjs --dry-run <model-id>     # print the request bodies, call nothing
 *   add --json for machine-readable output
 *
 * It calls YOUR gateway directly with the master key, like gateway.service.ts does, but bypasses
 * our billing: each probe costs the provider a few hundred tokens (max_tokens is capped). Nothing is
 * written to any database and no model flag is changed; you flip `functionCalling` / `reasoning` in
 * the admin yourself after reading the report (docs/runbooks/TOOL_SPIKE.md).
 *
 * The parsing functions are pure and exported (tested in scripts/gateway-tool-spike.test.mjs).
 */
import { pathToFileURL } from "node:url";

const MAX_TOKENS = 400;
const TIMEOUT_MS = 60_000;

const WEATHER = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a city.",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
};
const TIME = {
  type: "function",
  function: {
    name: "get_time",
    description: "Get the current time in an IANA time zone.",
    parameters: { type: "object", properties: { tz: { type: "string" } }, required: ["tz"] },
  },
};

/** The probes. Same request shape the gateway service sends, plus the probe-specific fields. */
export function buildProbes(model) {
  const base = { model, stream: true, stream_options: { include_usage: true }, max_tokens: MAX_TOKENS };
  return [
    { name: "tool_call", body: { ...base, tools: [WEATHER], tool_choice: "auto",
      messages: [{ role: "user", content: "What is the weather in Damascus right now? Use the tool." }] } },
    { name: "parallel_tools", body: { ...base, tools: [WEATHER, TIME], tool_choice: "auto",
      messages: [{ role: "user", content: "Get the weather in Damascus and in Paris, and the time in UTC. Call every tool you need at once." }] } },
    { name: "reasoning_default", body: { ...base,
      messages: [{ role: "user", content: "What is 17 * 24? Think it through." }] } },
    { name: "reasoning_effort", body: { ...base, reasoning_effort: "low",
      messages: [{ role: "user", content: "What is 17 * 24? Think it through." }] } },
  ];
}

const isObj = (v) => typeof v === "object" && v !== null;

/** Parse an SSE body the way gateway.service.ts does: whole `data:` lines only, bad JSON skipped. */
export function parseSse(text) {
  const out = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "" || payload === "[DONE]") continue;
    try { out.push(JSON.parse(payload)); } catch { /* skip */ }
  }
  return out;
}

/** What one streamed answer shows: text, reasoning fields, tool calls, finish reason, usage. */
export function analyzeStream(text) {
  const chunks = parseSse(text);
  const r = {
    chunks: chunks.length, contentChars: 0,
    reasoningFields: {}, // field name -> characters seen ("reasoning_content", "reasoning", ...)
    toolCalls: [],       // { key, id, name, args, argsValidJson }
    finishReasons: [], usage: null, deltaKeys: [],
    indexPresent: null, // true/false once a tool fragment was seen
  };
  const calls = new Map();
  let lastKey = null;
  const keys = new Set();
  for (const chunk of chunks) {
    if (isObj(chunk.usage)) r.usage = { prompt: chunk.usage.prompt_tokens ?? null, completion: chunk.usage.completion_tokens ?? null };
    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
    if (!isObj(choice)) continue;
    if (typeof choice.finish_reason === "string") r.finishReasons.push(choice.finish_reason);
    const delta = choice.delta;
    if (!isObj(delta)) continue;
    for (const k of Object.keys(delta)) keys.add(k);
    if (typeof delta.content === "string") r.contentChars += delta.content.length;
    for (const field of Object.keys(delta)) {
      if (/reason|think/i.test(field) && typeof delta[field] === "string" && delta[field].length > 0) {
        r.reasoningFields[field] = (r.reasoningFields[field] ?? 0) + delta[field].length;
      }
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const f of delta.tool_calls) {
        if (!isObj(f)) continue;
        const hasIndex = Number.isInteger(f.index);
        if (r.indexPresent === null) r.indexPresent = hasIndex;
        else if (!hasIndex) r.indexPresent = false;
        let key = hasIndex ? `i${f.index}` : typeof f.id === "string" && f.id ? `id${f.id}` : lastKey ?? "i0";
        // A reused index announced with a new id is a new call.
        const existing = calls.get(key);
        if (existing && typeof f.id === "string" && f.id && existing.id && existing.id !== f.id) key = `${key}#${f.id}`;
        if (!calls.has(key)) calls.set(key, { key, id: null, name: null, args: "" });
        const c = calls.get(key);
        lastKey = key;
        if (typeof f.id === "string" && f.id) c.id = f.id;
        const fn = isObj(f.function) ? f.function : {};
        if (typeof fn.name === "string" && fn.name) c.name = fn.name;
        if (typeof fn.arguments === "string") c.args += fn.arguments;
      }
    }
  }
  r.deltaKeys = [...keys].sort();
  r.toolCalls = [...calls.values()].map((c) => {
    let ok = false;
    try { JSON.parse(c.args === "" ? "{}" : c.args); ok = true; } catch { /* invalid */ }
    return { ...c, argsValidJson: ok };
  });
  return r;
}

/** One human-readable verdict per probe. */
export function verdict(probe, result) {
  if (result.error) return { ok: false, text: result.error };
  const a = result.analysis;
  switch (probe) {
    case "tool_call": {
      if (a.toolCalls.length === 0) return { ok: false, text: `no tool_calls (answered in text: ${a.contentChars} chars)` };
      const bad = a.toolCalls.filter((c) => !c.argsValidJson || !c.name);
      if (bad.length) return { ok: false, text: "tool call returned but name or arguments are not valid" };
      return { ok: true, text: `tool_calls OK (${a.toolCalls.map((c) => c.name).join(", ")}); finish=${a.finishReasons.at(-1) ?? "?"}; index=${a.indexPresent}` };
    }
    case "parallel_tools": {
      const n = a.toolCalls.length;
      if (n === 0) return { ok: false, text: "no tool_calls" };
      const valid = a.toolCalls.every((c) => c.argsValidJson && c.name);
      return { ok: valid && n >= 2, text: `${n} call(s), args ${valid ? "valid" : "INVALID"}${n < 2 ? " (model made only one; not a failure by itself)" : ""}` };
    }
    default: {
      const fields = Object.entries(a.reasoningFields);
      if (fields.length === 0) return { ok: false, text: `no reasoning field (text ${a.contentChars} chars)` };
      return { ok: true, text: `reasoning via ${fields.map(([k, n]) => `${k} (${n} chars)`).join(", ")}; text ${a.contentChars} chars` };
    }
  }
}

async function runProbe(url, key, probe) {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(probe.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 200).replace(/\s+/g, " ");
      try { const j = JSON.parse(text); msg = j?.error?.message ?? j?.message ?? msg; } catch { /* keep raw */ }
      return { error: `HTTP ${res.status}: ${String(msg).slice(0, 200)}` };
    }
    return { analysis: analyzeStream(text) };
  } catch (err) {
    return { error: `request failed: ${err?.name === "TimeoutError" ? "timeout" : err?.message ?? err}` };
  }
}

export async function main(argv, env) {
  const args = argv.filter((a) => !a.startsWith("--"));
  const flag = (f) => argv.includes(f);
  if (args.length === 0) {
    console.error("usage: node scripts/gateway-tool-spike.mjs [--dry-run] [--json] <model-id> [<model-id> ...]\n(needs GATEWAY_URL and GATEWAY_MASTER_KEY in the environment unless --dry-run)");
    return 2;
  }
  if (flag("--dry-run")) {
    for (const m of args) for (const p of buildProbes(m)) console.log(`# ${m} / ${p.name}\n${JSON.stringify(p.body, null, 2)}\n`);
    return 0;
  }
  const { GATEWAY_URL: url, GATEWAY_MASTER_KEY: key } = env;
  if (!url || !key) { console.error("GATEWAY_URL and GATEWAY_MASTER_KEY must be set."); return 2; }

  const report = [];
  for (const model of args) {
    const rows = [];
    for (const probe of buildProbes(model)) {
      const result = await runProbe(url, key, probe);
      rows.push({ probe: probe.name, ...verdict(probe.name, result), ...(flag("--json") ? { analysis: result.analysis ?? null } : {}) });
    }
    report.push({ model, rows });
  }
  if (flag("--json")) { console.log(JSON.stringify(report, null, 2)); return 0; }
  for (const { model, rows } of report) {
    console.log(`\n== ${model}`);
    for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.probe.padEnd(18)} ${r.text}`);
  }
  console.log("\nPASS on tool_call -> consider the `functionCalling` toggle. PASS on a reasoning probe -> consider `reasoning`.\nFAIL is evidence, not proof: a model may simply not have chosen to call the tool. Re-run once before deciding.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).then((code) => { process.exitCode = code; });
}
