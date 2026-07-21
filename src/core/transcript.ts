import type { StudentIdentity, TranscriptParseResult, TranscriptSemester } from './types';

export const DEPARTMENT_LABELS = {
  CSE: 'B.Sc. in Computer Science and Engineering (CSE)',
  EEE: 'BSc EEE \u2014 Electrical & Electronic Engineering',
  BBA: 'Bachelor of Business Administration (BBA)',
  ECO: 'B.S.S. in Economics (ECO)',
  ENG: 'B.A. in English (ENG)',
  ARC: 'B.Arch. in Architecture (ARC)',
  PHR: 'B.Sc. in Pharmacy (PHR)',
  LAW: 'Bachelor of Laws (LLB)',
  CS: 'B.Sc. in Computer Science (CS)',
  ECE: 'B.Sc. in Electronic & Communication Engineering (ECE)',
  ANT: 'B.S.S. in Anthropology (ANT)',
  PHY: 'B.Sc. in Physics (PHY)',
  APE: 'B.Sc. in Applied Physics & Electronics (APE)',
  MAT: 'B.Sc. in Mathematics (MAT)',
  MIC: 'B.Sc. in Microbiology (MIC)',
  BIO: 'B.Sc. in Biotechnology (BIO)',
} as const;

type DepartmentLabel = (typeof DEPARTMENT_LABELS)[keyof typeof DEPARTMENT_LABELS];
type Detector = readonly [DepartmentLabel, RegExp];

const PROGRAM_DETECTORS: readonly Detector[] = [
  [DEPARTMENT_LABELS.CSE, /COMPUTER\s+SCIENCE\s+AND\s+ENGINEERING|\bCSE\b/i],
  [DEPARTMENT_LABELS.CS, /COMPUTER\s+SCIENCE(?!\s+AND\s+ENGINEERING)|\bCS\b/i],
  [
    DEPARTMENT_LABELS.EEE,
    /ELECTRICAL\s*(?:&|AND)\s*ELECTRONIC\s+ENGINEERING|\bBSC\s*EEE\b|\bEEE\b/i,
  ],
  [DEPARTMENT_LABELS.ECE, /ELECTRONIC\s*(?:&|AND)\s*COMMUNICATION\s+ENGINEERING|\bECE\b/i],
  [DEPARTMENT_LABELS.BBA, /BUSINESS\s+ADMINISTRATION|\bBBA\b/i],
  [DEPARTMENT_LABELS.ECO, /ECONOMICS|\bECO\b/i],
  [DEPARTMENT_LABELS.ENG, /ENGLISH|\bENG\b/i],
  [DEPARTMENT_LABELS.ARC, /ARCHITECTURE|\bARCH\b|\bARC\b/i],
  [DEPARTMENT_LABELS.PHR, /PHARMACY|\bPHR\b/i],
  [DEPARTMENT_LABELS.LAW, /BACHELOR\s+OF\s+LAWS|\bLL\.?B\b|\bLAW\b/i],
  [DEPARTMENT_LABELS.ANT, /ANTHROPOLOGY|\bANT\b/i],
  [DEPARTMENT_LABELS.APE, /APPLIED\s+PHYSICS\s*(?:&|AND)\s*ELECTRONICS|\bAPE\b/i],
  [DEPARTMENT_LABELS.PHY, /PHYSICS(?!\s*(?:&|AND)\s*ELECTRONICS)|\bPHY\b/i],
  [DEPARTMENT_LABELS.MAT, /MATHEMATICS|\bMAT\b/i],
  [DEPARTMENT_LABELS.MIC, /MICROBIOLOGY|\bMIC\b/i],
  [DEPARTMENT_LABELS.BIO, /BIOTECHNOLOGY|\bBIO\b/i],
];

const TEXT_DETECTORS: readonly Detector[] = [
  [
    DEPARTMENT_LABELS.CSE,
    /\bB\.?\s*SC\.?\s+IN\s+COMPUTER\s+SCIENCE\s+AND\s+ENGINEERING\b|COMPUTER\s+SCIENCE\s+AND\s+ENGINEERING|\bCSE\b/i,
  ],
  [DEPARTMENT_LABELS.EEE, /\bBSC\s*EEE\b|\bELECTRICAL\s*(?:&|AND)\s*ELECTRONIC\s+ENGINEERING\b/i],
  [DEPARTMENT_LABELS.BBA, /\bBACHELOR\s+OF\s+BUSINESS\s+ADMINISTRATION\b|\bBBA\b/i],
  [
    DEPARTMENT_LABELS.ECO,
    /\bB\.?\s*S\.?\s*S\.?\s+IN\s+ECONOMICS\b|\bSOCIAL\s+SCIENCE.*ECONOMICS\b/i,
  ],
  [
    DEPARTMENT_LABELS.ENG,
    /\bB\.?\s*A\.?\s+IN\s+ENGLISH\b|\bBACHELOR\s+OF\s+ARTS\s+IN\s+ENGLISH\b/i,
  ],
  [DEPARTMENT_LABELS.ARC, /\bB\.?\s*ARCH\.?\b|\bBACHELOR\s+OF\s+ARCHITECTURE\b/i],
  [
    DEPARTMENT_LABELS.PHR,
    /\bB\.?\s*SC\.?\s+IN\s+PHARMACY\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+PHARMACY\b/i,
  ],
  [DEPARTMENT_LABELS.LAW, /\bBACHELOR\s+OF\s+LAWS\b|\bLL\.?B\b/i],
  [
    DEPARTMENT_LABELS.CS,
    /\bB\.?\s*SC\.?\s+IN\s+COMPUTER\s+SCIENCE\b(?!\s+AND\s+ENGINEERING)|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+COMPUTER\s+SCIENCE\b(?!\s+AND\s+ENGINEERING)/i,
  ],
  [
    DEPARTMENT_LABELS.ECE,
    /\bB\.?\s*SC\.?\s+IN\s+ELECTRONIC\s*(?:&|AND)\s*COMMUNICATION\s+ENGINEERING\b|\bELECTRONIC\s*(?:&|AND)\s*COMMUNICATION\s+ENGINEERING\b/i,
  ],
  [
    DEPARTMENT_LABELS.ANT,
    /\bB\.?\s*S\.?\s*S\.?\s+IN\s+ANTHROPOLOGY\b|\bBACHELOR\s+OF\s+SOCIAL\s+SCIENCE\s+IN\s+ANTHROPOLOGY\b/i,
  ],
  [
    DEPARTMENT_LABELS.APE,
    /\bB\.?\s*SC\.?\s+IN\s+APPLIED\s+PHYSICS\s*(?:&|AND)\s*ELECTRONICS\b|\bAPPLIED\s+PHYSICS\s*(?:&|AND)\s*ELECTRONICS\b/i,
  ],
  [
    DEPARTMENT_LABELS.PHY,
    /\bB\.?\s*SC\.?\s+IN\s+PHYSICS\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+PHYSICS\b/i,
  ],
  [
    DEPARTMENT_LABELS.MAT,
    /\bB\.?\s*SC\.?\s+IN\s+MATHEMATICS\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+MATHEMATICS\b/i,
  ],
  [
    DEPARTMENT_LABELS.MIC,
    /\bB\.?\s*SC\.?\s+IN\s+MICROBIOLOGY\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+MICROBIOLOGY\b/i,
  ],
  [
    DEPARTMENT_LABELS.BIO,
    /\bB\.?\s*SC\.?\s+IN\s+BIOTECHNOLOGY\b|\bBACHELOR\s+OF\s+SCIENCE\s+IN\s+BIOTECHNOLOGY\b/i,
  ],
];

interface SemesterMarker {
  name: string;
  idx: number;
}

interface WorkingSemester {
  name: string;
  codes: string[];
  titles: string[];
}

const SEASON_NAMES: Record<string, string> = {
  SPRING: 'Spring',
  SUMMER: 'Summer',
  FALL: 'Fall',
};

export function detectDepartment(text: string): string | null {
  const compact = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return null;

  const programMatch = compact.match(
    /PROGRAM:\s*(.+?)(?=SEMESTER:|COURSE\s+NO|COURSE\s+TITLE|CREDITS\s+EARNED|GRADE\s+POINTS|GRADE\s+SHEET|STUDENT\s+ID|NAME\b|$)/i,
  );
  const programText = programMatch ? programMatch[1].trim() : '';

  if (programText) {
    for (const [label, pattern] of PROGRAM_DETECTORS) {
      if (pattern.test(programText)) return label;
    }
  }

  for (const [label, pattern] of TEXT_DETECTORS) {
    if (pattern.test(compact)) return label;
  }

  return null;
}

/**
 * Pull the Student ID and Name out of a BRACU grade sheet's header. Best-effort:
 * a header layout the regexes don't recognise yields null rather than a wrong
 * guess, and the Name capture stops at the next known label so it can't swallow
 * the rest of the sheet. The ID is the standard 7–8 digit BRACU student number.
 */
export function detectStudentIdentity(text: string): StudentIdentity {
  const compact = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  let studentId: string | null = null;
  let studentName: string | null = null;

  if (compact) {
    const idMatch =
      compact.match(/STUDENT\s*ID\s*:?\s*(\d{7,8})\b/i) || compact.match(/\bID\s*:?\s*(\d{8})\b/i);
    if (idMatch) studentId = idMatch[1];

    const nameMatch = compact.match(
      /\bNAME\s*:?\s*([A-Za-z][A-Za-z.\s'-]{1,58}?)\s*(?=\b(?:PROGRAM|STUDENT\s*ID|SEMESTER|ID|DATE|GRADE\s+SHEET|COURSE|CREDITS|UNDERGRADUATE|UNDERGRAD|POSTGRADUATE|GRADUATE)\b|$)/i,
    );
    if (nameMatch) {
      const cleaned = nameMatch[1].replace(/\s+/g, ' ').trim();
      if (cleaned && !/^\d+$/.test(cleaned)) studentName = cleaned;
    }
  }

  return { studentId, studentName };
}

export function normalizeTranscriptLine(line: string): string {
  let normalized = String(line || '')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!normalized) return '';

  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.replace(/^(SEMESTER|PROGRAM)\s*:\s*/i, '$1: ');
  normalized = normalized.replace(/\b(SPRING|SUMMER|FALL)(\d{4})\b/gi, '$1 $2');
  normalized = normalized.replace(/^([A-Z]{2,4}\d{3}[A-Z]?)(?=[A-Z])/, '$1 ');
  normalized = normalized.replace(/([A-Za-z)])(?=\d+\.\d+)/g, '$1 ');
  normalized = normalized.replace(/(\d+\.\d+)(?=F\s*\(\s*NT\s*\)|[A-Z][+-]?)/g, '$1 ');
  normalized = normalized.replace(/(F\s*\(\s*NT\s*\)|[A-Z][+-]?)(?=\d+\.\d+)/g, '$1 ');
  normalized = normalized.replace(/F\s*\(\s*NT\s*\)/gi, 'F(NT)');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

export function normalizeTranscriptText(text: string): string {
  return String(text || '')
    .split(/\r?\n/)
    .map(normalizeTranscriptLine)
    .join('\n');
}

export function parseSemesterName(name: string): { season: string; year: number } | null {
  const match = name.match(/(Spring|Summer|Fall)\s+(\d{4})/);
  if (!match) return null;
  return { season: match[1], year: Number.parseInt(match[2], 10) };
}

function normalizeGradeToken(raw: string): string {
  let grade = raw.trim().replace(/\s+/g, '');
  if (/F.*NT/i.test(raw)) return 'F(NT)';
  grade = grade.replace('(RT)', '').replace('(NT)', '').trim();
  return grade;
}

export function parseBlobFallback(text: string): TranscriptParseResult {
  const normalizedText = normalizeTranscriptText(text);
  const blob = normalizedText.replace(/\s+/g, ' ');
  const semRe = /SEMESTER[:\s]+([A-Z]+)\s*(\d{4})/gi;
  const semMatches: SemesterMarker[] = [];
  let semMatch: RegExpExecArray | null;

  while ((semMatch = semRe.exec(blob)) !== null) {
    const season = semMatch[1].toUpperCase();
    const year = semMatch[2];
    semMatches.push({
      name: `${SEASON_NAMES[season] || semMatch[1]} ${year}`,
      idx: semMatch.index,
    });
  }

  if (!semMatches.length) return { semesters: [], detectedDept: null };

  const courseRe =
    /\b([A-Z]{2,4}\d{3}[A-Z]?)\b(.{1,120}?)\b(\d+\.\d+)\s+((?:[A-Z][+-]?)(?:\((?:NT|RT)\))|[A-Z][+-]?)\s+(\d+\.\d+)/g;
  const semesters = semMatches
    .map((semester, index): TranscriptSemester => {
      const sliceEnd = index + 1 < semMatches.length ? semMatches[index + 1].idx : blob.length;
      const slice = blob.slice(semester.idx, sliceEnd);
      const courses: TranscriptSemester['courses'] = [];
      let courseMatch: RegExpExecArray | null;

      while ((courseMatch = courseRe.exec(slice)) !== null) {
        const code = courseMatch[1];
        const title = (courseMatch[2] || '').trim().replace(/\s{2,}/g, ' ');
        const credits = Number.parseFloat(courseMatch[3]);
        const grade = courseMatch[4].replace(/\(RT\)/, '').trim();
        const gradePoint = Number.parseFloat(courseMatch[5]);

        if (!Number.isNaN(credits) && credits > 0) {
          courses.push({
            name: `${code} ${title}`.trim(),
            credits,
            grade,
            gradePoint,
          });
        }
      }

      courseRe.lastIndex = 0;
      return { id: Date.now() + index, name: semester.name, courses, running: false };
    })
    .filter((semester) => semester.courses.length > 0);

  return { semesters, detectedDept: detectDepartment(normalizedText) };
}

export function parseTranscriptText(text: string): TranscriptParseResult {
  const normalizedText = normalizeTranscriptText(text);
  const lines = normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const detectedDept = detectDepartment(normalizedText);

  const semRe = /^SEMESTER:\s*([A-Z]+)\s*(\d{4})\b/i;
  const codeRe = /^([A-Z]{2,4}\d{3}[A-Z]?)$/;
  const codeStartRe = /^([A-Z]{2,4}\d{3}[A-Z]?)(?:\s*(?:\d|\.\d))/;
  const numberRe = /^\d+\.\d+$/;
  const gradeRe = /^([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)$/;
  const skipRe =
    /^(SEMESTER\b(?!:)|CUMULATIVE\s+Credits|Credits\s+(Attempted|Earned)|GPA$|CGPA$|BRAC\s+University|Kha\s+224|Merul|GRADE\s+SHEET|UNOFFICIAL|Student\s+ID|^Name$|Course\s+No|Course\s+Title|UNDERGRADUATE|PROGRAM:|Page\s+\d|Credits\s+Earned\s+Grade|Grade\s+Points)/i;

  const workingSemesters: WorkingSemester[] = [];
  let currentSemester: WorkingSemester | null = null;
  let lastExtText: string | null = null;
  let lastExtIndex = -1;
  let lastExtOrigLen = 0;

  for (const line of lines) {
    if (skipRe.test(line)) continue;
    if (numberRe.test(line)) continue;
    if (gradeRe.test(line)) continue;

    const semesterMatch = line.match(semRe);
    if (semesterMatch) {
      const season = semesterMatch[1].toUpperCase();
      currentSemester = {
        name: `${SEASON_NAMES[season] || semesterMatch[1]} ${semesterMatch[2]}`,
        codes: [],
        titles: [],
      };
      workingSemesters.push(currentSemester);
      lastExtText = null;
      lastExtIndex = -1;
      continue;
    }

    if (!currentSemester) continue;

    const codeMatch = line.match(codeRe);
    if (codeMatch) {
      currentSemester.codes.push(codeMatch[1]);
      lastExtText = null;
      lastExtIndex = -1;
      continue;
    }

    const compactCodeMatch = line.match(codeStartRe);
    if (compactCodeMatch) {
      currentSemester.codes.push(compactCodeMatch[1]);
      if (
        lastExtText !== null &&
        lastExtIndex >= 0 &&
        lastExtIndex < currentSemester.titles.length
      ) {
        currentSemester.titles[lastExtIndex] = currentSemester.titles[lastExtIndex].substring(
          0,
          lastExtOrigLen,
        );
        currentSemester.titles.push(lastExtText);
      }
      lastExtText = null;
      lastExtIndex = -1;
      continue;
    }

    if (!line[0].match(/\d/)) {
      if (currentSemester.titles.length < currentSemester.codes.length) {
        currentSemester.titles.push(line);
        lastExtText = null;
        lastExtIndex = -1;
      } else if (currentSemester.titles.length > 0) {
        lastExtOrigLen = currentSemester.titles[currentSemester.titles.length - 1].length;
        lastExtText = line;
        lastExtIndex = currentSemester.titles.length - 1;
        currentSemester.titles[currentSemester.titles.length - 1] += ` ${line}`;
      }
    }
  }

  const semesterCourseCounts = workingSemesters.map((semester) => semester.codes.length);
  const totalCourses = semesterCourseCounts.reduce((sum, count) => sum + count, 0);
  if (totalCourses === 0) return legacyParseTranscript(lines, detectedDept);

  let creditsBlockStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!/^Credits\s+Earned\b/i.test(lines[i])) continue;

    for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
      if (numberRe.test(lines[j])) {
        creditsBlockStart = j;
        break;
      }
    }

    if (creditsBlockStart >= 0) break;
  }

  if (creditsBlockStart < 0) return legacyParseTranscript(lines, detectedDept);

  const creditsRaw: number[] = [];
  const gradesRaw: string[] = [];
  const gpRaw: number[] = [];
  let phase: 'credits' | 'grades' | 'gp' = 'credits';

  for (let i = creditsBlockStart; i < lines.length; i++) {
    const line = lines[i];
    if (line === 'GPA' || line === 'CGPA') continue;

    if (phase === 'credits') {
      if (numberRe.test(line)) {
        creditsRaw.push(Number.parseFloat(line));
        continue;
      }
      if (gradeRe.test(line)) phase = 'grades';
    }

    if (phase === 'grades') {
      if (numberRe.test(line)) {
        phase = 'gp';
        gpRaw.push(Number.parseFloat(line));
        continue;
      }
      if (gradeRe.test(line)) {
        gradesRaw.push(normalizeGradeToken(line));
        continue;
      }
    }

    if (phase === 'gp' && numberRe.test(line)) {
      gpRaw.push(Number.parseFloat(line));
    }
  }

  const allCredits = extractCourseValues(creditsRaw, semesterCourseCounts);
  const allGradePoints = extractCourseValues(gpRaw, semesterCourseCounts);
  const allGrades = gradesRaw;

  const semesters: TranscriptSemester[] = [];
  let flatIndex = 0;

  for (const semester of workingSemesters) {
    const courses: TranscriptSemester['courses'] = [];

    for (let index = 0; index < semester.codes.length; index++) {
      const code = semester.codes[index];
      const title = semester.titles[index] || '';
      const name = title ? `${title} (${code})` : code;
      const credits = allCredits[flatIndex] ?? 0;
      const grade = allGrades[flatIndex] ?? '';
      const gradePoint = allGradePoints[flatIndex] ?? '';

      courses.push({ name, credits, grade, gradePoint });
      flatIndex++;
    }

    if (courses.length > 0) {
      semesters.push({
        id: Date.now() + semesters.length,
        name: semester.name,
        courses,
        running: false,
      });
    }
  }

  if (semesters.length === 0) return legacyParseTranscript(lines, detectedDept);
  return { semesters, detectedDept };
}

function extractCourseValues(raw: readonly number[], counts: readonly number[]): (number | null)[] {
  const out: (number | null)[] = [];
  let position = 0;

  for (const count of counts) {
    for (let index = 0; index < count; index++) {
      out.push(raw[position] !== undefined ? raw[position] : null);
      position++;
    }
    position += 2;
  }

  return out;
}

function legacyParseTranscript(
  lines: readonly string[],
  detectedDept: string | null,
): TranscriptParseResult {
  const semRe = /^SEMESTER[:\s]*([A-Z]+)\s*(\d{4})\b/i;
  const skipRe =
    /^(SEMESTER|CUMULATIVE)\s+Credits|^(Credits Attempted|Credits Earned|GPA|CGPA)|^(BRAC University|Grade Sheet|Student|Name|Program|Course No)|^Page \d/i;
  const fntRe = /F\s*\(NT\)/;
  const courseRe =
    /^([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?(?:\s*\(RT\))?)\s+([\d]+\.[\d]+)$/;
  const codeOnlyRe =
    /^([A-Z]{2,4}\d{3}[A-Z]?)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)\s+([\d]+\.[\d]+)$/;
  const codeMarkerRe = /^([A-Z]{2,4}\d{3}[A-Z]?)$/;
  const codeOnlyCompactRe =
    /^([A-Z]{2,4}\d{3}[A-Z]?)\s*([\d]+\.[\d]+)\s*([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)\s*([\d]+\.[\d]+)$/;
  const partialRe = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+)$/;
  const contRe =
    /^([A-Za-z][A-Za-z\s&:,()\-.]*?)\s+([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?)\s+([\d]+\.[\d]+)$/;
  const creditsGradeGpOnlyRe =
    /^([\d]+\.[\d]+)\s+([A-Z][+-]?(?:\s*\((?:NT|RT)\))?(?:\s*\(RT\))?)\s+([\d]+\.[\d]+)$/;

  const semesters: TranscriptSemester[] = [];
  let currentSemester: TranscriptSemester | null = null;
  let pendingTitle: string | null = null;
  let skipNextFragment = false;

  for (const line of lines) {
    if (skipRe.test(line)) {
      pendingTitle = null;
      skipNextFragment = false;
      continue;
    }

    const semesterMatch = line.match(semRe);
    if (semesterMatch) {
      const season = semesterMatch[1].toUpperCase();
      currentSemester = {
        id: Date.now() + semesters.length,
        name: `${SEASON_NAMES[season] || semesterMatch[1]} ${semesterMatch[2]}`,
        courses: [],
        running: false,
      };
      semesters.push(currentSemester);
      pendingTitle = null;
      skipNextFragment = false;
      continue;
    }

    if (!currentSemester) continue;

    if (skipNextFragment) {
      skipNextFragment = false;
      if (/^[A-Z][A-Z\s&:,()\-.]+$/.test(line)) continue;
    }

    const codeMarker = line.match(codeMarkerRe);
    if (codeMarker) {
      pendingTitle = line;
      continue;
    }

    if (fntRe.test(line)) {
      const code = line.trim().split(/\s+/)[0];
      if (/^[A-Z]{2,4}\d{3}[A-Z]?$/.test(code)) {
        const creditMatch = line.match(/\b(\d+\.\d+)\b/);
        currentSemester.courses.push({
          name: code,
          credits: creditMatch ? Number.parseFloat(creditMatch[1]) : 0,
          grade: 'F(NT)',
          gradePoint: 'NT',
        });
        pendingTitle = null;
        continue;
      }
    }

    if (pendingTitle) {
      const creditsGradeGp = line.match(creditsGradeGpOnlyRe);
      if (creditsGradeGp) {
        const code =
          (pendingTitle.match(codeMarkerRe) ||
            pendingTitle.match(/^([A-Z]{2,4}\d{3}[A-Z]?)/) ||
            [])[1] || '';
        const title = pendingTitle.replace(/^[A-Z]{2,4}\d{3}[A-Z]?\s*/, '').trim();

        currentSemester.courses.push({
          name: title ? `${title} (${code})` : code,
          credits: Number.parseFloat(creditsGradeGp[1]),
          grade: normalizeGradeToken(creditsGradeGp[2]),
          gradePoint: Number.parseFloat(creditsGradeGp[3]),
        });
        pendingTitle = null;
        continue;
      }

      const continuation = line.match(contRe);
      if (continuation) {
        const fullLine = `${pendingTitle} ${line}`;
        const fullCourse = fullLine.match(courseRe);
        if (fullCourse) {
          currentSemester.courses.push({
            name: `${fullCourse[1]} ${fullCourse[2].trim()}`,
            credits: Number.parseFloat(fullCourse[3]),
            grade: normalizeGradeToken(fullCourse[4]),
            gradePoint: Number.parseFloat(fullCourse[5]),
          });
          pendingTitle = null;
          continue;
        }

        const code = (pendingTitle.match(/^([A-Z]{2,4}\d{3}[A-Z]?)/) || [])[1] || pendingTitle;
        const titlePrefix = pendingTitle.replace(/^[A-Z]{2,4}\d{3}[A-Z]?\s*/, '').trim();
        currentSemester.courses.push({
          name: `${`${titlePrefix} ${continuation[1].trim()}`.trim()} (${code})`,
          credits: Number.parseFloat(continuation[2]),
          grade: normalizeGradeToken(continuation[3]),
          gradePoint: Number.parseFloat(continuation[4]),
        });
        pendingTitle = null;
        continue;
      }
    }

    const codeOnly = line.match(codeOnlyRe);
    if (codeOnly) {
      const title = pendingTitle
        ? pendingTitle.replace(/^[A-Z]{2,4}\d{3}[A-Z]?\s*/, '').trim()
        : '';
      currentSemester.courses.push({
        name: title ? `${title} (${codeOnly[1]})` : codeOnly[1],
        credits: Number.parseFloat(codeOnly[2]),
        grade: normalizeGradeToken(codeOnly[3]),
        gradePoint: Number.parseFloat(codeOnly[4]),
      });
      pendingTitle = null;
      skipNextFragment = true;
      continue;
    }

    const compactCodeOnly = line.match(codeOnlyCompactRe);
    if (compactCodeOnly) {
      const title = pendingTitle
        ? pendingTitle.replace(/^[A-Z]{2,4}\d{3}[A-Z]?\s*/, '').trim()
        : '';
      currentSemester.courses.push({
        name: title ? `${title} (${compactCodeOnly[1]})` : compactCodeOnly[1],
        credits: Number.parseFloat(compactCodeOnly[2]),
        grade: normalizeGradeToken(compactCodeOnly[3]),
        gradePoint: Number.parseFloat(compactCodeOnly[4]),
      });
      pendingTitle = null;
      skipNextFragment = true;
      continue;
    }

    const course = line.match(courseRe);
    if (course) {
      currentSemester.courses.push({
        name: `${course[1]} ${course[2].trim()}`,
        credits: Number.parseFloat(course[3]),
        grade: normalizeGradeToken(course[4]),
        gradePoint: Number.parseFloat(course[5]),
      });
      pendingTitle = null;
      continue;
    }

    const partial = line.match(partialRe);
    if (partial && !/\d+\.\d+\s*$/.test(line)) {
      pendingTitle = line;
      continue;
    }

    if (
      !line[0].match(/\d/) &&
      line.length > 2 &&
      line.length < 100 &&
      !/^[A-Z]{2,4}\d{3}/.test(line)
    ) {
      pendingTitle = `${pendingTitle ? `${pendingTitle} ` : ''}${line}`;
    } else {
      pendingTitle = null;
    }
  }

  return { semesters: semesters.filter((semester) => semester.courses.length > 0), detectedDept };
}
