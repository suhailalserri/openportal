import { describe, expect, it } from "vitest";

import { FEATURES_OFF, toFeatureFlags } from "./feature-flags.service";

describe("toFeatureFlags (P6.3d)", () => {
  it("no row -> everything off", () => {
    expect(toFeatureFlags(undefined)).toEqual(FEATURES_OFF);
    expect(toFeatureFlags(null)).toEqual(FEATURES_OFF);
  });

  it("a row from before migration 0023 (columns missing) -> everything off", () => {
    expect(toFeatureFlags({})).toEqual(FEATURES_OFF);
  });

  it("maps each column to its own switch", () => {
    expect(toFeatureFlags({ featureAttachments: true })).toEqual({ attachments: true, voice: false, thinking: false });
    expect(toFeatureFlags({ featureVoice: true })).toEqual({ attachments: false, voice: true, thinking: false });
    expect(toFeatureFlags({ featureThinking: true })).toEqual({ attachments: false, voice: false, thinking: true });
  });

  it("only a literal true counts (null and false stay off)", () => {
    expect(toFeatureFlags({ featureAttachments: null, featureVoice: false, featureThinking: null })).toEqual(FEATURES_OFF);
  });
});
