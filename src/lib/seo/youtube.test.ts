import { describe, expect, it } from "vitest";
import { youtubeVideoId } from "./youtube";

describe("youtubeVideoId", () => {
  it("accepts supported HTTPS YouTube URL shapes", () => {
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(
      youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(
      youtubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("rejects non-YouTube and non-HTTPS URLs", () => {
    expect(youtubeVideoId("https://example.com/dQw4w9WgXcQ")).toBeNull();
    expect(youtubeVideoId("http://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });
});
