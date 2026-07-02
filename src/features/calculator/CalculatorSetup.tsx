// src/features/calculator/CalculatorSetup.tsx
//
// Department + start-semester setup controls for the shell /calculator route
// (#313) — the typed counterpart of the legacy setup wizard's pickers
// (#deptSelect / #startSeason / #startYear). Presentation-only: options come
// from the typed department adapter, values/handlers from the route, and the
// season list is scoped to the selected department's calendar exactly like
// onDeptSelect() rebuilds the legacy options.

import { DEPARTMENT_LIST, deptSeasonsFor, getDepartment } from './departments.ts';

export interface CalculatorSetupProps {
  readonly currentDept: string;
  readonly startSeason: string;
  readonly startYear: string;
  readonly onDeptChange: (code: string) => void;
  readonly onStartChange: (season: string, year: string) => void;
}

/** Selectable start years: 2020 (legacy floor) through next year. */
function startYearOptions(now: Date): string[] {
  const years: string[] = [];
  for (let year = now.getFullYear() + 1; year >= 2020; year--) years.push(String(year));
  return years;
}

export default function CalculatorSetup({
  currentDept,
  startSeason,
  startYear,
  onDeptChange,
  onStartChange,
}: CalculatorSetupProps) {
  const dept = getDepartment(currentDept);
  const seasons = deptSeasonsFor(currentDept);

  return (
    <div className="calc-setup" data-testid="calculator-setup">
      <label className="calc-setup-field">
        Department
        <select
          className="calc-setup-select"
          value={dept?.code ?? ''}
          onChange={(e) => onDeptChange(e.target.value)}
        >
          <option value="" disabled>
            — Department —
          </option>
          {DEPARTMENT_LIST.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      {dept && <span className="calc-setup-credits">{dept.totalCredits} Total Credits</span>}

      <label className="calc-setup-field">
        Start season
        <select
          className="calc-setup-select"
          value={(seasons as readonly string[]).includes(startSeason) ? startSeason : ''}
          onChange={(e) => onStartChange(e.target.value, startYear)}
        >
          <option value="" disabled>
            — Season —
          </option>
          {seasons.map((season) => (
            <option key={season} value={season}>
              {season}
            </option>
          ))}
        </select>
      </label>

      <label className="calc-setup-field">
        Start year
        <select
          className="calc-setup-select"
          value={startYear}
          onChange={(e) => onStartChange(startSeason, e.target.value)}
        >
          <option value="" disabled>
            — Year —
          </option>
          {startYearOptions(new Date()).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
