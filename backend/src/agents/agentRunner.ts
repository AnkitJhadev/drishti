// Core tool-calling entry for all agents.
// Delegates to the LLM router (Groq → Together fallback). Free providers only.
import type Anthropic from '@anthropic-ai/sdk'
import { runLLMAgent } from '../llm'
import type { AgentTask } from '../llm/router'

type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<unknown>

export async function runAgent(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: ToolExecutor,
  task: AgentTask = 'default'
): Promise<string> {
  return runLLMAgent(task, systemPrompt, userMessage, tools, toolExecutor)
}
