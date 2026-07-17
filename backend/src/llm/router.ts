// Routes each agent task to an ordered list of providers (the fallback chain).
// All current agents need tool-calling, so they route through OpenAI-compatible
// providers (Groq → Together). Vision is handled separately in gemini.ts.

export type Provider = 'groq' | 'cerebras' | 'together' | 'gemini'

export type AgentTask =
  | 'classify'
  | 'pattern'
  | 'recommend'
  | 'nl_query'
  | 'approval'
  | 'default'

// Fallback order per task — try the first; on failure (incl. rate limits),
// fall through to the next. Groq + Cerebras are both free primaries; Gemini
// catches their daily-cap overflow; Together is the last resort.
export const TASK_ROUTES: Record<AgentTask, Provider[]> = {
  classify:  ['groq', 'cerebras', 'gemini', 'together'],
  pattern:   ['groq', 'cerebras', 'gemini', 'together'],
  recommend: ['groq', 'cerebras', 'gemini', 'together'],
  nl_query:  ['groq', 'cerebras', 'gemini', 'together'],
  approval:  ['groq', 'cerebras', 'gemini', 'together'],
  default:   ['groq', 'cerebras', 'gemini', 'together'],
}

export function routeFor(task: AgentTask): Provider[] {
  return TASK_ROUTES[task] ?? TASK_ROUTES.default
}
