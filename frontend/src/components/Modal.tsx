import type { ReactNode, CSSProperties } from 'react'
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

/**
 * Shared dialog shell: dimmed backdrop, click-outside + Esc to close, and
 * role="dialog"/aria-modal semantics. Callers provide the panel chrome and
 * content as children so existing layouts render identically.
 */
export default function Modal({ open, onClose, label, panelClassName, panelStyle, children }: ModalProps) {
  useEscapeKey(open, onClose)
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[1700] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className={panelClassName}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
