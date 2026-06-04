import type { ImageProvider, ImageGenerationOptions } from './index'

export class ImagenProvider implements ImageProvider {
  readonly name = 'google'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  async generate(prompt: string, _opts: ImageGenerationOptions = {}): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${this.apiKey}`

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Imagen API error: ${err}`)
    }

    const data = await res.json() as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>
    }

    const prediction = data.predictions?.[0]
    if (!prediction?.bytesBase64Encoded) {
      throw new Error('Imagen returned no image data')
    }

    // Return as a data URL so downstream code can handle it uniformly
    const mime = prediction.mimeType ?? 'image/png'
    return `data:${mime};base64,${prediction.bytesBase64Encoded}`
  }
}
