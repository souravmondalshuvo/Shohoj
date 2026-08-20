// src/react/CgpaSummary.tsx
//
// Vite-only React island for the headline CGPA display (#cgpaVal value + color,
// .cgpa-label). Phase 5D: the figure/label/threshold logic lives in the pure
// results model (src/features/calculator/results.ts) and the data arrives
// through the calculator bridge — the default legacyWindowBridge, since islands
// mount without a provider — so this island, the meter, the credit totals and
// the shell route all share one definition of what recalc() computes.

import { useCalculatorBridge } from '../features/calculator/calculatorBridge.ts';
import { gpaBadgeColors } from '../features/calculator/colors.ts';
import { computeCalculatorResults } from '../features/calculator/results.ts';

declare global {
  interface Window {
    __SHOHOJ_REACT_SUMMARY__?: boolean;
  }
}

export default function CgpaSummary() {
  const bridge = useCalculatorBridge();
  const inputs = bridge.useInputs();
  const { cgpa, headlineLabel } = computeCalculatorResults(inputs, bridge.university);

  return (
    <div data-react-cgpa>
      <div
        className="cgpa-val"
        id="cgpaVal"
        style={{ color: cgpa === null ? 'var(--text3)' : gpaBadgeColors(cgpa).color }}
      >
        {cgpa !== null ? cgpa.toFixed(2) : '—'}
      </div>
      <div className="cgpa-label">{headlineLabel}</div>
    </div>
  );
}
