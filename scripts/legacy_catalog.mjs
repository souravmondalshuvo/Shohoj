// scripts/legacy_catalog.mjs (#810)
//
// Maps one campus's records in data/campuses/ to the shapes the legacy bundle
// reads: COURSE_DB / ALL_COURSES / PREREQS / PREFIX_DEPT_MAP / DEPT_META
// (js/core/catalog.js) and DEPARTMENTS (js/core/departments.js).
//
// Both campuses' are built by this one function, and
// scripts/generate_legacy_catalog.mjs writes its output into the bundle.
// BRACU's were hand-written until #869; the mapping was accepted because, run
// on BRACU's records, it reproduced those literals exactly, key order included.
//
// It states only what the data states:
//   - a course with no published title is not in the catalogue (the legacy
//     shape needs a name); its code is listed under `untitled` instead;
//   - a plan slot with no course code ("CSE specialized elective 1") keeps its
//     title and gets no code;
//   - a prerequisite is included only when the legacy shape — a flat list of
//     required courses — says all of it. A rule with alternatives, a credit or
//     CGPA threshold, instructor consent, or different answers for different
//     programs is left out and listed under `unexpressed`, because a partial
//     rule would tell a student they are clear to take a course they are not.

const byCode = (a, b) => a.code.localeCompare(b.code);

/**
 * The flat required-course list a rule states — empty for one that only
 * recommends courses — or null if it states more than a list can hold.
 */
function flatRequirement(rule) {
  if (rule.anyOf || rule.minCredits || rule.minCgpa || rule.orConsent || rule.unparsed) return null;
  if ((rule.allOf ?? []).some((group) => group.length !== 1)) return null;
  return (rule.allOf ?? []).map((group) => group[0]);
}

/**
 * @param campus one entry of loadCampuses().campuses
 * @param options.courseSources / options.prerequisiteSources restrict the
 *   records to those citing one of these sources. BRACU's database also holds
 *   courses and rules read off the CONNECT feed, which its literals never had.
 */
export function buildLegacyCatalog(campus, options = {}) {
  const fromSource = (allowed) => (record, fileSource) =>
    !allowed || allowed.includes(record.source ?? fileSource);

  // ── Catalogue ─────────────────────────────────────────────────────────────
  const wantCourse = fromSource(options.courseSources);
  const courses = {};
  const untitled = [];
  for (const c of campus.courses?.records ?? []) {
    if (!wantCourse(c, campus.courses.source)) continue;
    if (c.title === null) {
      untitled.push(c.code);
      continue;
    }
    courses[c.code] = {
      code: c.code,
      name: c.title,
      credits: c.credits,
      full: `${c.title} (${c.code})`,
    };
  }

  // ── Prerequisites ─────────────────────────────────────────────────────────
  const wantRule = fromSource(options.prerequisiteSources);
  const rulesByCourse = new Map();
  for (const r of campus.prerequisites?.records ?? []) {
    if (!wantRule(r, campus.prerequisites.source)) continue;
    if (!rulesByCourse.has(r.course)) rulesByCourse.set(r.course, []);
    rulesByCourse.get(r.course).push(r);
  }
  const prerequisites = {};
  const unexpressed = [];
  for (const [course, rules] of rulesByCourse) {
    const flats = rules.map(flatRequirement);
    const key = (list) => JSON.stringify([...list].sort());
    // Every record for the course — one per program or source — must say the
    // same thing, or there is no single answer to give.
    if (flats.some((f) => f === null) || flats.some((f) => key(f) !== key(flats[0]))) {
      unexpressed.push(course);
      continue;
    }
    const recommended = rules.find((r) => r.recommended)?.recommended;
    prerequisites[course] = {
      ...(flats[0].length ? { hp: flats[0] } : {}),
      ...(recommended ? { sp: recommended } : {}),
    };
  }

  // ── Departments (which subject prefixes a department owns) ───────────────
  const prefixDepartments = {};
  const departmentMeta = {};
  // The order departments are listed in is the order their tiles are shown in.
  const departmentOrder = (campus.departments?.records ?? []).map((d) => d.code);
  // Single courses owned by a department other than their subject's.
  const departmentOverrides = Object.fromEntries(
    (campus.departments?.overrides ?? []).map((o) => [o.course, o.department]),
  );
  for (const d of campus.departments?.records ?? []) {
    for (const prefix of d.prefixes) prefixDepartments[prefix] = d.code;
    departmentMeta[d.code] = {
      label: d.label,
      ...(d.displayCode ? { displayCode: d.displayCode } : {}),
      school: d.school,
    };
  }

  // ── Programs and their semester-by-semester presets ──────────────────────
  const seasonsOf = Object.fromEntries(
    campus.profile.termSystems.records.map((t) => [t.id, t.terms.map((x) => x.season)]),
  );
  const programs = {};
  for (const prog of campus.programs?.records ?? []) {
    const items = (campus.plans?.records ?? []).filter((x) => x.program === prog.code);
    const terms = [...new Set(items.map((x) => x.term))].sort((a, b) => a - b);
    programs[prog.code] = {
      label: prog.name,
      totalCredits: prog.totalCredits,
      seasons: seasonsOf[prog.termSystem],
      presets: terms.map((t) => {
        const inTerm = items.filter((x) => x.term === t);
        return {
          name: inTerm[0].termLabel ?? `Semester ${t}`,
          courses: inTerm.map((x) => ({
            name: x.code ? `${x.title} (${x.code})` : x.title,
            credits: x.credits,
            grade: '',
          })),
        };
      }),
    };
  }

  return {
    courses,
    allCourses: Object.values(courses).sort(byCode),
    prerequisites,
    prefixDepartments,
    departmentMeta,
    departmentOrder,
    departmentOverrides,
    programs,
    untitled: untitled.sort(),
    unexpressed: unexpressed.sort(),
  };
}

/**
 * The records that make up BRACU's calculator catalogue: the ones its
 * hand-written literals were exported from, before the code was generated from
 * them. Courses and rules only a CONNECT snapshot names are left out.
 */
export const BRACU_LITERAL_SOURCES = {
  courseSources: ['bracu-catalog', 'bracu-departments'],
  prerequisiteSources: ['bracu-catalog'],
};
