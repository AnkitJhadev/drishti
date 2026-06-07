// Core Claude tool-calling loop — never modify this pattern (per CLAUDE.md)
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '../utils/logger'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function runAgent(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: (name: string, input: Record<string, unknown>) => Promise<unknown>
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ]

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    })

    if (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      if (!toolUseBlock) break

      logger.debug(`Agent calling tool: ${toolUseBlock.name}`)
      const toolResult = await toolExecutor(
        toolUseBlock.name,
        toolUseBlock.input as Record<string, unknown>
      )

      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: JSON.stringify(toolResult),
          },
        ],
      })
      continue
    }

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text'
      )
      return textBlock?.text ?? ''
    }

    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`)
  }

  return ''
}
