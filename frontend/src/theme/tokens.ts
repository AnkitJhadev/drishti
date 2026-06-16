import type { Severity } from '../types/complaint'
import type { TowerStatus } from '../types/tower'

// Single source of truth for the ops-theme palette. Mirrors tailwind.config.ts;
// import these instead of hardcoding hex in inline styles, so severity/status
// colours live in exactly one place.
export const color = {
  bg: { page: '#0a0f1e', card: '#111827', elevated: '#1a2235' },
  border: { base: '#1f2937', hover: '#374151' },
  accent: '#f59e0b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f97316',
  info: '#3b82f6',
  text: { primary: '#f9fafb', secondary: '#9ca3af', muted: '#6b7280' },
} as const

// Severity / priority badge colours (shared — both use low|medium|high|critical).
export const SEVERITY: Record<Severity, { bg: string; text: string }> = {
  low: { bg: '#374151', text: '#9ca3af' },
  medium: { bg: '#92400e', text: '#fcd34d' },
  high: { bg: '#7c2d12', text: '#fb923c' },
  critical: { bg: '#7f1d1d', text: '#f87171' },
}

// Tower status dot colours.
export const TOWER_STATUS: Record<TowerStatus, string> = {
  operational: color.success,
  degraded: color.warning,
  critical: color.danger,
  offline: color.text.muted,
}

// Resolved / failed accents + badges for complaint cards.
export const STATE = {
  resolvedAccent: color.success,
  resolvedBadge: { bg: '#064e3b', text: '#6ee7b7' },
  failedAccent: color.warning,
  failedBadge: { bg: '#7c2d12', text: '#fdba74' },
  failedText: '#fb923c',
} as const
