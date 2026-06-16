import { useEffect, useState, useCallback, useLayoutEffect } from 'react'

// First-run guided tour. Spotlights the key dashboard features one by one with
// a tooltip; the operator can step through, go back, or skip. Once finished or
// skipped it never auto-shows again (flag persisted in localStorage). It can be
// re-triggered manually by dispatching a `drishti:start-tour` window event.

const STORAGE_KEY = 'drishti-tour-done'

interface Step {
  selector: string
  title: string
  body: string
  // Where to place the tooltip relative to the target.
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const STEPS: Step[] = [
  {
    selector: '[data-tour="ingest"]',
    title: '1. Ingest complaints',
    body: 'Start here. Drop in a CSV, PDF or JSON of customer complaints — the AI agents parse, classify and geocode each one automatically.',
    placement: 'right',
  },
  {
    selector: '[data-tour="map"]',
    title: '2. Live network map',
    body: 'Watch complaints land on the map in real time. Towers turn amber or red as issues cluster around them. Click a tower for details.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="chat"]',
    title: '3. Ask Drishti',
    body: 'Ask anything in plain English — "which towers are critical?" — and get a grounded answer from your live network data.',
    placement: 'top',
  },
  {
    selector: '[data-tour="simulation"]',
    title: '4. Failure simulation',
    body: 'Run what-if scenarios: simulate a tower failure and see how load redistributes to neighbours and who would be impacted.',
    placement: 'right',
  },
  {
    selector: '[data-tour="approvals"]',
    title: '5. Approvals',
    body: 'The AI proposes fixes for each incident. Review, approve or reject them here — pending recommendations show up as a badge.',
    placement: 'left',
  },
]

interface Rect { top: number; left: number; width: number; height: number }

function getRect(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export default function DashboardTour() {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  // Decide whether to auto-start on first visit, and wire up the manual trigger.
  useEffect(() => {
    const start = () => { setIndex(0); setActive(true) }
    window.addEventListener('drishti:start-tour', start)
    if (!localStorage.getItem(STORAGE_KEY)) {
      // Delay so the dashboard has painted and targets exist.
      const t = setTimeout(start, 900)
      return () => { clearTimeout(t); window.removeEventListener('drishti:start-tour', start) }
    }
    return () => window.removeEventListener('drishti:start-tour', start)
  }, [])

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, '1')
    setActive(false)
  }, [])

  // Position the spotlight on the current target (after scrolling it into view).
  const locate = useCallback(() => {
    const step = STEPS[index]
    const el = document.querySelector(step.selector)
    if (!el) { setRect(null); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    // Wait for the smooth scroll to settle before measuring.
    setTimeout(() => setRect(getRect(el)), 320)
  }, [index])

  useLayoutEffect(() => {
    if (!active) return
    locate()
    const onResize = () => {
      const el = document.querySelector(STEPS[index].selector)
      if (el) setRect(getRect(el))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [active, index, locate])

  // Keyboard: Esc skips, → / Enter advances, ← goes back.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index])

  const next = () => { if (index >= STEPS.length - 1) finish(); else setIndex((i) => i + 1) }
  const prev = () => setIndex((i) => Math.max(0, i - 1))

  if (!active) return null

  const step = STEPS[index]
  const pad = 8
  const tip = rect ? tooltipPosition(rect, step.placement ?? 'bottom', pad) : null

  return (
    <div className="fixed inset-0 z-[2000]" style={{ pointerEvents: 'auto' }}>
      {/* Dim overlay with a spotlight cut-out via a giant box-shadow */}
      {rect ? (
        <div
          onClick={next}
          style={{
            position: 'fixed',
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(3, 7, 18, 0.78)',
            border: '2px solid #f59e0b',
            transition: 'all 0.3s ease',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div onClick={next} style={{ position: 'fixed', inset: 0, background: 'rgba(3, 7, 18, 0.78)' }} />
      )}

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-label="Dashboard tour"
        style={{
          position: 'fixed',
          ...(tip ?? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
          width: 300,
          maxWidth: 'calc(100vw - 24px)',
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          padding: 16,
          zIndex: 2001,
        }}
      >
        <div className="text-sm font-bold mb-1" style={{ color: '#f59e0b' }}>{step.title}</div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: '#cbd5e1' }}>{step.body}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-3">
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === index ? 18 : 6,
                height: 6,
                borderRadius: 999,
                background: i === index ? '#f59e0b' : '#374151',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: '#6b7280' }}
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                onClick={prev}
                className="text-xs px-3 py-1.5 rounded transition-colors"
                style={{ background: '#1a2235', color: '#9ca3af', border: '1px solid #1f2937' }}
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="dr-btn-accent text-xs px-3 py-1.5"
              style={{ borderRadius: 6 }}
            >
              {index === STEPS.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Compute a tooltip position that keeps the card on-screen.
function tooltipPosition(rect: Rect, placement: string, pad: number): { top: number; left: number } {
  const W = 300
  const gap = pad + 12
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top = 0
  let left = 0

  switch (placement) {
    case 'top':
      top = rect.top - gap - 150
      left = rect.left + rect.width / 2 - W / 2
      break
    case 'left':
      top = rect.top
      left = rect.left - gap - W
      break
    case 'right':
      top = rect.top
      left = rect.left + rect.width + gap
      break
    case 'bottom':
    default:
      top = rect.top + rect.height + gap
      left = rect.left + rect.width / 2 - W / 2
      break
  }

  // Clamp into the viewport with a 12px margin.
  left = Math.max(12, Math.min(left, vw - W - 12))
  top = Math.max(12, Math.min(top, vh - 200))
  return { top, left }
}
