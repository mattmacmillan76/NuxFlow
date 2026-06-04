import OpenAI from 'openai'
import type { AiProvider, AiCompletionOptions } from './index'

export class DeepSeekProvider implements AiProvider {
  readonly name = 'deepseek'
  private client: OpenAI | null = null
  private apiKey?: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey
  }

  isConfigured(): boolean {
    return !!(this.apiKey || process.env.DEEPSEEK_API_KEY)
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.apiKey || process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/v1',
      })
    }
    return this.client
  }

  async complete(prompt: string, opts: AiCompletionOptions = {}): Promise<string> {
    const client = this.getClient()
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
    messages.push({ role: 'user', content: prompt })

    const res = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1000,
    })

    return res.choices[0]?.message?.content ?? ''
  }
}
