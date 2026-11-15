// src/features/quest/runner/cheerpj.ts
//
// Which CheerpJ, which Java, and what to fetch up front (#981). The three move
// together: change the version here and regenerate the preload list below.
//
// CheerpJ is loaded from its own CDN under the free Community licence, which
// covers educational use, requires the CDN (serving the runtime from anywhere
// else counts as self-hosting, a paid add-on), and is why the game shows a
// "Built with CheerpJ" credit. https://cheerpj.com/docs/licensing

/** The loader. The version is in the path; the runtime it fetches is not pinnable. */
export const CHEERPJ_LOADER_URL = 'https://cjrtnc.leaningtech.com/5.0/loader.js';

/**
 * Java 17. On CheerpJ 5.0 `javac` is present for 11 and 17 and missing for 8
 * (no tools.jar on the class path), and 11 and 17 cost about the same to
 * download: 13.1 MB and 13.9 MB for a first compile, measured 2026-11-15.
 */
export const JAVA_VERSION = 17;

/**
 * The byte ranges of the runtime that compiling and running a quest touches,
 * as reported by `cjGetRuntimeResources()` after every reference solution in
 * the game had been compiled and run.
 *
 * Without it CheerpJ discovers these ranges one at a time as the JVM asks for
 * them. With it they are fetched in parallel during start-up, which cut a cold
 * start to a first result from 16.7 s to 7.7 s on desktop, and makes
 * `preloadProgress` report real progress to show the student.
 *
 * A stale list is harmless: anything missing is fetched on demand, and
 * anything extra is a wasted request. Regenerate it with
 * `npm run quest:check -- --preload` after changing the CheerpJ or Java
 * version, or after content starts using a part of the library it did not.
 */
export const PRELOAD_RESOURCES: Readonly<Record<string, readonly number[]>> = {
  '/lt/17/lib/modules': [
    0, 131072, 1441792, 2490368, 2621440, 4980736, 5242880, 6291456, 6422528, 6684672, 6946816,
    7602176, 8257536, 8388608, 9961472, 10223616, 10354688, 10485760, 19529728, 19660800, 20054016,
    20185088, 20316160, 20447232, 36044800, 38535168, 43122688, 43253760, 46792704, 46923776,
    47185920, 47448064,
  ],
  '/lt/etc/users': [0, 131072],
  '/lt/etc/localtime': [],
  '/lt/17/jre/lib/cheerpj-handlers.jar': [0, 131072],
  '/lt/17/jre/lib/cheerpj-awt.jar': [0, 131072],
  '/lt/17/jre/lib/cheerpj-jsobject.jar': [0, 131072],
  '/lt/17/conf/security/java.security': [0, 131072],
  '/lt/17/lib/jfxrt.jar': [],
};
