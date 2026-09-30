/**
 * P5.3: the transcription orchestration, with every side effect injected (no db, config or
 * network imports) so the money paths are unit-tested anywhere. Wiring: transcription.service.ts.
 *
 *   model row -> audio row -> estimate -> affordability (BEFORE any provider call)
 *   -> download -> provider -> bill the provider-reported duration -> delete the audio.
 *
 * Money rules (L12, fail closed on money):
 *   - the caller holds the P1.2 billed-operation lock (voice.router does);
 *   - an unaffordable request never reaches the provider;
 *   - nothing is billed when the provider fails, is unavailable, or answers garbage;
 *   - if the final deduction is refused, the transcript is WITHHELD (we do not hand out free work);
 *   - the transcript text is never logged.
 */
import {
  TranscriptionError, classifyUpstreamStatus, estimateSeconds, normalizeLanguage,
  parseTranscriptionResponse, readPricing, resolveBillableSeconds, transcriptionCostMicro,
} from "./transcription.policy";

export interface TranscriptionModelRow {
  id: string;
  provider: string;
  wholesaleCostInputPerM: string;
  markupMultiplier: string;
}
export interface AudioRow { id: string; mimeType: string; sizeBytes: number }

export type ProviderOutcome =
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number }
  | { kind: "network" };

export interface TranscriptionDeps {
  loadModel(): Promise<TranscriptionModelRow | null>;
  loadAudio(userId: string, audioId: string): Promise<AudioRow | null>;
  getBalanceMicro(userId: string): Promise<number>;
  downloadAudio(userId: string, audio: AudioRow): Promise<Uint8Array | null>;
  callProvider(a: { modelId: string; bytes: Uint8Array; mime: string; language?: string; userId: string; requestId: string }): Promise<ProviderOutcome>;
  deduct(userId: string, micro: number, meta: { modelId: string; requestId: string; seconds: number }): Promise<{ success: boolean }>;
  discard(userId: string, audioId: string): Promise<void>;
  creditValueUsd: number;
  onBilled?(modelId: string, micro: number): void;
  onUpstream?(provider: string, modelId: string, seconds: number, ok: boolean, status?: number): void;
  onError?(message: string): void;
}

export interface TranscribeInput {
  userId: string;
  audioId: string;
  requestId: string;
  /** Client-declared length from MediaRecorder timing. Untrusted; only ever raises the estimate. */
  durationMs?: number;
  language?: string;
}
export interface TranscribeResult { text: string; seconds: number; creditsCharged: number; modelId: string }

export async function runTranscription(input: TranscribeInput, deps: TranscriptionDeps): Promise<TranscribeResult> {
  const { userId, audioId, requestId } = input;

  const model = await deps.loadModel();
  const pricing = model ? readPricing(model) : null;
  if (!model || !pricing) throw new TranscriptionError("TRANSCRIPTION_NOT_CONFIGURED");

  const audio = await deps.loadAudio(userId, audioId);
  if (!audio) throw new TranscriptionError("AUDIO_NOT_FOUND");

  const estimate = estimateSeconds({ sizeBytes: audio.sizeBytes, mime: audio.mimeType, declaredMs: input.durationMs });

  // Affordability BEFORE any provider call: the worst we could be asked to pay is the estimate.
  const estimateCost = transcriptionCostMicro(pricing, Math.ceil(estimate), deps.creditValueUsd);
  const balance = await deps.getBalanceMicro(userId);
  if (balance < estimateCost) throw new TranscriptionError("INSUFFICIENT_BALANCE");

  const bytes = await deps.downloadAudio(userId, audio);
  if (!bytes) throw new TranscriptionError("AUDIO_NOT_FOUND");

  const startedAt = Date.now();
  const outcome = await deps.callProvider({
    modelId: model.id, bytes, mime: audio.mimeType, language: normalizeLanguage(input.language), userId, requestId,
  });
  const elapsed = (Date.now() - startedAt) / 1000;

  if (outcome.kind === "network") {
    deps.onUpstream?.(model.provider, model.id, elapsed, false);
    throw new TranscriptionError("TRANSCRIPTION_UNAVAILABLE"); // nothing billed, audio kept for a retry
  }
  if (outcome.kind === "http") {
    deps.onUpstream?.(model.provider, model.id, elapsed, false, outcome.status);
    if (classifyUpstreamStatus(outcome.status) === "unusable") {
      await deps.discard(userId, audioId); // an undecodable file is useless: do not keep the recording
      throw new TranscriptionError("AUDIO_UNUSABLE");
    }
    throw new TranscriptionError("TRANSCRIPTION_UNAVAILABLE");
  }

  const parsed = parseTranscriptionResponse(outcome.body);
  if (!parsed) {
    deps.onUpstream?.(model.provider, model.id, elapsed, false, 200);
    throw new TranscriptionError("TRANSCRIPTION_FAILED");
  }
  deps.onUpstream?.(model.provider, model.id, elapsed, true, 200);

  // Bill what the provider reports; silence costs the same as speech (the provider charged us).
  const seconds = resolveBillableSeconds(parsed.seconds, estimate);
  const cost = transcriptionCostMicro(pricing, seconds, deps.creditValueUsd);
  const deducted = await deps.deduct(userId, cost, { modelId: model.id, requestId, seconds }).catch((err: unknown) => {
    deps.onError?.(`[voice] deduct threw for user ${userId} request ${requestId}: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false };
  });

  // The recording is deleted as soon as we are done with it, paid or not.
  await deps.discard(userId, audioId);

  if (!deducted.success) {
    deps.onError?.(`[voice] deduction refused after transcription: user ${userId} request ${requestId} model ${model.id} wanted ${cost} micro-credits`);
    throw new TranscriptionError("INSUFFICIENT_BALANCE"); // fail closed: no free transcript
  }
  deps.onBilled?.(model.id, cost);
  return { text: parsed.text, seconds, creditsCharged: cost, modelId: model.id };
}
