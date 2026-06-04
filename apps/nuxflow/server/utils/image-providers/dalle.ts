import OpenAI from 'openai'
import type { ImageProvider, ImageGenerationOptions } from './index'

export class DalleProvider implements ImageProvider {
  readonly name = 'openai'
  private client: OpenAI | null = null
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: this.apiKey })
    }
    return this.client
  }

  async generate(prompt: string, opts: ImageGenerationOptions = {}): Promise<string> {
    const client = this.getClient()
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: opts.size ?? '1024x1024',
      quality: opts.quality ?? 'standard',
      response_format: 'url',
    })
    const url = response.data?.[0]?.url
    if (!url) throw new Error('DALL-E returned no image URL')
    return url
  }
}
