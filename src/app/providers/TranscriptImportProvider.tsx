// src/app/providers/TranscriptImportProvider.tsx
//
// One transcript-import flow for the whole shell.
//
// The modal used to be mounted by CalculatorRoute, with its imperative handle
// held in a route-local ref — which was fine while the only buttons that opened
// it were on that route. Legacy's "📄 Import Transcript" lives in the GLOBAL
// footer below the tab bar (index.html:602), so hoisting the footer (#616)
// meant hoisting the flow it opens: a ref cannot be reached from outside the
// route that owns it.
//
// Mounted once, under CalculatorProvider, so every opener — the footer, the
// calculator's empty state, the simulator nudge — drives the same dialog and
// lands in the same calculator state.

import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';

import TranscriptImport, {
  type TranscriptImportHandle,
} from '../../features/calculator/TranscriptImport.tsx';
import { BRACU_COURSE_CATALOG } from '../../features/calculator/catalog';
import { useNotifications } from '../../state/NotificationProvider';
import { useCalculator } from './CalculatorProvider';

// Catalogue lookup for the import's post-parse cleanup (the legacy
// COURSE_DB[code] access). Built once at module scope, as CalculatorRoute did.
const COURSE_BY_CODE = new Map(
  BRACU_COURSE_CATALOG.map((c) => [c.code, { full: c.full, credits: c.credits }]),
);
const lookupCourse = (code: string) => COURSE_BY_CODE.get(code) ?? null;

/** Opens the transcript picker. A no-op outside the provider, by design: the
 *  standalone islands render calculator UI without the shell chrome. */
const TranscriptImportContext = createContext<() => void>(() => {});

/** Open the shell's one transcript-import flow. */
export function useTranscriptImport(): () => void {
  return useContext(TranscriptImportContext);
}

export function TranscriptImportProvider({ children }: { readonly children: ReactNode }) {
  const { dispatch } = useCalculator();
  const { notify } = useNotifications();
  const ref = useRef<TranscriptImportHandle>(null);
  const open = useCallback(() => ref.current?.open(), []);

  return (
    <TranscriptImportContext value={open}>
      {children}
      <TranscriptImport
        ref={ref}
        lookupCourse={lookupCourse}
        onImport={(imported) => {
          dispatch({ type: 'replace', state: imported });
          notify({
            kind: 'success',
            message: `Imported ${imported.semesters.length} semester${
              imported.semesters.length !== 1 ? 's' : ''
            } from your transcript.`,
          });
        }}
      />
    </TranscriptImportContext>
  );
}
