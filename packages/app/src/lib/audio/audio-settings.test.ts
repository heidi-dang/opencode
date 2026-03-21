import { describe, expect, test } from "bun:test"
import { assetSrc, cueSrc, generatedPreviewSrc, previewList } from "./audio-settings"

describe("audio settings helpers", () => {
  test("builds workflow and preview urls with an optional workspace base", () => {
    expect(assetSrc("/audio/generated/preview.json")).toBe("/audio/generated/preview.json")
    expect(assetSrc("/audio/generated/preview.json", "Zm9v")).toBe("/Zm9v/audio/generated/preview.json")
    expect(cueSrc("minimal-pro", "turn.complete", "Zm9v")).toBe("/Zm9v/audio/minimal-pro/resolve_up.wav")
    expect(generatedPreviewSrc("Zm9v")).toBe("/Zm9v/audio/generated/preview.json")
    expect(previewList("minimal-pro", "Zm9v")[0]?.src).toBe("/Zm9v/audio/minimal-pro/wake_chirp.wav")
  })
})
