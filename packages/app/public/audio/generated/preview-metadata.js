// Inject preview.json data for audio metadata lookup
fetch("/audio/generated/preview.json")
  .then(r => r.json())
  .then(data => {
    // @ts-ignore
    window.__AUDIO_PREVIEW_DATA__ = data.items
  })
  .catch(() => {})
