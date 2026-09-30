// P6.5: pure parts of the spike script. Run with: node --test scripts/gateway-tool-spike.test.mjs   (CI does not run this file)
import test from "node:test";
import assert from "node:assert/strict";
import { parseSse, analyzeStream, verdict, buildProbes, main } from "./gateway-tool-spike.mjs";

const sse = (...objs) => objs.map((o) => `data: ${JSON.stringify(o)}\n\n`).join("") + "data: [DONE]\n\n";
const d = (delta, extra = {}) => ({ choices: [{ delta, ...extra }] });

test("parseSse skips bad JSON, [DONE] and non-data lines", () => {
  assert.equal(parseSse(`: ping\ndata: {bad\n\ndata: {"a":1}\n\ndata: [DONE]\n\n`).length, 1);
});

test("plain text answer: no tool calls, no reasoning", () => {
  const a = analyzeStream(sse(d({ role: "assistant", content: "" }), d({ content: "hi" }), d({}, { finish_reason: "stop" }), { usage: { prompt_tokens: 3, completion_tokens: 2 } }));
  assert.equal(a.contentChars, 2);
  assert.deepEqual(a.toolCalls, []);
  assert.deepEqual(a.reasoningFields, {});
  assert.deepEqual(a.usage, { prompt: 3, completion: 2 });
  assert.equal(verdict("tool_call", { analysis: a }).ok, false);
});

test("split tool arguments reassemble; verdict PASS", () => {
  const a = analyzeStream(sse(
    d({ tool_calls: [{ index: 0, id: "c1", function: { name: "get_weather", arguments: "" } }] }),
    d({ tool_calls: [{ index: 0, function: { arguments: '{"city":"Da' } }] }),
    d({ tool_calls: [{ index: 0, function: { arguments: 'mascus"}' } }] }),
    d({}, { finish_reason: "tool_calls" })));
  assert.equal(a.toolCalls.length, 1);
  assert.equal(a.toolCalls[0].args, '{"city":"Damascus"}');
  assert.equal(a.toolCalls[0].argsValidJson, true);
  assert.equal(a.indexPresent, true);
  assert.equal(verdict("tool_call", { analysis: a }).ok, true);
});

test("parallel calls by index, and a provider that reuses one index with new ids", () => {
  const byIndex = analyzeStream(sse(
    d({ tool_calls: [{ index: 0, id: "a", function: { name: "f", arguments: "{}" } }] }),
    d({ tool_calls: [{ index: 1, id: "b", function: { name: "g", arguments: "{}" } }] })));
  assert.equal(byIndex.toolCalls.length, 2);
  assert.equal(verdict("parallel_tools", { analysis: byIndex }).ok, true);
  const reused = analyzeStream(sse(
    d({ tool_calls: [{ index: 0, id: "a", function: { name: "f", arguments: "{}" } }] }),
    d({ tool_calls: [{ index: 0, id: "b", function: { name: "g", arguments: "{}" } }] })));
  assert.equal(reused.toolCalls.length, 2);
});

test("calls without index are reported (indexPresent false) and still grouped", () => {
  const a = analyzeStream(sse(
    d({ tool_calls: [{ id: "a", function: { name: "f", arguments: "{" } }] }),
    d({ tool_calls: [{ function: { arguments: "}" } }] })));
  assert.equal(a.indexPresent, false);
  assert.equal(a.toolCalls.length, 1);
  assert.equal(a.toolCalls[0].args, "{}");
});

test("invalid argument JSON fails the verdict", () => {
  const a = analyzeStream(sse(d({ tool_calls: [{ index: 0, id: "a", function: { name: "f", arguments: '{"x":' } }] })));
  assert.equal(a.toolCalls[0].argsValidJson, false);
  assert.equal(verdict("tool_call", { analysis: a }).ok, false);
});

test("reasoning field names are detected (reasoning_content, reasoning, any *reason*/*think* name)", () => {
  const a = analyzeStream(sse(d({ reasoning_content: "abc" }), d({ reasoning: "de" }), d({ thinking: "f" }), d({ content: "x" })));
  assert.deepEqual(a.reasoningFields, { reasoning_content: 3, reasoning: 2, thinking: 1 });
  assert.equal(verdict("reasoning_default", { analysis: a }).ok, true);
  assert.equal(verdict("reasoning_default", { analysis: analyzeStream(sse(d({ content: "x" }))) }).ok, false);
});

test("an error result is reported as FAIL with its text", () => {
  assert.deepEqual(verdict("tool_call", { error: "HTTP 400: nope" }), { ok: false, text: "HTTP 400: nope" });
});

test("probes: stream + include_usage like the gateway service, capped tokens, tools only where intended", () => {
  const p = buildProbes("m1");
  assert.deepEqual(p.map((x) => x.name), ["tool_call", "parallel_tools", "reasoning_default", "reasoning_effort"]);
  for (const x of p) { assert.equal(x.body.model, "m1"); assert.equal(x.body.stream, true); assert.deepEqual(x.body.stream_options, { include_usage: true }); assert.ok(x.body.max_tokens <= 400); }
  assert.ok(p[0].body.tools.length === 1 && p[1].body.tools.length === 2);
  assert.ok(!("tools" in p[2].body) && !("reasoning_effort" in p[2].body));
  assert.equal(p[3].body.reasoning_effort, "low");
});

test("main: usage error without models, refuses without env, dry-run calls nothing", async () => {
  const origErr = console.error, origLog = console.log; console.error = () => {}; console.log = () => {};
  try {
    assert.equal(await main([], {}), 2);
    assert.equal(await main(["m1"], {}), 2);
    const realFetch = globalThis.fetch; let called = false; globalThis.fetch = () => { called = true; throw new Error("no"); };
    assert.equal(await main(["--dry-run", "m1"], {}), 0);
    globalThis.fetch = realFetch;
    assert.equal(called, false);
  } finally { console.error = origErr; console.log = origLog; }
});

test("main against a stub gateway: network errors and HTTP errors become FAIL rows, key is never printed", async () => {
  const lines = []; const origLog = console.log; console.log = (s) => lines.push(String(s));
  const realFetch = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => (++n === 1
    ? new Response(sse(d({ tool_calls: [{ index: 0, id: "a", function: { name: "get_weather", arguments: '{"city":"X"}' } }] })), { status: 200 })
    : n === 2 ? new Response(JSON.stringify({ error: { message: "tools unsupported" } }), { status: 400 })
    : (() => { throw new Error("boom"); })());
  try {
    assert.equal(await main(["m1"], { GATEWAY_URL: "http://gw", GATEWAY_MASTER_KEY: "SECRETKEY123" }), 0);
  } finally { globalThis.fetch = realFetch; console.log = origLog; }
  const out = lines.join("\n");
  assert.match(out, /PASS {2}tool_call/);
  assert.match(out, /FAIL {2}parallel_tools +HTTP 400: tools unsupported/);
  assert.match(out, /request failed: boom/);
  assert.ok(!out.includes("SECRETKEY123"));
});
