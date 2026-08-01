// Generated from src/core/gpa.ts for the vanilla JS runtime.
// Update src/core/gpa.ts first, then regenerate this file.
import { GRADES } from './grades.js';
const GPA_SEASON_ORDER = ['Spring', 'Summer', 'Fall'];
function isGradeLetter(grade) {
    return Object.prototype.hasOwnProperty.call(GRADES, grade);
}
function gradePointFor(grade) {
    return isGradeLetter(grade) ? GRADES[grade] : undefined;
}
function gpaCoreCalcSemesterGpaImpl(semester) {
    let points = 0;
    let credits = 0;
    for (const course of semester.courses) {
        const gp = gradePointFor(course.grade);
        if (gp === undefined || !course.credits)
            continue;
        if (course.grade === 'P' || course.grade === 'I')
            continue;
        if (course.grade === 'F(NT)') {
            credits += course.credits;
            continue;
        }
        if (gp === null)
            continue;
        points += gp * course.credits;
        credits += course.credits;
    }
    return credits > 0 ? points / credits : null;
}
function gpaCoreUsesBestGradePolicyImpl(options = {}) {
    const season = options.startSeason || 'Fall';
    const year = typeof options.startYear === 'number'
        ? options.startYear
        : Number.parseInt(options.startYear || '2024', 10);
    if (!season || Number.isNaN(year))
        return false;
    const seasonIndex = GPA_SEASON_ORDER.indexOf(season);
    if (year < 2024)
        return true;
    if (year === 2024 && seasonIndex === 0)
        return true;
    if (year === 2024 && seasonIndex === 1)
        return true;
    if (year === 2024 && seasonIndex === 2)
        return false;
    return false;
}
export function getCourseCode(courseName) {
    const match = courseName.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
    return match ? match[1] : null;
}
export function getCourseIdentity(courseName) {
    const code = getCourseCode(courseName);
    if (code)
        return code;
    return courseName.replace(/\s*\([^)]+\)$/, '').trim().toLowerCase();
}
function gpaCoreGetRetakenKeysImpl(semesters, options = {}) {
    const bestGrade = typeof options.bestGrade === 'boolean'
        ? options.bestGrade
        : gpaCoreUsesBestGradePolicyImpl(options);
    const attempts = [];
    for (const semester of semesters) {
        if (semester.running || semester.summary)
            continue;
        semester.courses.forEach((course, index) => {
            if (!course.name.trim())
                return;
            // A withdrawal is not an outcome, so it neither supersedes an earlier
            // attempt nor is superseded by a later one. Leaving it in the group would
            // let the latest-attempt policy below (slice(0, -1)) drop a real grade in
            // favour of a W, which is how a student's passing grade would vanish.
            if (course.grade === 'W')
                return;
            const gp = course.grade && course.grade !== 'F(NT)'
                ? gradePointFor(course.grade) ?? -1
                : -1;
            attempts.push({
                semId: semester.id,
                index,
                key: `${semester.id}-${index}`,
                groupKey: getCourseIdentity(course.name),
                gradePoint: gp,
            });
        });
    }
    const groups = new Map();
    for (const attempt of attempts) {
        const group = groups.get(attempt.groupKey) ?? [];
        group.push(attempt);
        groups.set(attempt.groupKey, group);
    }
    const retakenKeys = new Set();
    for (const group of groups.values()) {
        if (group.length < 2)
            continue;
        if (bestGrade) {
            const best = group.reduce((a, b) => (a.gradePoint >= b.gradePoint ? a : b));
            for (const attempt of group) {
                if (attempt.key !== best.key)
                    retakenKeys.add(attempt.key);
            }
            continue;
        }
        for (const attempt of group.slice(0, -1)) {
            retakenKeys.add(attempt.key);
        }
    }
    return retakenKeys;
}
export function calculateCgpaTotals(semesters, options = {}) {
    const includeRunning = options.includeRunning ?? true;
    const includeSummary = options.includeSummary ?? true;
    const retakenKeys = gpaCoreGetRetakenKeysImpl(semesters, options);
    let points = 0;
    let attemptedCredits = 0;
    let earnedCredits = 0;
    let cgpaCredits = 0;
    if (includeSummary) {
        const summaryBlock = semesters.find(semester => semester.summary);
        if (summaryBlock?.summaryCGPA !== undefined && summaryBlock.summaryCredits !== undefined) {
            points += summaryBlock.summaryCGPA * summaryBlock.summaryCredits;
            cgpaCredits += summaryBlock.summaryCredits;
            attemptedCredits += summaryBlock.summaryAttempted ?? summaryBlock.summaryCredits;
            earnedCredits += summaryBlock.summaryCredits;
        }
    }
    for (const semester of semesters) {
        if (semester.summary)
            continue;
        if (semester.running && !includeRunning)
            continue;
        semester.courses.forEach((course, index) => {
            const gp = gradePointFor(course.grade);
            if (gp === undefined || !course.credits)
                return;
            if (course.grade === 'P' || course.grade === 'I')
                return;
            const isRetaken = retakenKeys.has(`${semester.id}-${index}`);
            if (!semester.running)
                attemptedCredits += course.credits;
            if (!isRetaken && gp !== null) {
                points += gp * course.credits;
                cgpaCredits += course.credits;
            }
            if (typeof gp === 'number' && gp > 0 && !semester.running && !isRetaken) {
                earnedCredits += course.credits;
            }
        });
    }
    return {
        points,
        attemptedCredits,
        earnedCredits,
        cgpaCredits,
        cgpa: cgpaCredits > 0 ? points / cgpaCredits : null,
    };
}
function gpaCoreGetSemesterCreditWarningImpl(semester) {
    const total = semester.courses.reduce((sum, course) => {
        if (!course.name.trim() || !course.credits)
            return sum;
        if (course.grade === 'P' || course.grade === 'F(NT)')
            return sum;
        return sum + course.credits;
    }, 0);
    if (total === 0)
        return null;
    if (total < 9)
        return { type: 'error', msg: `\u26a0 ${total} credits \u2014 below 9-credit minimum` };
    if (total > 15)
        return { type: 'error', msg: `\u26d4 ${total} credits \u2014 exceeds 15-credit maximum` };
    if (total > 12)
        return { type: 'warn', msg: `\u26a0 ${total} credits \u2014 requires chairman's permission` };
    return null;
}
function gpaCoreIsRepeatEligibleImpl(grade) {
    if (grade === 'F' || grade === 'F(NT)')
        return false;
    if (grade === 'P' || grade === 'I' || !grade)
        return false;
    const gp = gradePointFor(grade);
    if (gp === undefined || gp === null)
        return false;
    return gp < 3.0;
}
function gpaCoreGetImprovementStrategyImpl(grade) {
    if (grade === 'F' || grade === 'F(NT)')
        return 'retake';
    if (gpaCoreIsRepeatEligibleImpl(grade))
        return 'repeat';
    return null;
}
function gpaCoreNormalizeGradePointImpl(raw, mode) {
    const trimmed = raw.trim();
    if (/[a-zA-Z]/.test(trimmed))
        return trimmed;
    if (trimmed.includes('.'))
        return trimmed;
    if (/^[0-4]\d$/.test(trimmed))
        return `${trimmed[0]}.${trimmed[1]}`;
    if (mode === 'blur' && /^[0-4]$/.test(trimmed))
        return `${trimmed}.0`;
    return trimmed;
}
function gpaCoreClampGradePointImpl(value) {
    const n = Number.parseFloat(value);
    if (Number.isNaN(n))
        return value;
    if (n > 4.0)
        return '4.0';
    if (n < 0)
        return '0.0';
    return value;
}
export const gpaCoreCalcSemesterGpa = gpaCoreCalcSemesterGpaImpl;
export const gpaCoreUsesBestGradePolicy = gpaCoreUsesBestGradePolicyImpl;
export const gpaCoreGetRetakenKeys = gpaCoreGetRetakenKeysImpl;
export const gpaCoreGetSemesterCreditWarning = gpaCoreGetSemesterCreditWarningImpl;
export const gpaCoreIsRepeatEligible = gpaCoreIsRepeatEligibleImpl;
export const gpaCoreGetImprovementStrategy = gpaCoreGetImprovementStrategyImpl;
export const gpaCoreNormalizeGradePoint = gpaCoreNormalizeGradePointImpl;
export const gpaCoreClampGradePoint = gpaCoreClampGradePointImpl;
export { gpaCoreCalcSemesterGpaImpl as calcSemesterGpa, gpaCoreUsesBestGradePolicyImpl as usesBestGradePolicy, gpaCoreGetRetakenKeysImpl as getRetakenKeys, gpaCoreGetSemesterCreditWarningImpl as getSemesterCreditWarning, gpaCoreIsRepeatEligibleImpl as isRepeatEligible, gpaCoreGetImprovementStrategyImpl as getImprovementStrategy, gpaCoreNormalizeGradePointImpl as normalizeGradePoint, gpaCoreClampGradePointImpl as clampGradePoint, };
