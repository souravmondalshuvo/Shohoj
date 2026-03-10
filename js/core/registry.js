// ── APP REGISTRY ─────────────────────────────────────
// Breaks circular dependencies between modules.
// main.js populates this after all modules are loaded.
// Modules that would create import cycles call via app.fn()
// instead of importing directly.
//
// Registered by main.js:
//   app.recalc             — core/calculator.js
//   app.renderSemesters    — ui/render.js
//   app.updateSetupWizard  — ui/setupWizard.js
//   app.runSimulator       — ui/simulator.js
//   app.drawTrendChart     — ui/charts.js
//   app.buildWhatIfSelect  — ui/simulator.js
//   app.importTranscriptPDF — import/importer.js
//   app.applyImport        — import/importer.js
//   app.parseTranscriptText — import/parser.js

export const app = {};