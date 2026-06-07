// Routes each agent task to an ordered list of providers (the fallback chain).
// All current agents need tool-calling, so they route through OpenAI-compatible
// providers (Groq → Together). Vision is handled separately in gemini.ts.

export type Provider = 'groq' | 'together'

export type AgentTask =
  | 'classify'
  | 'pattern'
  | 'recommend'
  | 'nl_query'
  | 'approval'
  | 'default'

// Fallback order per task — try the first; on failure, try the next.
export const TASK_ROUTES: Record<AgentTask, Provider[]> = {
  classify:  ['groq', 'together'],
  pattern:   ['groq', 'together'],
  recommend: ['groq', 'together'],
  nl_query:  ['groq', 'together'],
  approval:  ['groq', 'together'],
  default:   ['groq', 'together'],
}

export function routeFor(task: AgentTask): Provider[] {
  return TASK_ROUTES[task] ?? TASK_ROUTES.default
}
