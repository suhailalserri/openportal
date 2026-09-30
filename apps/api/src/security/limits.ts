/**
 * P3.5 (closes N6): one place for input bounds.
 *
 * Every tRPC input that takes free text, a page size, an offset or a money
 * amount imports its schema from here, so a bound is decided once and
 * `limits.test.ts` can prove it. Values are deliberately generous for real
 * use and small enough that no request can make the server do unbounded work.
 */
import { z } from "zod";

export const LIMITS = {
  /** Largest page any list endpoint returns. */
  PAGE_MAX: 100,
  /** Deepest OFFSET a client may ask for (deeper scans should use a cursor). */
  OFFSET_MAX: 100_000,
  /** Admin user search box. */
  SEARCH_MAX: 200,
  /** Free-text "reason" fields written to audit logs / transactions. */
  REASON_MAX: 500,
  /** models.id is varchar(150). */
  MODEL_ID_MAX: 150,
  /** Redeem codes are 19 chars (XXXX-XXXX-XXXX-XXXX); billing.redeemCode allows 32. */
  CODE_MAX: 32,
  /**
   * Largest credit amount one admin action / package / code batch may carry.
   * 1,000,000 credits = 1e12 micro-credits, far below Number.MAX_SAFE_INTEGER
   * (9e15), so `amount * 1_000_000` can never lose precision or overflow.
   */
  CREDITS_MAX: 1_000_000,
  /** Array / record caps for admin-edited model metadata. */
  LIST_MAX: 50,
  LIST_ITEM_MAX: 50,
} as const;

/** `limit` for list endpoints: integer 1..max (default `def`). */
export const pageLimit = (def = 50, max: number = LIMITS.PAGE_MAX) =>
  z.number().int().min(1).max(max).default(def);

/** `offset` for list endpoints: integer 0..OFFSET_MAX. */
export const pageOffset = z.number().int().min(0).max(LIMITS.OFFSET_MAX).default(0);

/** A model id as stored in models.id. */
export const modelIdSchema = z.string().min(1).max(LIMITS.MODEL_ID_MAX);

/** A positive whole number of credits, bounded so micro-credit maths is exact. */
export const creditsAmount = z.number().int().min(1).max(LIMITS.CREDITS_MAX);

/** Free-text reason stored on audit rows. */
export const reasonText = z.string().min(1).max(LIMITS.REASON_MAX);
