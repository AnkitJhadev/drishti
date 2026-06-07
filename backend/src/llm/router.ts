// Routes each agent task to an ordered list of providers (the fallback chain).
// All current agents need tool-calling, so they route through OpenAI-compatible
// providers (Groq → Together). Vision is handled separately in gemini.ts.

export type Provider = 'groq' | 'together' | 'gemini'

export type AgentTask =
  | 'classify'
  | 'pattern'
  | 'recommend'
  | 'nl_query'
  | 'approval'
  | 'default'

// Fallback order per task — try the first; on failure (incl. rate limits),
// fall through to the next. Gemini catches Groq's daily-cap overflow.
export const TASK_ROUTES: Record<AgentTask, Provider[]> = {
  classify:  ['groq', 'gemini', 'together'],
  pattern:   ['groq', 'gemini', 'together'],
  recommend: ['groq', 'gemini', 'together'],
  nl_query:  ['groq', 'gemini', 'together'],
  approval:  ['groq', 'gemini', 'together'],
  default:   ['groq', 'gemini', 'together'],
}

export function routeFor(task: AgentTask): Provider[] {
  return TASK_ROUTES[task] ?? TASK_ROUTES.default
}
