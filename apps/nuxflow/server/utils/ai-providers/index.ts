import type { H3Event } from 'h3'
import { resolveSetting } from '../settings'
import { OpenAiProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { OllamaProvider } from './ollama'
import { DeepSeekProvider } from './deepseek'

export interface AiCompletionOptions {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface AiProvider {
  name: string
  complete(prompt: string, options?: AiCompletionOptions): Promise<string>
  isConfigured(): boolean
}

export async function getAiProvider(event: H3Event): Promise<AiProvider | null> {
  const provider = await resolveSetting(event, 'ai.provider', 'aiProvider') as string | undefined

  let p: AiProvider | null = null

  switch (provider) {
    case 'openai': {
      const apiKey = await resolveSetting(event, 'ai.openai_api_key', 'openaiApiKey')
      p = new OpenAiProvider(apiKey)
      break
    }
    case 'anthropic': {
      const apiKey = await resolveSetting(event, 'ai.anthropic_api_key', 'anthropicApiKey')
      p = new AnthropicProvider(apiKey)
      break
    }
    case 'gemini': {
      const apiKey = await resolveSetting(event, 'ai.gemini_api_key', 'geminiApiKey')
      p = new GeminiProvider(apiKey)
      break
    }
    case 'ollama': {
      const url = await resolveSetting(event, 'ai.ollama_base_url', 'ollamaUrl')
      const model = await resolveSetting(event, 'ai.ollama_model', 'ollamaModel')
      p = new OllamaProvider(url, model)
      break
    }
    case 'deepseek': {
      const apiKey = await resolveSetting(event, 'ai.deepseek_api_key', 'deepseekApiKey')
      p = new DeepSeekProvider(apiKey)
      break
    }
  }

  // Return null if key is missing — callers throw 503 on null
  return p?.isConfigured() ? p : null
}
