'use client';

/**
 * A modal built on the native <dialog> element.
 *
 * Using the real element rather than a positioned <div> is deliberate: the
 * browser gives us the top layer, a backdrop, focus trapping and Escape
 * handling for free, and gets the accessibility right without a library.
 *
 * `dismissible` is false while the wallet is signing. Letting Escape or a
 * backdrop click tear the dialog down mid-signature would leave the user
 * looking at the dashboard with no idea whether their transfer went through.
 */

import { useEffect, useRef, type ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** When false, Escape and backdrop clicks are ignored. */
  dismissible?: boolean;
  label: string;
  children: ReactNode;
};

export function Modal({ open, onClose, dismissible = true, label, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      className="modal-dialog"
      onCancel={(event) => {
        // Fires on Escape. Swallow it while a signature is in flight.
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        // A click landing on the dialog itself, rather than its content, is a
        // backdrop click: the content fills the dialog's padding box.
        if (event.target === dialogRef.current && dismissible) onClose();
      }}
    >
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
