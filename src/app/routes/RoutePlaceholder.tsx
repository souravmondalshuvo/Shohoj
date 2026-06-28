// src/app/routes/RoutePlaceholder.tsx
//
// Shared placeholder for routes whose feature hasn't migrated yet (Phase 3).
// Keeps the full route map navigable without each empty route needing its own
// module. As a feature migrates (Phase 5/6) its route swaps to a real lazy
// module in router.tsx.

export function RoutePlaceholder({
  title,
  note,
}: {
  readonly title: string;
  readonly note?: string;
}) {
  return (
    <section className="shell-page">
      <h1>{title}</h1>
      <p className="shell-muted">{note ?? 'This feature migrates to the shell in a later phase.'}</p>
    </section>
  );
}
