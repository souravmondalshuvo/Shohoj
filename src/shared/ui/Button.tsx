// src/shared/ui/Button.tsx
//
// First shared UI primitive (Phase 3; deferred from Phase 2 until it had real
// consumers — the confirm dialog and route actions). A thin, typed wrapper over
// <button> that standardizes variants and forwards all native button props. No
// CSS rewrite: it emits stable class names the shell stylesheet owns
// (shell-btn / shell-btn--<variant>), preserving the existing visual system.

import type { ButtonHTMLAttributes, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  // React 19 passes ref as a regular prop; declare it so callers can forward one.
  readonly ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = 'secondary', className, type, ref, ...rest }: ButtonProps) {
  const classes = `shell-btn shell-btn--${variant}${className ? ` ${className}` : ''}`;
  return <button ref={ref} type={type ?? 'button'} className={classes} {...rest} />;
}
