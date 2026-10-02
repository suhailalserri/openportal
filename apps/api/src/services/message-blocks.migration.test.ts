import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestDb, stopTestDb } from "../test/testDb";
import { createTestUser } from "../test/factories";

// P6.4: migration 0024 + the messages.content_blocks column against a real PostgreSQL.
let db: typeof import("@ai-platform/db").db;
let schema: typeof import("@ai-platform/db");
let orm: typeof import("drizzle-orm");

const MIGRATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/db/src/migrations/0024_message_content_blocks.sql");

beforeAll(async () => {
  await startTestDb();
  schema = await import("@ai-platform/db");
  db = schema.db;
  orm = await import("drizzle-orm");
}, 60_000);
afterAll(async () => { await stopTestDb(); });

async function conversation() {
  const { userId } = await createTestUser(db, schema);
  const id = randomUUID();
  await db.insert(schema.conversations).values({ id, userId });
  return id;
}

describe("migration 0024 / messages.content_blocks", () => {
  it("is re-runnable on a database that already has the column and the CHECK", async () => {
    const text = fs.readFileSync(MIGRATION, "utf-8");
    await db.execute(orm.sql.raw(text));
    await db.execute(orm.sql.raw(text));
    const rows = await db.execute(orm.sql`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'messages_content_blocks_is_array'`);
    expect((rows as unknown as Array<{ n: number }>)[0]!.n).toBe(1);
  });

  it("an ordered block array round-trips exactly (order, nesting, unicode)", async () => {
    const conversationId = await conversation();
    const blocks = [
      { type: "thinking", thinking: "فكّر قليلاً", durationMs: 1200 },
      { type: "text", text: "Hello " },
      { type: "tool_use", id: "call_1", name: "get_weather", input: { city: "صنعاء", opts: { units: "c" } } },
      { type: "text", text: "world" },
    ];
    const [row] = await db.insert(schema.messages)
      .values({ conversationId, role: "assistant", content: "Hello world", contentBlocks: blocks })
      .returning();
    const [back] = await db.select().from(schema.messages).where(orm.eq(schema.messages.id, row!.id));
    expect(back!.contentBlocks).toEqual(blocks);
    expect(back!.content).toBe("Hello world");
  });

  it("existing-style rows (no contentBlocks) read back as null", async () => {
    const conversationId = await conversation();
    const [row] = await db.insert(schema.messages).values({ conversationId, role: "assistant", content: "old" }).returning();
    expect(row!.contentBlocks).toBeNull();
  });

  it("the CHECK rejects anything that is not a JSON array", async () => {
    const conversationId = await conversation();
    const bad = (v: string) => db.execute(orm.sql.raw(
      `INSERT INTO messages (conversation_id, role, content, content_blocks) VALUES ('${conversationId}', 'assistant', 'x', '${v}'::jsonb)`));
    await expect(bad('{"type":"text"}')).rejects.toThrow();
    await expect(bad('"text"')).rejects.toThrow();
    await expect(bad('[]')).resolves.toBeDefined();   // an empty array is still an array
  });

  it("deleting the conversation removes the blocks with the messages (cascade, nothing left behind)", async () => {
    const conversationId = await conversation();
    await db.insert(schema.messages).values({ conversationId, role: "assistant", content: "x", contentBlocks: [{ type: "thinking", thinking: "secret" }] });
    await db.delete(schema.conversations).where(orm.eq(schema.conversations.id, conversationId));
    const left = await db.select().from(schema.messages).where(orm.eq(schema.messages.conversationId, conversationId));
    expect(left).toHaveLength(0);
  });
});
