#!/usr/bin/env tsx
/**
 * Bulk redeem code generator CLI
 * Usage: pnpm tsx infra/scripts/generate-codes.ts \
 *          --count=100 --value=50 --batch="Eid2026" --expires=2026-12-31
 */
import { createHmac }    from "node:crypto";
import { writeFileSync } from "node:fs";
import { db, redeemCodes } from "@ai-platform/db";

function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(
    argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => a.slice(2).split("="))
  );
}

function generateCode(salt: string): string {
  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const seg = (start: number) =>
    Array.from(bytes.slice(start, start + 4))
      .map(b => CHARS[b % CHARS.length]).join("");
  const body = `${seg(0)}-${seg(4)}-${seg(8)}`;
  const checksum = createHmac("sha256", salt).update(body).digest("hex").slice(0, 4).toUpperCase();
  return `${body}-${checksum}`;
}

const args    = parseArgs(process.argv);
const count   = parseInt(args["count"] ?? "10");
const value   = parseInt(args["value"] ?? "50");
const label   = args["batch"] ?? `batch-${Date.now()}`;
const expires = args["expires"] ? new Date(args["expires"]) : null;
const salt    = process.env.CODE_SALT ?? "dev-salt-change-in-production";
const batchId = crypto.randomUUID();

console.log(`\n🎟️  Generating ${count} codes...`);
console.log(`   Value:   ${value} credits each`);
console.log(`   Batch:   ${label}`);
console.log(`   Expires: ${expires?.toISOString() ?? "never"}\n`);

const codes = Array.from({ length: count }, () => ({
  id:           crypto.randomUUID(),
  code:         generateCode(salt),
  creditAmount: value * 1_000_000,
  faceValue:    `${value} رصيد`,
  status:       "unused" as const,
  batchId,
  batchLabel:   label,
  expiresAt:    expires,
}));

await db.insert(redeemCodes).values(codes);

// Export CSV
const csv = [
  "Code,Credits,Expires,Batch",
  ...codes.map(c => `${c.code},${value},${expires?.toISOString() ?? "never"},${label}`)
].join("\n");

const filename = `${label}-codes.csv`;
writeFileSync(filename, csv);

console.log(`✅ Generated ${count} codes`);
console.log(`   First:   ${codes[0]?.code}`);
console.log(`   Last:    ${codes[count-1]?.code}`);
console.log(`   CSV:     ./${filename}\n`);

process.exit(0);
