# Runbook: gateway tool-call / reasoning spike (P6.5)

**Why:** before the server offers tools to a model (a later phase), we need evidence of which of your gateway's models really return
`tool_calls` and `reasoning` through New API, and under which field names. Nothing in `/chat` sends `tools` today; this phase only
measures and adds a pure helper (`apps/api/src/services/model-capabilities.ts`) that reads the admin flags.

## 1. Run the spike (owner, about 5 minutes)

No migration, dependency, env var or lockfile run. Needs Node 20+. Use your real values from Render:

```sh
export GATEWAY_URL=https://...          # same as the api's GATEWAY_URL
export GATEWAY_MASTER_KEY=...           # same as the api's GATEWAY_MASTER_KEY
node scripts/gateway-tool-spike.mjs <model-id> [<model-id> ...]
```

- Pick 3 to 6 model ids you actually publish: at least one from each provider family (OpenAI, Anthropic, Google, DeepSeek, open models).
  Use the **gateway** id, exactly as in the admin models page.
- `--dry-run` prints the four request bodies and calls nothing. `--json` prints the full analysis (field names, call ids, lengths).
- **Cost:** it bypasses our billing and calls the provider directly through the gateway: 4 requests per model, each capped at 400
  output tokens. A few cents for a whole run. Nothing is written to any database; the key is never printed.

## 2. Read the report

| Probe | What it sends | PASS means |
|---|---|---|
| `tool_call` | one `get_weather` tool, `tool_choice: auto` | the answer contains a tool call with a name and arguments that parse as JSON |
| `parallel_tools` | two tools, a prompt needing three calls | two or more calls, each valid (one call only is not a failure by itself) |
| `reasoning_default` | a plain question, no option | a reasoning field streamed without being asked |
| `reasoning_effort` | same, plus `reasoning_effort: "low"` | the gateway accepted the option (HTTP 200) and a reasoning field streamed |

`--json` also shows `indexPresent` (do tool fragments carry `index`; the P6.2 normalizer copes either way) and the exact reasoning
field name (`reasoning_content` and `reasoning` are mapped; any other name means P6.2 needs one more alias: send me that line).

**FAIL is evidence, not proof.** A model may simply not choose to call the tool. Run it twice before concluding. `HTTP 400` on
`reasoning_effort` means the gateway or provider rejects that option: good to know, and not a reason to drop the model.

## 3. Turn the flags on (admin, per model, only after a PASS)

Models -> open the model -> feature toggles: **Function calling** (after `tool_call` PASS) and **Reasoning** (after a reasoning PASS).
These are the existing `categories` values `functionCalling` and `reasoning`; model sync does not overwrite them. Today they only
affect display and filtering. They become the gate for sending `tools` in the tool-loop phase, through
`modelSupportsTools` / `modelSupportsReasoning`. Do not flag a model on a provider's marketing page alone.

## 4. Send me the output

Paste the report (or `--json`) into the next session. It decides: which models get tools first, whether P6.2 needs another
reasoning alias, and whether reasoning must be requested per provider.

The script's parsing is unit-tested: `node --test scripts/gateway-tool-spike.test.mjs` (CI does not run it).
