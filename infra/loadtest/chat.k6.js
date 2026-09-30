// P4.2 - k6 load test for POST /chat.  Run by .github/workflows/load-test.yml (or locally: k6 run).
//
// Scenarios (all against the STAGING api):
//   streams   : STREAM_VUS (default 60) virtual users, one load-test user each, streaming for DURATION.
//   (users needed: STREAM_VUS + SAME_USER_USERS*SAME_USER_VUS_PER_USER + SAME_USER_USERS; see the note above streamUser)
//   same_user : SAME_USER_USERS (default 5) users, each hit by SAME_USER_VUS_PER_USER (default 4) VUs at once.
//               Only one billed operation per user may be in flight (P1.2), so the rest must get 409.
// A deploy mid-test (P3.2) is triggered by the owner; the script just keeps going and records what it sees.
//
// Env: BASE_URL, LOADTEST_SEED, LT_MODEL (a published, available, CHEAP model id), DURATION (default 5m),
//      STREAM_VUS, SAME_USER_USERS, SAME_USER_VUS_PER_USER, MAX_TOKENS (default 48)
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import crypto from "k6/crypto";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/$/, "");
const SEED = __ENV.LOADTEST_SEED || "";
const MODEL = __ENV.LT_MODEL || "";
const DURATION = __ENV.DURATION || "5m";
const STREAM_VUS = parseInt(__ENV.STREAM_VUS || "60", 10);
const SAME_USERS = parseInt(__ENV.SAME_USER_USERS || "5", 10);
const SAME_PER_USER = parseInt(__ENV.SAME_USER_VUS_PER_USER || "4", 10);
const MAX_TOKENS = parseInt(__ENV.MAX_TOKENS || "48", 10);

if (!BASE_URL || !SEED || !MODEL) {
  throw new Error("BASE_URL, LOADTEST_SEED and LT_MODEL are required");
}

export const options = {
  scenarios: {
    streams: {
      executor: "constant-vus",
      vus: STREAM_VUS,
      duration: DURATION,
      exec: "streamUser",
    },
    same_user: {
      executor: "constant-vus",
      vus: SAME_USERS * SAME_PER_USER,
      duration: DURATION,
      exec: "sameUser",
      startTime: "5s",
    },
  },
  thresholds: {
    // Hard failures. Deploy-window errors (0/502/503/504) are reported separately and read by a human.
    "server_500": ["count==0"],
    "unexpected_status": ["count==0"],
    "streams_completed": ["count>0"],
    "lock_409_ok_body": ["count>0"],
    "lock_409_bad_body": ["count==0"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "max"],
};

const streamsCompleted = new Counter("streams_completed");
const server500 = new Counter("server_500");
const unexpected = new Counter("unexpected_status");
const lock409Ok = new Counter("lock_409_ok_body");
const lock409Bad = new Counter("lock_409_bad_body");
const rateLimited429 = new Counter("rate_limited_429");
const insufficient402 = new Counter("insufficient_402");
const accountLocked403 = new Counter("account_locked_403");
const deployWindow = new Counter("deploy_window_errors_0_502_503_504");
const streamMs = new Trend("stream_total_ms", true);

function keyFor(i) {
  const mac = crypto.hmac("sha256", SEED, "user-" + i, "hex");
  return "sk-aip-lt" + mac.substring(0, 40);
}

let errLogged = 0;
function logErr(kind, status, extra) {
  if (errLogged < 200) {
    errLogged++;
    console.log("ERRLOG " + new Date().toISOString() + " " + kind + " status=" + status + " " + (extra || ""));
  }
}

function chatOnce(userIndex) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: "Reply with the single word: OK" }],
    max_tokens: MAX_TOKENS,
  });
  const res = http.post(BASE_URL + "/chat", body, {
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + keyFor(userIndex) },
    timeout: "130s",
    tags: { name: "POST /chat" },
  });
  const s = res.status;

  if (s === 200) {
    if (res.body && res.body.length > 0) {
      streamsCompleted.add(1);
      streamMs.add(res.timings.duration);
    } else {
      unexpected.add(1);
      logErr("empty-200", s);
    }
  } else if (s === 409) {
    let ok = false;
    try { ok = JSON.parse(res.body).error === "REQUEST_IN_PROGRESS"; } catch (e) { ok = false; }
    if (ok) lock409Ok.add(1); else { lock409Bad.add(1); logErr("409-bad-body", s, String(res.body).slice(0, 80)); }
  } else if (s === 429) {
    rateLimited429.add(1);
  } else if (s === 402) {
    insufficient402.add(1);
    logErr("402-out-of-credits", s, "user " + userIndex);
  } else if (s === 403) {
    accountLocked403.add(1);
    logErr("403-account-locked", s, "user " + userIndex);
  } else if (s === 0 || s === 502 || s === 503 || s === 504) {
    deployWindow.add(1);
    logErr("deploy-window", s, res.error || "");
  } else if (s === 500) {
    server500.add(1);
    logErr("500", s, String(res.body).slice(0, 80));
  } else {
    unexpected.add(1);
    logErr("unexpected", s, String(res.body).slice(0, 80));
  }
  return s;
}

// User pools. k6 numbers VUs globally across scenarios and does not promise which scenario gets which
// ids, so users are derived from the VU id in a way that stays collision-free either way:
//   streams   : user ((VU-1) % TOTAL) + 1      -> every streams VU has its OWN user (ids are distinct, <= TOTAL)
//   same_user : user TOTAL + (VU % SAME_USERS) + 1 -> SAME_PER_USER consecutive VUs share each user
// so the setup must create TOTAL + SAME_USERS users (defaults: 60 + 20 + 5 = 85; setup default is 90).
const TOTAL = STREAM_VUS + SAME_USERS * SAME_PER_USER;

// Paced well under the 20 requests/minute per-user limit.
export function streamUser() {
  chatOnce(((__VU - 1) % TOTAL) + 1);
  sleep(4 + Math.random() * 4);
}

export function sameUser() {
  chatOnce(TOTAL + (__VU % SAME_USERS) + 1);
  sleep(1 + Math.random() * 2);
}

export function handleSummary(data) {
  const c = (n) => (data.metrics[n] && data.metrics[n].values.count) || 0;
  const out = {
    streams_completed: c("streams_completed"),
    lock_409_ok_body: c("lock_409_ok_body"),
    lock_409_bad_body: c("lock_409_bad_body"),
    rate_limited_429: c("rate_limited_429"),
    insufficient_402: c("insufficient_402"),
    account_locked_403: c("account_locked_403"),
    deploy_window_errors: c("deploy_window_errors_0_502_503_504"),
    server_500: c("server_500"),
    unexpected_status: c("unexpected_status"),
    stream_total_ms: data.metrics.stream_total_ms ? data.metrics.stream_total_ms.values : null,
  };
  return { "loadtest-summary.json": JSON.stringify(out, null, 2), stdout: "\n" + JSON.stringify(out, null, 2) + "\n" };
}
