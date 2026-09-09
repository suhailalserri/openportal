import { createHmac } from "node:crypto";

export function generateCode(): string {
  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const seg = (s: number) =>
    Array.from(bytes.slice(s, s + 4)).map(b => CHARS[b % CHARS.length]).join("");
  const body     = `${seg(0)}-${seg(4)}-${seg(8)}`;
  const checksum = createHmac("sha256", process.env.CODE_SALT ?? "dev")
    .update(body).digest("hex").slice(0, 4).toUpperCase();
  return `${body}-${checksum}`;
}
