// src/react/CgpaCreditTotals.tsx
//
// Vite-only React island for the calculator footer credit totals. Phase 5D:
// totals and their fmtCr-parity formatting come from the pure results model
// via the calculator bridge (default legacyWindowBridge — islands mount
// without a provider), shared with the meter, headline and shell route.

import { useCalculatorBridge } from '../features/calculator/calculatorBridge.ts';
import { computeCalculatorResults, formatCredits } from '../features/calculator/results.ts';

declare global {
  interface Window {
    __SHOHOJ_REACT_CREDIT_TOTALS__?: boolean;
  }
}

type CreditMetric = 'attempted' | 'earned';

interface CgpaCreditTotalProps {
  metric: CreditMetric;
}

export default function CgpaCreditTotal({ metric }: CgpaCreditTotalProps) {
  const bridge = useCalculatorBridge();
  const inputs = bridge.useInputs();
  const results = computeCalculatorResults(inputs, bridge.university);
  return formatCredits(metric === 'attempted' ? results.attemptedCredits : results.earnedCredits);
}
