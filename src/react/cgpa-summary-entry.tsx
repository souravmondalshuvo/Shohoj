// src/react/cgpa-summary-entry.tsx
//
// Vite-only entry that mounts React calculator islands onto existing DOM nodes.
// The flags tell recalc() (js/main.js) to stop writing nodes React owns, so
// vanilla and React don't fight. Injected only by vite/react-island.js, so the
// live build3.py bundle never loads it.

import { createRoot } from 'react-dom/client';

import CgpaCreditTotal from './CgpaCreditTotals';
import CgpaMeter from './CgpaMeter';
import CgpaSummary from './CgpaSummary';

function mount() {
  const host = document.querySelector('.cgpa-display');
  if (host) {
    window.__SHOHOJ_REACT_SUMMARY__ = true;
    createRoot(host).render(<CgpaSummary />);
  }

  const attemptedHost = document.getElementById('totalAttempted');
  const earnedHost = document.getElementById('totalEarned');
  if (attemptedHost && earnedHost) {
    attemptedHost.dataset.reactCgpaCredit = 'attempted';
    earnedHost.dataset.reactCgpaCredit = 'earned';
    window.__SHOHOJ_REACT_CREDIT_TOTALS__ = true;
    createRoot(attemptedHost).render(<CgpaCreditTotal metric="attempted" />);
    createRoot(earnedHost).render(<CgpaCreditTotal metric="earned" />);
  }

  const meterHost = document.querySelector('.cgpa-meter');
  if (meterHost) {
    meterHost.setAttribute('data-react-cgpa-meter', 'true');
    window.__SHOHOJ_REACT_METER__ = true;
    createRoot(meterHost).render(<CgpaMeter />);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
