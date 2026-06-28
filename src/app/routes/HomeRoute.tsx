// src/app/routes/HomeRoute.tsx
//
// Landing route for the React Router shell (Phase 3). Lazy-loaded route module
// (exports `Component`), code-split out of the shell entry. Doubles as the first
// real consumer of the shell's UI primitive + providers — the Button, the
// confirm modal, and the runtime capabilities — so they're exercised end to end.

import { Button } from '../../shared/ui/Button';
import { useConfirm } from '../providers/ModalProvider';
import { useCapabilities } from '../providers/RuntimeConfigProvider';

export function Component() {
  const confirm = useConfirm();
  const { cloud } = useCapabilities();

  return (
    <section className="shell-page">
      <h1>Shohoj</h1>
      <p>BRAC University academic and campus-life tools.</p>
      <p className="shell-muted">
        React Router shell (Phase 3). The live app still ships from the legacy
        build during migration.
      </p>
      <p className="shell-muted">
        Cloud features: {cloud ? 'available' : 'offline (local tools still work)'}
      </p>
      <Button
        variant="primary"
        onClick={async () => {
          await confirm({
            title: 'Confirm dialog',
            message: 'This is the shared, focus-trapped confirmation modal.',
            confirmLabel: 'Got it',
          });
        }}
      >
        Try the confirm dialog
      </Button>
    </section>
  );
}
