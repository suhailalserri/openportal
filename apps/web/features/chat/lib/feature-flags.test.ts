import { describe, expect, it } from "vitest";

import { CHAT_FEATURES_OFF, toChatFeatures } from "./feature-flags";

describe("toChatFeatures (P6.3d, fails closed)", () => {
  it("loading / error / garbage -> everything off", () => {
    for (const bad of [undefined, null, "yes", 1, true, []]) {
      expect(toChatFeatures(bad)).toEqual(CHAT_FEATURES_OFF);
    }
  });

  it("maps each switch on its own", () => {
    expect(toChatFeatures({ attachments: true, voice: false, thinking: false })).toEqual({ attachments: true, voice: false, thinking: false });
    expect(toChatFeatures({ attachments: false, voice: true, thinking: false })).toEqual({ attachments: false, voice: true, thinking: false });
    expect(toChatFeatures({ attachments: false, voice: false, thinking: true })).toEqual({ attachments: false, voice: false, thinking: true });
  });

  it("only a literal true counts", () => {
    expect(toChatFeatures({ attachments: "true", voice: 1, thinking: "1" })).toEqual(CHAT_FEATURES_OFF);
    expect(toChatFeatures({})).toEqual(CHAT_FEATURES_OFF);
  });
});
