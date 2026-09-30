/**
 * P5.3: wiring of the transcription core (transcription.core.ts) to the real database, storage,
 * gateway and balance. See the core file for the flow and the money rules.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, models, storageObjects } from "@ai-platform/db";
import { CREDIT_VALUE_USD } from "@ai-platform/config";
import { config } from "../config";
import { getStorageClient } from "./storage.client";
import { getStorageService } from "./storage.service";
import { readCapped } from "./attachments.service";
import { getBalance, deductCreditsAtomic } from "./balance.service";
import { recordCreditsSpent, recordUpstreamCall } from "../metrics";
import {
  TRANSCRIPTION_CATEGORY, TRANSCRIPTION_LIMITS, TranscriptionError, audioFileName,
} from "./transcription.policy";
import { runTranscription, type TranscribeInput, type TranscriptionDeps } from "./transcription.core";

export { runTranscription };
export type { TranscribeInput, TranscribeResult, TranscriptionDeps } from "./transcription.core";

// ── real wiring ─────────────────────────────────────────────────────────────

function realDeps(): TranscriptionDeps {
  const storage = getStorageService();
  const client = getStorageClient();
  if (!storage || !client) throw new TranscriptionError("TRANSCRIPTION_NOT_CONFIGURED");

  return {
    creditValueUsd: CREDIT_VALUE_USD,

    async loadModel() {
      const [row] = await db.select({
        id: models.id, provider: models.provider,
        wholesaleCostInputPerM: models.wholesaleCostInputPerM, markupMultiplier: models.markupMultiplier,
      }).from(models).where(and(
        eq(models.status, "published"),
        eq(models.isAvailable, true),
        sql`${TRANSCRIPTION_CATEGORY} = ANY(${models.categories})`,
      )).orderBy(models.id).limit(1);
      return row ?? null;
    },

    async loadAudio(userId, audioId) {
      const [row] = await db.select({
        id: storageObjects.id, mimeType: storageObjects.mimeType, sizeBytes: storageObjects.sizeBytes,
      }).from(storageObjects).where(and(
        eq(storageObjects.id, audioId),
        eq(storageObjects.userId, userId),
        eq(storageObjects.bucket, "audio"),
        eq(storageObjects.status, "confirmed"),
      )).limit(1);
      if (!row || !row.sizeBytes) return null;
      return { id: row.id, mimeType: row.mimeType, sizeBytes: row.sizeBytes };
    },

    async getBalanceMicro(userId) { return (await getBalance(userId)).credits; },

    async downloadAudio(userId, audio) {
      const [row] = await db.select({ objectKey: storageObjects.objectKey }).from(storageObjects)
        .where(and(eq(storageObjects.id, audio.id), eq(storageObjects.userId, userId), eq(storageObjects.status, "confirmed"))).limit(1);
      if (!row) return null;
      const url = await client.createSignedDownloadUrl("audio", row.objectKey, 60);
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      return readCapped(res, TRANSCRIPTION_LIMITS.maxBytes);
    },

    async callProvider(a) {
      const form = new FormData();
      form.append("file", new Blob([a.bytes as BlobPart], { type: a.mime }), audioFileName(a.mime));
      form.append("model", a.modelId);
      form.append("response_format", "json");
      if (a.language) form.append("language", a.language);
      try {
        const res = await fetch(`${config.GATEWAY_URL}/v1/audio/transcriptions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.GATEWAY_MASTER_KEY}`,
            "X-User-ID":     a.userId,
            "X-Request-ID":  a.requestId,
          },
          body: form,
          signal: AbortSignal.timeout(TRANSCRIPTION_LIMITS.providerTimeoutMs),
        });
        if (!res.ok) return { kind: "http", status: res.status };
        return { kind: "ok", body: await res.json().catch(() => null) };
      } catch {
        return { kind: "network" };
      }
    },

    async deduct(userId, micro, meta) {
      const r = await deductCreditsAtomic(userId, micro, `Transcription (${meta.seconds}s)`, { modelId: meta.modelId, requestId: meta.requestId });
      return { success: r.success };
    },

    async discard(userId, audioId) {
      await storage.discardConfirmed({ userId, objectId: audioId }).catch(() => {}); // the 24 h sweep is the backstop
    },

    onBilled: (modelId, micro) => recordCreditsSpent(modelId, micro),
    onUpstream: (provider, modelId, seconds, ok, status) => recordUpstreamCall(provider, modelId, seconds, ok, status),
    onError: (m) => console.error(m),
  };
}

export function getTranscriptionService() {
  return {
    transcribe: (input: TranscribeInput) => runTranscription(input, realDeps()),
  };
}
export type TranscriptionService = ReturnType<typeof getTranscriptionService>;
