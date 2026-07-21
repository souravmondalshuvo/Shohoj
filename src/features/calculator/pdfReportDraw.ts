// src/features/calculator/pdfReportDraw.ts
//
// Drawing layer for the CGPA report (#325): walks the pure PdfReport over a
// structural jsPDF document, keeping exportPDF's layout verbatim — the A4
// geometry, colour palette, header (logo / dept / big tiered CGPA), the
// four-stat band, summary card, semester tables with grade badges and zebra
// rows, checkY pagination with continued-page headers, and the dated footer.
// All numbers/strings come from the report; this file owns only presentation.

import type { CgpaTier, GpaTier, PdfReport, PdfSemesterSection } from './pdfReport.ts';

type Rgb = readonly [number, number, number];

/** The slice of a jsPDF document this drawer uses (window.jspdf.jsPDF). */
export interface PdfDocLike {
  setFillColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setFontSize(size: number): void;
  setFont(family: string, style: string): void;
  setLineWidth(width: number): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  roundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    rx: number,
    ry: number,
    style?: string,
  ): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  text(text: string, x: number, y: number, options?: { align?: 'right' | 'center' }): void;
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): void;
  addPage(): void;
  save(filename: string): void;
}

const PW = 210;
const PH = 297;
const ML = 14;
const MR = 14;
const CW = PW - ML - MR;

const GREEN: Rgb = [46, 204, 113];
const GREEN_DARK: Rgb = [27, 122, 67];
const GREEN_BG: Rgb = [232, 248, 240];
const BLUE_BG: Rgb = [232, 243, 255];
const BLUE_TXT: Rgb = [24, 95, 165];
const AMBER_BG: Rgb = [254, 249, 236];
const AMBER_TXT: Rgb = [180, 117, 23];
const RED_BG: Rgb = [253, 240, 238];
const RED_TXT: Rgb = [192, 57, 43];
const ORANGE_BG: Rgb = [255, 242, 238];
const ORANGE_TXT: Rgb = [180, 80, 30];
const LGREY: Rgb = [247, 251, 248];
const BORDER: Rgb = [220, 235, 225];
const TEXT1: Rgb = [13, 31, 16];
const TEXT2: Rgb = [107, 144, 112];
const TEXT3: Rgb = [160, 184, 165];

const CGPA_TIER_COLOR: Record<CgpaTier, Rgb> = {
  green: GREEN,
  'green-dark': GREEN_DARK,
  amber: AMBER_TXT,
  red: RED_TXT,
};
const GPA_TIER_COLOR: Record<GpaTier, Rgb> = { good: GREEN_DARK, mid: AMBER_TXT, low: RED_TXT };
const GPA_TIER_BG: Record<GpaTier, Rgb> = { good: GREEN_BG, mid: AMBER_BG, low: RED_BG };

function gradeColors(g: string): { bg: Rgb; txt: Rgb; border: Rgb } {
  if (!g) return { bg: LGREY, txt: TEXT2, border: BORDER };
  if (g.startsWith('A')) return { bg: GREEN_BG, txt: GREEN_DARK, border: [192, 232, 208] };
  if (g.startsWith('B')) return { bg: BLUE_BG, txt: BLUE_TXT, border: [192, 216, 240] };
  if (g.startsWith('C')) return { bg: AMBER_BG, txt: AMBER_TXT, border: [240, 221, 160] };
  if (g.startsWith('D')) return { bg: ORANGE_BG, txt: ORANGE_TXT, border: [240, 200, 184] };
  if (g === 'F' || g === 'F(NT)') return { bg: RED_BG, txt: RED_TXT, border: [240, 184, 176] };
  if (g === 'P') return { bg: GREEN_BG, txt: GREEN_DARK, border: [192, 232, 208] };
  return { bg: LGREY, txt: TEXT2, border: BORDER };
}

// The legacy inline Shohoj logo (base64 PNG); a green rounded rect stands in
// when addImage rejects it.
const LOGO_B64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAEUElEQVR42u2dX2hVdQDHv+fcid7rtWQT573lbd2rCQljD6PyoYFdnYGisEjWRChmLz0EEfkggRAWJNignoStIiz/BJHQIEuzRtCLD2NQpLLrHDrdMLXt6tXcdnoItt0/O9tdo3Z+v8/n6e7cc87u7vdzvr/zO+duffRP1J57wxP8Z/TUtznzsR+H0O2WwSF0u2VwCd8sys3IIXi728AlfLvbwCV8uyVwCd9uCVzCt1sCl/DtlsDlbbEbl6Pf7hZwCd9uCRgCGALAegGof3uHARqABgCbcah/GgAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAgklFUF7owJudynVfC8RrjaZTqt63kQYABAAEgIVMIH85NNd/UwOvfFXWNkueXKlHPto+p++XafxY3tj45JvmOEqebqUB/i/CiUqF62JlbXPvtyFdfukYh7wpQ0D80FYtbXi8rG1Gh7K68eEvpB7EaWApVu1Pl1x++1iPhr89r9Erw/K8/BHuz5O/asXrG0je5JPA5c21Snz6opKnWxU/0Fj0/OCBH0jelllAeENCqW925S278+MlkrdqGhgOK7oxOfFl4bDAOYAFVL/9nLJnM0XLRzp/19AHP+f7UhdT/NBWGsA0nEWhyRnB1az6d58oCl+Sct3XrJkyWiXA0oaaicf9rV/qwcCw75TxymtfI4BRw8CUO3Teg7EZ179//oaypy4ggM0MHuxCAFO43HJ8TttNvQ+AAAHlZvs5jQ6O+J8khlxVvfqUFq+tYhoYJPp2fqGaEy3Tr5DL6dbRbt99PLxj/cQl4uXNtZKkzKYO468ZBLsBclJvul1jf9zV3a6+aVfr3fa5726i6VTJ+wOm3PI1VoDebe0Tj6+/c6bkOpnNHb77CFVFfD+/F02nEGCh4jiT/xrX8zwNvf9T3vOXtn8mb9y/wn2HjoKpIwIsMJIF4Y18d1F9LxxR9tQFZTZ3aPzOX77bx/Zvmp1oIRcBFiSVYYVWRPIWjd2+p8GDXTMe+c6SCkWmXBm0lcCrXXO8ZW7t0fmywJDrAOXeuave20DyJgkQrotp8ZrKWa277Pl1im55guRNEkCSHj3cpEWxh3zXiTyT0Mq3niV1EwWQpMSRnYo8vbrkdDF+uEmxdxtJvADjPhEUe28LqdraAIAAgACAAIAAgACAAIAAgAD/llBVBAFs5rGjzXJcBwFsJvl9KwLYTurMHgSwnfgnTapYtcyYnyeQfyYOaABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAPhHgJ76Noe3wU566tscGoAhAKwXgGHAzvqnAQABEKCgEsCe+i9qACSwK3yGACgWgBaw5+iftgGQwI7wfYcAJDA//BnPAZDA7PBndRKIBOaGL0llhctfFDMn+DlNA2kDs8IvuwFoBDNCnzcBkCGYoU/lb7UbM654MK62AAAAAElFTkSuQmCC';

function drawLogo(doc: PdfDocLike, x: number, y: number, size: number): void {
  try {
    doc.addImage(LOGO_B64, 'PNG', x, y, size, size);
  } catch {
    doc.setFillColor(...GREEN);
    doc.roundedRect(x, y, size, size, size / 7.2, size / 7.2, 'F');
  }
}

/** Draw the report into `doc` and save it under the report's filename. */
export function drawPdfReport(doc: PdfDocLike, report: PdfReport): void {
  let y = ML;

  const setFill = (c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c: Rgb) => doc.setDrawColor(c[0], c[1], c[2]);
  const setTxt = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2]);

  const checkY = (needed = 20) => {
    if (y + needed > PH - 14) {
      doc.addPage();
      y = 14;
      setFill(GREEN);
      doc.rect(0, 0, PW, 1.5, 'F');
      doc.setFontSize(6.5);
      setTxt(TEXT3);
      doc.setFont('helvetica', 'normal');
      doc.text('Shohoj CGPA Report (continued)', ML, 8);
      doc.text('souravmondalshuvo.github.io/Shohoj', PW - MR, 8, { align: 'right' });
      y = 14;
    }
  };

  // ── Top rule + header ──────────────────────────────────────────────────
  setFill(GREEN);
  doc.rect(0, 0, PW, 1.5, 'F');
  drawLogo(doc, ML, y + 4, 18);

  doc.setFontSize(15);
  setTxt(TEXT1);
  doc.setFont('helvetica', 'bold');
  doc.text('CGPA Report', ML + 22, y + 10);
  doc.setFontSize(7.5);
  setTxt(TEXT2);
  doc.setFont('helvetica', 'normal');
  doc.text(report.deptLabel, ML + 22, y + 15);
  doc.setFontSize(7);
  setTxt(TEXT3);
  doc.text('BRAC University', ML + 22, y + 19.5);
  doc.setFontSize(6.5);
  setTxt(TEXT3);
  doc.text('Generated by Shohoj · souravmondalshuvo.github.io/Shohoj', ML + 22, y + 23);

  if (report.cgpaDisplay !== null && report.cgpaTier !== null) {
    const cgpaCol = CGPA_TIER_COLOR[report.cgpaTier];
    doc.setFontSize(30);
    doc.setFont('helvetica', 'bold');
    setTxt(cgpaCol);
    doc.text(report.cgpaDisplay, PW - MR, y + 14, { align: 'right' });
    doc.setFontSize(6.5);
    setTxt(TEXT3);
    doc.setFont('helvetica', 'normal');
    doc.text('CUMULATIVE GPA', PW - MR, y + 20, { align: 'right' });
  }
  y += 30;

  setStroke(GREEN);
  doc.setLineWidth(0.8);
  doc.line(ML, y, PW - MR, y);
  y += 6;

  // ── Stat band ──────────────────────────────────────────────────────────
  const stats: readonly (readonly [string, string])[] = [
    [report.stats.attempted, 'Credits Attempted'],
    [report.stats.earned, 'Credits Earned'],
    [report.stats.semesters, 'Semesters'],
    [report.stats.standing, 'Academic Standing'],
  ];
  const statW = CW / stats.length;
  setFill(LGREY);
  setStroke(BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, y, CW, 16, 2, 2, 'FD');
  stats.forEach((_, i) => {
    if (i === 0) return;
    doc.line(ML + i * statW, y + 2, ML + i * statW, y + 14);
  });
  stats.forEach(([val, label], i) => {
    const sx = ML + i * statW + statW / 2;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    setTxt(label === 'Academic Standing' ? GPA_TIER_COLOR[report.stats.standingTier] : TEXT1);
    doc.text(val, sx, y + 7.5, { align: 'center' });
    doc.setFontSize(6);
    setTxt(TEXT3);
    doc.setFont('helvetica', 'normal');
    doc.text(label.toUpperCase(), sx, y + 12.5, { align: 'center' });
  });
  y += 22;

  // ── Sections ───────────────────────────────────────────────────────────
  const COL = { name: ML, cr: ML + 118, gp: ML + 132, grade: ML + 136, note: ML + 164 };
  const BADGE_W = 26;

  for (const section of report.sections) {
    if (section.kind === 'summary') {
      checkY(18);
      setFill(LGREY);
      setStroke(BORDER);
      doc.setLineWidth(0.3);
      doc.roundedRect(ML, y, CW, 14, 1.5, 1.5, 'FD');
      setFill(GREEN);
      doc.roundedRect(ML, y, 3, 14, 1, 1, 'F');
      doc.rect(ML + 1.5, y, 1.5, 14, 'F');

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      setTxt(TEXT1);
      doc.text('Past Semesters Summary', ML + 6, y + 5.2);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      setTxt(TEXT2);
      doc.text(
        `CGPA ${section.cgpaDisplay}   ·   Earned ${section.earnedDisplay} cr   ·   Attempted ${section.attemptedDisplay} cr`,
        ML + 6,
        y + 10,
      );
      y += 19;
      continue;
    }

    drawSemester(section);
  }

  function drawSemester(section: PdfSemesterSection): void {
    checkY(24);

    const gCol = section.gpaTier !== null ? GPA_TIER_COLOR[section.gpaTier] : TEXT2;
    const gBg = section.gpaTier !== null ? GPA_TIER_BG[section.gpaTier] : LGREY;
    setFill(gBg);
    setStroke(BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, 8, 1.5, 1.5, 'FD');
    setFill(GREEN);
    doc.roundedRect(ML, y, 3, 8, 1, 1, 'F');
    doc.rect(ML + 1.5, y, 1.5, 8, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    setTxt(TEXT1);
    doc.text(section.name, ML + 6, y + 5.3);

    if (section.gpaDisplay !== null) {
      const pillW = 22;
      const pillH = 5;
      const pillX = PW - MR - pillW;
      setFill(gBg);
      setStroke(gCol);
      doc.roundedRect(pillX, y + 1.5, pillW, pillH, 1.5, 1.5, 'FD');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      setTxt(gCol);
      doc.text(`GPA  ${section.gpaDisplay}`, pillX + pillW / 2, y + 5, { align: 'center' });
    }
    y += 10;

    setFill([238, 245, 240]);
    doc.rect(ML, y, CW, 5, 'F');
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    setTxt(TEXT3);
    doc.text('COURSE', COL.name, y + 3.5);
    doc.text('CR', COL.cr, y + 3.5, { align: 'right' });
    doc.text('GP', COL.gp, y + 3.5, { align: 'right' });
    doc.text('GRADE', COL.grade + BADGE_W / 2, y + 3.5, { align: 'center' });
    doc.text('NOTE', COL.note, y + 3.5);
    y += 6;

    section.rows.forEach((row, i) => {
      checkY(8);
      if (i % 2 === 0) {
        setFill(LGREY);
        doc.rect(ML, y - 0.5, CW, 7, 'F');
      }
      setStroke([232, 240, 234]);
      doc.setLineWidth(0.2);
      doc.line(ML, y + 6.5, PW - MR, y + 6.5);

      doc.setFontSize(7);
      doc.setFont('helvetica', row.retaken ? 'italic' : 'normal');
      setTxt(row.retaken ? TEXT3 : TEXT1);
      doc.text(row.name, COL.name, y + 4.5);

      setTxt(TEXT2);
      doc.setFont('helvetica', 'normal');
      doc.text(row.creditsDisplay, COL.cr, y + 4.5, { align: 'right' });
      doc.text(row.gpDisplay, COL.gp, y + 4.5, { align: 'right' });

      if (row.grade) {
        const { bg, txt, border } = gradeColors(row.grade);
        setFill(bg);
        setStroke(border);
        doc.setLineWidth(0.3);
        doc.roundedRect(COL.grade, y + 0.5, BADGE_W, 5.5, 1.5, 1.5, 'FD');
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        setTxt(txt);
        doc.text(row.grade, COL.grade + BADGE_W / 2, y + 4.3, { align: 'center' });
      }

      if (row.note) {
        doc.setFontSize(6);
        setTxt(TEXT3);
        doc.setFont('helvetica', 'normal');
        doc.text(row.note, COL.note, y + 4.5);
      }
      y += 7;
    });

    if (section.footer !== null) {
      checkY(8);
      setFill([238, 248, 241]);
      doc.rect(ML, y, CW, 6, 'F');
      setStroke(BORDER);
      doc.setLineWidth(0.15);
      doc.line(ML, y, PW - MR, y);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      setTxt(TEXT3);
      doc.text(section.footer, ML + CW / 2, y + 4, { align: 'center' });
      y += 6;
    }

    y += 5;
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  const footerY = PH - 10;
  setStroke(BORDER);
  doc.setLineWidth(0.4);
  doc.line(ML, footerY, PW - MR, footerY);
  setFill(LGREY);
  doc.rect(0, footerY, PW, 10, 'F');
  drawLogo(doc, ML, footerY + 1.5, 7);
  doc.setFontSize(6.5);
  setTxt(TEXT3);
  doc.setFont('helvetica', 'normal');
  doc.text('Generated by Shohoj · BRAC University CGPA Calculator', ML + 10, footerY + 6.5);
  doc.text(report.dateDisplay, PW - MR, footerY + 6.5, { align: 'right' });

  doc.save(report.filename);
}
