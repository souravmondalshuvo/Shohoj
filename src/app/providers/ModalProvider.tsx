// src/app/providers/ModalProvider.tsx
//
// Confirmation-modal provider for the shell (Phase 3). Replaces the legacy
// window._shohoj_confirmModal bridge with a typed, promise-based API:
//
//   const confirm = useConfirm();
//   if (await confirm({ title: 'Delete?', danger: true })) { ... }
//
// The dialog is accessible from the start: role="dialog" + aria-modal, labelled
// by its title, focus moves in on open and restores on close, Tab is trapped,
// Escape and backdrop click cancel. One dialog at a time is sufficient for the
// product's needs (no stacking).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '../../shared/ui/Button';
import { trapTabKey, useRestoreFocus } from '../../shared/ui/useFocusTrap';

export interface ConfirmOptions {
  readonly title: string;
  readonly message?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Style the confirm action as destructive. */
  readonly danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingRequest {
  readonly options: ConfirmOptions;
  readonly resolve: (confirmed: boolean) => void;
}

const ModalContext = createContext<ConfirmFn | null>(null);

export function ModalProvider({ children }: { readonly children: ReactNode }) {
  const [pending, setPending] = useState<PendingRequest | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  return (
    <ModalContext value={confirm}>
      {children}
      {pending !== null && <ConfirmDialog options={pending.options} onSettle={settle} />}
    </ModalContext>
  );
}

function ConfirmDialog({
  options,
  onSettle,
}: {
  readonly options: ConfirmOptions;
  readonly onSettle: (confirmed: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useRestoreFocus();

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onSettle(false);
      return;
    }
    trapTabKey(event, dialogRef);
  };

  return (
    <div className="shell-modal-backdrop" onClick={() => onSettle(false)} onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        className="shell-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shell-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shell-modal-title" className="shell-modal-title">
          {options.title}
        </h2>
        {options.message !== undefined && <p className="shell-modal-message">{options.message}</p>}
        <div className="shell-modal-actions">
          <Button variant="secondary" onClick={() => onSettle(false)}>
            {options.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            ref={confirmRef}
            variant={options.danger ? 'danger' : 'primary'}
            onClick={() => onSettle(true)}
          >
            {options.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Returns an async confirm(options) → Promise<boolean>. */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ModalContext);
  if (confirm === null) {
    throw new Error('useConfirm must be used within <ModalProvider>');
  }
  return confirm;
}
