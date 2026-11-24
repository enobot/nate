import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation dialog: focus moves into the dialog, Tab stays inside it, Escape
 * closes it, and focus returns to the button that opened it.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Keep it',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const focusable = dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input, select, [href]');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm motion-safe:animate-toast-in">
      <div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        onKeyDown={onKeyDown}
        className="card w-full max-w-md p-6"
      >
        <h2 id={titleId} className="font-display text-2xl font-bold text-white">
          {title}
        </h2>
        {children && (
          <div id={bodyId} className="mt-3 space-y-3 text-sm text-ink-300">
            {children}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button ref={cancelButton} type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
