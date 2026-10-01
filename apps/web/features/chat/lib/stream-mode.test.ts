import { describe, it, expect } from "vitest";

import { STREAM_V2_MEDIA_TYPE } from "./stream-mode";

describe("stream-mode", () => {
  it("keeps the exact media type the api negotiates on", () => {
    expect(STREAM_V2_MEDIA_TYPE).toBe("application/vnd.aip.stream+v2");
  });
});
