// ── ACTION DISPATCH ───────────────────────────────────────────────────────────
// Replaces inline onclick/onchange/oninput attributes with delegated listeners
// resolved from a single data-action attribute plus a registry of handlers.
// This lets the bundled HTML drop 'unsafe-inline' from script-src in CSP.
//
// Usage from a module's template literal:
//   <button data-action="addCourse" data-sem-id="${sem.id}">+ Add</button>
//
// And from the module's top-level code (runs once at module load):
//   registerAction('addCourse', (el) => addCourse(Number(el.dataset.semId)));
//
// The handler receives (element, event). The event type is whichever of
// click / change / input fired — each element should declare a data-action
// for exactly one event type.

const _actions = Object.create(null);

export function registerAction(name, handler) {
  _actions[name] = handler;
}

function _dispatch(event) {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const fn = _actions[el.dataset.action];
  if (typeof fn === 'function') fn(el, event);
}

if (typeof document !== 'undefined') {
  ['click', 'change', 'input'].forEach(type => {
    document.addEventListener(type, _dispatch);
  });
}

// Expose globally so modules can register without importing (e.g. firebase.js
// is a separate module script that does not consume the bundle's exports).
if (typeof window !== 'undefined') {
  window._shohoj_registerAction = registerAction;
}
