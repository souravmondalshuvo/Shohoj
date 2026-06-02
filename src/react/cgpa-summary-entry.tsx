// src/react/cgpa-summary-entry.tsx
//
// Vite-only entry that mounts the CgpaSummary island onto the existing
// .cgpa-display node. Setting window.__SHOHOJ_REACT_SUMMARY__ tells recalc()
// (js/main.js) to stop writing #cgpaVal / .cgpa-label so vanilla and React
// don't fight over the same nodes. Injected only by vite/react-island.js, so
// the live build3.py bundle never loads it.

import { createRoot } from 'react-dom/client';

import CgpaSummary from './CgpaSummary';

function mount() {
  const host = document.querySelector('.cgpa-display');
  if (!host) return;
  window.__SHOHOJ_REACT_SUMMARY__ = true;
  createRoot(host).render(<CgpaSummary />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
