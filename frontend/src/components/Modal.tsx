import { type ReactNode, type CSSProperties, type KeyboardEvent, useRef, useEffect } from 'react'
import { useEscapeKey } from '../hooks/useEscapeKey'

interface ModalProps {
  open: boolean
  onClose: () => void
  /** Accessible name for the dialog (aria-label). */
  label: string
  /** Classes for the inner panel (size, layout, surface). */
  panelClassName?: string
  /** Inline styles for the inner panel. */
  panelStyle?: CSSProperties
  children: ReactNode
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Shared dialog shell: dimmed backdrop, click-outside + Esc to close,
 * role="dialog"/aria-modal semantics, plus focus management — moves focus into
 * the dialog on open, restores it to the trigger on close, and traps Tab inside.
 */
export default function Modal({ open, onClose, label, panelClassName, panelStyle, children }: ModalProps) {
  useEscapeKey(open, onClose)
  const panelRef = useRef<HTMLDivElement>(null)

  // Move focus into the dialog on open; return it to the previously-focused
  // element (the trigger) on close — standard accessible-dialog behaviour.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panelRef.current)?.focus()
    return () => previouslyFocused?.focus?.()
  }, [open])

  if (!open) return null

  // Keep Tab focus cycling within the dialog.
  function trapFocus(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!items || items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1700] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={panelClassName}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={trapFocus}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
