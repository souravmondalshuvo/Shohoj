// src/react/CgpaMeter.tsx
//
// Vite-only React island for the CGPA meter panel. Phase 5D: the percent and
// status-tier logic comes from the pure results model via the calculator
// bridge (default legacyWindowBridge — islands mount without a provider), and
// the status wording is shared with the shell's composed results section
// (meterStatusMessage in CalculatorResults.tsx). Only the legacy meter markup
// this island hydrates into lives here.

import { useCalculatorBridge } from '../features/calculator/calculatorBridge.ts';
import { meterStatusMessage } from '../features/calculator/CalculatorResults.tsx';
import { computeCalculatorResults } from '../features/calculator/results.ts';

declare global {
  interface Window {
    __SHOHOJ_REACT_METER__?: boolean;
  }
}

export default function CgpaMeter() {
  const inputs = useCalculatorBridge().useInputs();
  const { meterPercent, meterPercentLabel, meterStatus } = computeCalculatorResults(inputs);

  return (
    <>
      <div className="lg-shine"></div>
      <div className="lg-bloom"></div>
      <div className="meter-header">
        <span>CGPA Score</span>
        <span id="meterPct">{meterPercentLabel}</span>
      </div>
      <div className="meter-bar-bg">
        <div className="meter-bar-fill" id="meterFill" style={{ width: `${meterPercent}%` }}></div>
      </div>
      <div className="meter-labels">
        <span>0.0</span>
        <span>1.0</span>
        <span>2.0</span>
        <span>3.0</span>
        <span>4.0</span>
      </div>
      <div className="meter-status" id="meterStatus">
        {meterStatusMessage(meterStatus)}
      </div>
    </>
  );
}
