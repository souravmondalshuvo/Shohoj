// ── THEME TOGGLE ─────────────────────────────────────
    const html = document.documentElement;
    const themeBtn = document.getElementById('themeToggle');
    const pill = document.getElementById('togglePill');
    // Start in dark mode — pill on right, moon icon
    pill.textContent = '🌙';
    themeBtn.addEventListener('click', () => {
      setTimeout(recalc, 30);     const isDark = html.dataset.theme === 'dark';
      html.dataset.theme = isDark ? 'light' : 'dark';
      pill.textContent = isDark ? '☀️' : '🌙';
    });

    // ── SCROLL PROGRESS BAR ──────────────────────────────
    const progressBar = document.getElementById('scroll-progress');
    const navEl = document.querySelector('nav');
    function updateProgress() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (scrollTop / docHeight * 100) + '%';
      navEl.classList.toggle('scrolled', scrollTop > 40);
    }
    window.addEventListener('scroll', updateProgress, { passive: true });

    // ── SMOOTH ANCHOR SCROLL ──────────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });

    // ── ACTIVE NAV ON SCROLL ──────────────────────────────
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    function updateNav() {
      let current = '';
      sections.forEach(sec => {
        if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
      });
      navLinks.forEach(l => {
        l.classList.toggle('active', l.getAttribute('href') === '#' + current);
      });
    }
    window.addEventListener('scroll', updateNav, { passive: true });

    // ── SCROLL REVEAL ─────────────────────────────────────
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          revealObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // ── PARALLAX ORBS ────────────────────────────────────
    const orbs = document.querySelectorAll('.orb');
    const speeds = [0.04, 0.07, 0.05];
    function parallaxOrbs() {
      const y = window.scrollY;
      orbs.forEach((orb, i) => {
        orb.style.translate = '0 ' + (y * speeds[i]) + 'px';
      });
    }
    window.addEventListener('scroll', parallaxOrbs, { passive: true });

    // ── GPA DATA ─────────────────────────────────────────
    const GRADES = {
      'A':  4.00, 'A-': 3.70,
      'B+': 3.30, 'B':  3.00, 'B-': 2.70,
      'C+': 2.30, 'C':  2.00, 'C-': 1.70,
      'D+': 1.30, 'D':  1.00,
      'F':  0.00, 'F(NT)': null, 'P':  null, 'I': null
    };

    const POINTS_TO_GRADE = [
      [4.00, 'A'],  [3.70, 'A-'],
      [3.30, 'B+'], [3.00, 'B'],  [2.70, 'B-'],
      [2.30, 'C+'], [2.00, 'C'],  [1.70, 'C-'],
      [1.30, 'D+'], [1.00, 'D'],
      [0.00, 'F'],
    ];

    function detectGrade(val) {
      const n = parseFloat(val);
      if (isNaN(n)) return '';
      for (const [pt, letter] of POINTS_TO_GRADE) {
        if (Math.abs(n - pt) < 0.01) return letter;
      }
      let closest = null, minDiff = Infinity;
      for (const [pt, letter] of POINTS_TO_GRADE) {
        const diff = Math.abs(n - pt);
        if (diff < minDiff) { minDiff = diff; closest = letter; }
      }
      return minDiff <= 0.20 ? closest : '';
    }

    // ── SEMESTER NAME GENERATOR ──────────────────────────
    // Format: "Spring 25", "Summer 25", "Fall 25", "Spring 26" ...
    const SEASON_ORDER = ['Spring', 'Summer', 'Fall'];
    function ordinalSup(n) {
      const s = ['th','st','nd','rd'];
      const v = n % 100;
      const suffix = s[(v - 20) % 10] || s[v] || s[0];
      return `${n}<sup>${suffix}</sup>`;
    }

    // Returns which season is currently running based on today's date
    // Spring: Jan–Apr, Summer: May–Aug, Fall: Sep–Dec
    function getCurrentSeason() {
      const m = new Date().getMonth() + 1; // 1-12
      if (m <= 4) return 'Spring';
      if (m <= 8) return 'Summer';
      return 'Fall';
    }

    // Returns the last COMPLETED semester {season, year}
    // i.e. the one before the currently running semester
    function getLastCompletedSemester() {
      const now = new Date();
      const curSeason = getCurrentSeason();
      const curYear   = now.getFullYear();
      const idx = SEASON_ORDER.indexOf(curSeason);
      if (idx === 0) {
        // Spring running → last completed = Fall of previous year
        return { season: SEASON_ORDER[SEASON_ORDER.length - 1], year: curYear - 1 };
      }
      return { season: SEASON_ORDER[idx - 1], year: curYear };
    }

    // Count semesters from start (inclusive) to end (inclusive)
    function countSemesters(startSeason, startYear, endSeason, endYear) {
      let si = SEASON_ORDER.indexOf(startSeason);
      let yr = parseInt(startYear);
      let count = 0;
      while (true) {
        count++;
        if (SEASON_ORDER[si] === endSeason && yr === parseInt(endYear)) break;
        si++;
        if (si >= SEASON_ORDER.length) { si = 0; yr++; }
        if (yr > parseInt(endYear) + 1) break; // safety valve
      }
      return count;
    }

    function generateSemesterNames(startSeason, startYear, count) {
      const names = [];
      let si = SEASON_ORDER.indexOf(startSeason);
      if (si === -1) si = 0;
      let yr = parseInt(startYear);
      for (let i = 0; i < count; i++) {
        names.push(`${SEASON_ORDER[si]} ${yr} (${ordinalSup(i + 1)} Semester)`);
        si++;
        if (si >= SEASON_ORDER.length) { si = 0; yr++; }
      }
      return names;
    }
    function getStartSeason() {
      const el = document.getElementById('startSeason');
      return el ? el.value : 'Fall';
    }
    function getStartYear() {
      const el = document.getElementById('startYear');
      return el ? el.value : '2024';
    }

    // ── DEPARTMENT PRESETS ────────────────────────────────
    const DEPARTMENTS = {
      CSE: {
        label: 'B.Sc. in Computer Science and Engineering (CSE) & Engineering',
        totalCredits: 136,
        presets: [
          { name: 'Fall — Semester 1', courses: [
            { name: 'Programming Language I (CSE110)', credits: 3, grade: '' },
            { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
            { name: 'Remedial Mathematics (MAT092)', credits: 0, grade: '' },
            { name: 'Principles of Physics I (PHY111)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 2', courses: [
            { name: 'Programming Language II (CSE111)', credits: 3, grade: '' },
            { name: 'Discrete Mathematics (CSE230)', credits: 3, grade: '' },
            { name: 'Differential Calculus (MAT110)', credits: 3, grade: '' },
            { name: 'Principles of Physics II (PHY112)', credits: 3, grade: '' },
          ]},
          { name: 'Summer — Semester 3', courses: [
            { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
            { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
            { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
            { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
          ]},
          { name: 'Fall — Semester 4', courses: [
            { name: 'Data Structures (CSE220)', credits: 3, grade: '' },
            { name: 'Electronic Devices & Circuits (CSE251)', credits: 3, grade: '' },
            { name: 'Integral Calculus (MAT120)', credits: 3, grade: '' },
            { name: 'Statistics & Probability (STA201)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 5', courses: [
            { name: 'Algorithms (CSE221)', credits: 3, grade: '' },
            { name: 'Computer Architecture (CSE341)', credits: 3, grade: '' },
            { name: 'Software Engineering (CSE361)', credits: 3, grade: '' },
            { name: 'Linear Algebra (MAT215)', credits: 3, grade: '' },
          ]},
          { name: 'Summer — Semester 6', courses: [
            { name: 'Database Systems (CSE370)', credits: 3, grade: '' },
            { name: 'Operating Systems (CSE421)', credits: 3, grade: '' },
            { name: 'Computer Networks (CSE431)', credits: 3, grade: '' },
            { name: 'Artificial Intelligence (CSE440)', credits: 3, grade: '' },
          ]},
        ]
      },
      EEE: {
        label: 'BSc EEE — Electrical & Electronic Engineering',
        totalCredits: 136,
        presets: [
          { name: 'Fall — Semester 1', courses: [
            { name: 'Introduction to EEE (EEE101)', credits: 3, grade: '' },
            { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
            { name: 'Remedial Mathematics (MAT092)', credits: 0, grade: '' },
            { name: 'Principles of Physics I (PHY111)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 2', courses: [
            { name: 'Circuit Theory I (EEE201)', credits: 3, grade: '' },
            { name: 'Electronics I (EEE203)', credits: 3, grade: '' },
            { name: 'Differential Calculus (MAT110)', credits: 3, grade: '' },
            { name: 'Principles of Physics II (PHY112)', credits: 3, grade: '' },
          ]},
          { name: 'Summer — Semester 3', courses: [
            { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
            { name: 'Circuit Theory II (EEE202)', credits: 3, grade: '' },
            { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
            { name: 'Integral Calculus (MAT120)', credits: 3, grade: '' },
          ]},
          { name: 'Fall — Semester 4', courses: [
            { name: 'Signals & Systems (EEE301)', credits: 3, grade: '' },
            { name: 'Electronics II (EEE303)', credits: 3, grade: '' },
            { name: 'Electromagnetic Fields (EEE311)', credits: 3, grade: '' },
            { name: 'Linear Algebra (MAT215)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 5', courses: [
            { name: 'Digital Electronics (EEE401)', credits: 3, grade: '' },
            { name: 'Communication Theory (EEE403)', credits: 3, grade: '' },
            { name: 'Control Systems (EEE411)', credits: 3, grade: '' },
            { name: 'Power Systems I (EEE421)', credits: 3, grade: '' },
          ]},
        ]
      },
      BBA: {
        label: 'Bachelor of Business Administration (BBA)',
        totalCredits: 130,
        presets: [
          { name: 'Fall — Semester 1', courses: [
            { name: 'Introduction to Business (BUS101)', credits: 3, grade: '' },
            { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
            { name: 'Remedial Mathematics (MAT092)', credits: 0, grade: '' },
            { name: 'Principles of Economics (ECO101)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 2', courses: [
            { name: 'Financial Accounting (ACC101)', credits: 3, grade: '' },
            { name: 'Business Communication (BUS201)', credits: 3, grade: '' },
            { name: 'Business Mathematics (MAT110)', credits: 3, grade: '' },
            { name: 'Principles of Management (MGT101)', credits: 3, grade: '' },
          ]},
          { name: 'Summer — Semester 3', courses: [
            { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
            { name: 'Business Statistics (BUS211)', credits: 3, grade: '' },
            { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
            { name: 'Principles of Marketing (MKT201)', credits: 3, grade: '' },
          ]},
          { name: 'Fall — Semester 4', courses: [
            { name: 'Managerial Accounting (ACC201)', credits: 3, grade: '' },
            { name: 'Organizational Behavior (BUS301)', credits: 3, grade: '' },
            { name: 'Financial Management (FIN201)', credits: 3, grade: '' },
            { name: 'Consumer Behavior (MKT301)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 5', courses: [
            { name: 'Business Policy & Strategy (BUS401)', credits: 3, grade: '' },
            { name: 'Investment Analysis (FIN301)', credits: 3, grade: '' },
            { name: 'Human Resource Management (HRM301)', credits: 3, grade: '' },
            { name: 'Marketing Management (MKT401)', credits: 3, grade: '' },
          ]},
        ]
      },
      ECO: {
        label: 'B.S.S. in Economics (ECO)',
        totalCredits: 120,
        presets: [
          { name: 'Fall — Semester 1', courses: [
            { name: 'Microeconomics I (ECO101)', credits: 3, grade: '' },
            { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
            { name: 'Remedial Mathematics (MAT092)', credits: 0, grade: '' },
            { name: 'Introduction to Sociology (SOC101)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 2', courses: [
            { name: 'Macroeconomics I (ECO102)', credits: 3, grade: '' },
            { name: 'Mathematics for Economics (ECO201)', credits: 3, grade: '' },
            { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
            { name: 'Statistics & Probability (STA201)', credits: 3, grade: '' },
          ]},
          { name: 'Summer — Semester 3', courses: [
            { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
            { name: 'Microeconomics II (ECO211)', credits: 3, grade: '' },
            { name: 'Macroeconomics II (ECO212)', credits: 3, grade: '' },
            { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
          ]},
          { name: 'Fall — Semester 4', courses: [
            { name: 'Econometrics (ECO301)', credits: 3, grade: '' },
            { name: 'Development Economics (ECO311)', credits: 3, grade: '' },
            { name: 'International Economics (ECO321)', credits: 3, grade: '' },
            { name: 'Public Finance (ECO331)', credits: 3, grade: '' },
          ]},
        ]
      },
      ENG: {
        label: 'B.A. in English (ENG)',
        totalCredits: 120,
        presets: [
          { name: 'Fall — Semester 1', courses: [
            { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
            { name: 'Introduction to Literature (ENG111)', credits: 3, grade: '' },
            { name: 'Grammar & Composition (ENG121)', credits: 3, grade: '' },
            { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 2', courses: [
            { name: 'British Literature I (ENG201)', credits: 3, grade: '' },
            { name: 'Linguistics I (ENG211)', credits: 3, grade: '' },
            { name: 'Creative Writing (ENG221)', credits: 3, grade: '' },
            { name: 'Introduction to Sociology (SOC101)', credits: 3, grade: '' },
          ]},
          { name: 'Summer — Semester 3', courses: [
            { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
            { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
            { name: 'American Literature (ENG301)', credits: 3, grade: '' },
            { name: 'Linguistics II (ENG311)', credits: 3, grade: '' },
          ]},
          { name: 'Fall — Semester 4', courses: [
            { name: 'Postcolonial Literature (ENG401)', credits: 3, grade: '' },
            { name: 'Literary Theory & Criticism (ENG411)', credits: 3, grade: '' },
            { name: 'Research Methods (ENG421)', credits: 3, grade: '' },
            { name: 'World Literature (ENG431)', credits: 3, grade: '' },
          ]},
        ]
      },
      ARC: {
        label: 'B.Sc. in Architecture (ARC)',
        totalCredits: 180,
        presets: [
          { name: 'Fall — Semester 1', courses: [
            { name: 'Architectural Design I (ARC101)', credits: 6, grade: '' },
            { name: 'Drawing & Graphics (ARC111)', credits: 3, grade: '' },
            { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
            { name: 'Mathematics I (MAT110)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 2', courses: [
            { name: 'Architectural Design II (ARC102)', credits: 6, grade: '' },
            { name: 'History of Architecture I (ARC112)', credits: 3, grade: '' },
            { name: 'Building Materials (ARC122)', credits: 3, grade: '' },
            { name: 'Principles of Physics I (PHY111)', credits: 3, grade: '' },
          ]},
          { name: 'Summer — Semester 3', courses: [
            { name: 'Architectural Design III (ARC201)', credits: 6, grade: '' },
            { name: 'History of Architecture II (ARC211)', credits: 3, grade: '' },
            { name: 'Structural Systems I (ARC221)', credits: 3, grade: '' },
            { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
          ]},
          { name: 'Fall — Semester 4', courses: [
            { name: 'Architectural Design IV (ARC301)', credits: 6, grade: '' },
            { name: 'Environmental Control (ARC311)', credits: 3, grade: '' },
            { name: 'Structural Systems II (ARC321)', credits: 3, grade: '' },
            { name: 'Urban Design (ARC331)', credits: 3, grade: '' },
          ]},
        ]
      },
      PHR: {
        label: 'B.Sc. in Pharmacy (PHR)',
        totalCredits: 160,
        presets: [
          { name: 'Fall — Semester 1', courses: [
            { name: 'General Chemistry (CHE101)', credits: 3, grade: '' },
            { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
            { name: 'Mathematics I (MAT110)', credits: 3, grade: '' },
            { name: 'Introduction to Pharmacy (PHR101)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 2', courses: [
            { name: 'Biology I (BIO101)', credits: 3, grade: '' },
            { name: 'Organic Chemistry I (CHE201)', credits: 3, grade: '' },
            { name: 'Pharmaceutics I (PHR201)', credits: 3, grade: '' },
            { name: 'Statistics & Probability (STA201)', credits: 3, grade: '' },
          ]},
          { name: 'Summer — Semester 3', courses: [
            { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
            { name: 'Biochemistry (BIO201)', credits: 3, grade: '' },
            { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
            { name: 'Pharmacology I (PHR301)', credits: 3, grade: '' },
          ]},
          { name: 'Fall — Semester 4', courses: [
            { name: 'Pharmacology II (PHR302)', credits: 3, grade: '' },
            { name: 'Pharmaceutical Analysis (PHR311)', credits: 3, grade: '' },
            { name: 'Medicinal Chemistry (PHR321)', credits: 3, grade: '' },
            { name: 'Pharmaceutics II (PHR331)', credits: 3, grade: '' },
          ]},
        ]
      },
      LAW: {
        label: 'Bachelor of Laws (LLB)',
        totalCredits: 130,
        presets: [
          { name: 'Fall — Semester 1', courses: [
            { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
            { name: 'Legal System of Bangladesh (LAW101)', credits: 3, grade: '' },
            { name: 'Introduction to Law (LAW111)', credits: 3, grade: '' },
            { name: 'Political Science (POL101)', credits: 3, grade: '' },
          ]},
          { name: 'Spring — Semester 2', courses: [
            { name: 'Contract Law (LAW201)', credits: 3, grade: '' },
            { name: 'Constitutional Law I (LAW211)', credits: 3, grade: '' },
            { name: 'Criminal Law (LAW221)', credits: 3, grade: '' },
            { name: 'Introduction to Sociology (SOC101)', credits: 3, grade: '' },
          ]},
          { name: 'Summer — Semester 3', courses: [
            { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
            { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
            { name: 'Constitutional Law II (LAW301)', credits: 3, grade: '' },
            { name: 'Property Law (LAW311)', credits: 3, grade: '' },
          ]},
          { name: 'Fall — Semester 4', courses: [
            { name: 'Administrative Law (LAW401)', credits: 3, grade: '' },
            { name: 'Company Law (LAW411)', credits: 3, grade: '' },
            { name: 'International Law (LAW421)', credits: 3, grade: '' },
            { name: 'Legal Research & Writing (LAW431)', credits: 3, grade: '' },
          ]},
        ]
      },
    };

    // ── ALL COURSES MASTER LIST ──────────────────────────
    const COURSE_DB = {};
    Object.values(DEPARTMENTS).forEach(dept => {
      dept.presets.forEach(sem => {
        sem.courses.forEach(c => {
          const match = c.name.match(/\(([A-Z]{2,3}\d{3}[A-Z]?)\)$/);
          const code  = match ? match[1] : '';
          const name  = c.name.replace(/\s*\([^)]+\)$/, '').trim();
          if (code && !COURSE_DB[code]) {
            COURSE_DB[code] = { code, name, credits: c.credits, full: c.name };
          }
        });
      });
    });
    const ALL_COURSES = Object.values(COURSE_DB).sort((a,b) => a.code.localeCompare(b.code));

    let currentDept = '';

    // ── AUTOCOMPLETE LOGIC ────────────────────────────────
    const portal = document.getElementById('suggestions-portal');
    let activeInput = null;

    function showPortalSuggestions(inputEl, semId, cIdx, matches) {
      const rect = inputEl.getBoundingClientRect();
      const top  = rect.bottom + 4;
      const left = rect.left;
      const w    = rect.width;
      let html = `<div class="course-suggestions" id="sug-${semId}-${cIdx}"
        style="top:${top}px;left:${left}px;width:${w}px;">`;
      html += matches.map((c, i) => `
        <div class="suggestion-item" data-idx="${i}"
          onmousedown="pickSuggestion(${semId},${cIdx},'${c.full.replace(/'/g,"\\'")}',${c.credits})">
          <span class="suggestion-code">${c.code}</span>
          <span class="suggestion-name">${c.name}</span>
          <span class="suggestion-credits">${c.credits} cr</span>
        </div>`).join('');
      html += '</div>';
      portal.innerHTML = html;
    }

    function onCourseInput(e, semId, cIdx) {
      const raw = e.target.value.trim();
      const val = raw.toLowerCase();
      activeInput = e.target;

      if (!val) { portal.innerHTML = ''; return; }

      const exactMatch = COURSE_DB[raw.toUpperCase()];
      const t1 = exactMatch ? [exactMatch] : [];
      const t2 = ALL_COURSES.filter(c => c !== exactMatch && c.code.toLowerCase().startsWith(val));
      const t3 = ALL_COURSES.filter(c => c !== exactMatch && !t2.includes(c) && c.code.toLowerCase().includes(val));
      const t4 = ALL_COURSES.filter(c => c !== exactMatch && !t2.includes(c) && !t3.includes(c) && c.name.toLowerCase().includes(val));

      const matches = [...t1, ...t2, ...t3, ...t4].slice(0, 8);
      if (!matches.length) { portal.innerHTML = ''; return; }
      showPortalSuggestions(e.target, semId, cIdx, matches);
    }

    function onCourseKey(e, semId, cIdx) {
      const box = portal.querySelector('.course-suggestions');
      if (!box) return;
      const items = box.querySelectorAll('.suggestion-item');
      let active = box.querySelector('.suggestion-item.active');
      let idx = active ? parseInt(active.dataset.idx) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
      } else if (e.key === 'Enter' && active) {
        e.preventDefault();
        active.dispatchEvent(new MouseEvent('mousedown'));
        return;
      } else if (e.key === 'Escape') {
        portal.innerHTML = ''; return;
      } else { return; }

      items.forEach(el => el.classList.remove('active'));
      if (items[idx]) items[idx].classList.add('active');
    }

    function closeSuggestions(id) {
      portal.innerHTML = '';
    }

    window.addEventListener('scroll', () => {
      if (activeInput && portal.innerHTML) portal.innerHTML = '';
    }, { passive: true });

    function pickSuggestion(semId, cIdx, fullName, credits) {
      portal.innerHTML = '';
      const sem = semesters.find(s => s.id === semId);
      if (!sem) return;
      sem.courses[cIdx].name    = fullName;
      sem.courses[cIdx].credits = credits;
      sem.courses[cIdx].grade      = '';
      sem.courses[cIdx].gradePoint = '';

      // Full re-render so P/F dropdown appears immediately for 0-credit courses
      renderSemesters();
      recalc();

      // Restore focus to the grade input of the picked row
      setTimeout(() => {
        const block = document.getElementById(`sem-${semId}`);
        if (!block) return;
        const rows = block.querySelectorAll('.course-row:not(.course-header)');
        const row  = rows[cIdx];
        if (!row) return;
        const gpInput = row.querySelector('input[inputmode="decimal"]');
        const pfSelect = row.querySelector('.pf-select');
        if (pfSelect) pfSelect.focus();
        else if (gpInput) gpInput.focus();
      }, 30);
    }


    function drawTrendChart(canvas, data) {
      const dpr = window.devicePixelRatio || 1;
      const wrap = canvas.parentElement;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const green     = '#2ECC71';
      const greenDim  = 'rgba(46,204,113,0.15)';
      const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
      const labelColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
      const dotBg     = isDark ? '#060d09' : '#d4edde';

      const PAD = { top: 12, right: 16, bottom: 36, left: 32 };
      const cW = W - PAD.left - PAD.right;
      const cH = H - PAD.top  - PAD.bottom;

      const n = data.length;
      const gpas = data.map(d => d.gpa);
      const minG = Math.max(0, Math.min(...gpas) - 0.3);
      const maxG = Math.min(4, Math.max(...gpas) + 0.3);
      const range = maxG - minG || 1;

      const xOf = i => PAD.left + (i / (n - 1)) * cW;
      const yOf = g => PAD.top + cH - ((g - minG) / range) * cH;

      // Grid lines at 1.0, 2.0, 3.0, 4.0
      ctx.font = '10px DM Sans, sans-serif';
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'right';
      [1, 2, 3, 4].forEach(g => {
        if (g < minG - 0.1 || g > maxG + 0.1) return;
        const y = yOf(g);
        ctx.beginPath();
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(W - PAD.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(g.toFixed(1), PAD.left - 5, y + 3.5);
      });

      // Gradient fill under line
      const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
      grad.addColorStop(0, 'rgba(46,204,113,0.22)');
      grad.addColorStop(1, 'rgba(46,204,113,0.00)');
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(data[0].gpa));
      data.forEach((d, i) => { if (i > 0) ctx.lineTo(xOf(i), yOf(d.gpa)); });
      ctx.lineTo(xOf(n - 1), H - PAD.bottom);
      ctx.lineTo(xOf(0), H - PAD.bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = green;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap  = 'round';
      data.forEach((d, i) => {
        i === 0 ? ctx.moveTo(xOf(i), yOf(d.gpa)) : ctx.lineTo(xOf(i), yOf(d.gpa));
      });
      ctx.stroke();

      // Dots + labels
      data.forEach((d, i) => {
        const x = xOf(i), y = yOf(d.gpa);

        // Dot
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = dotBg;
        ctx.fill();
        ctx.strokeStyle = green;
        ctx.lineWidth = 2;
        ctx.stroke();

        // GPA value above dot
        ctx.font = 'bold 10px DM Sans, sans-serif';
        ctx.fillStyle = green;
        ctx.textAlign = 'center';
        ctx.fillText(d.gpa.toFixed(2), x, y - 9);

        // Semester label below x-axis
        ctx.font = '10px DM Sans, sans-serif';
        ctx.fillStyle = labelColor;
        ctx.fillText(d.label, x, H - PAD.bottom + 14);
      });
    }

    // Step 1: dept chosen → show semester picker
    function onDeptSelect() {
      const sel = document.getElementById('deptSelect');
      currentDept = sel.value;
      if (!currentDept) return;
      const dept = DEPARTMENTS[currentDept];
      // show credits badge
      const creditsEl = document.getElementById('deptCredits');
      if (creditsEl) creditsEl.style.display = 'inline-flex';
      document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
      // reveal step 2
      const startRow = document.getElementById('startSemRow');
      if (startRow) startRow.style.display = 'flex';
      // clear semesters until user confirms
      semesters = [];
      semesterCounter = 0;
      renderSemesters();
      recalc();
    }

    // Step 2: user clicks "Let's go" → build semesters
    function onStartSemConfirm() {
      if (!currentDept) return;
      if (!getStartSeason() || !getStartYear()) return;
      const dept = DEPARTMENTS[currentDept];
      const startSeason = getStartSeason();
      const startYear   = parseInt(getStartYear());
      const last        = getLastCompletedSemester();

      // Count semesters from start to last completed
      const startIdx = SEASON_ORDER.indexOf(startSeason) + startYear * 3;
      const lastIdx  = SEASON_ORDER.indexOf(last.season)  + last.year  * 3;
      const semCount = startIdx > lastIdx ? 0 : countSemesters(startSeason, startYear, last.season, last.year);

      const semNames = generateSemesterNames(startSeason, startYear, semCount);
      semesters = [];
      semesterCounter = 0;

      for (let idx = 0; idx < semCount; idx++) {
        const id = semesterCounter++;
        const preset = dept.presets[idx];
        const courses = preset
          ? preset.courses.map(c => ({ name: '', credits: 0, grade: '', gradePoint: '' }))
          : [{ name: '', credits: 0, grade: '', gradePoint: '' }];
        semesters.push({ id, name: semNames[idx], courses });
      }

      renderSemesters();
      recalc();
    }

    // kept for compatibility (addSemester still calls getStartSeason/Year)
    function onDeptChange() { onStartSemConfirm(); }

    let semesters = [];
    let semesterCounter = 0;

    function addRunningSemester() {
      // Only one running semester allowed
      if (semesters.some(s => s.running)) return;
      const nextName = generateNextSemesterName();
      semesters.push({
        id: Date.now(),
        name: nextName + ' (Running)',
        running: true,
        courses: [{ name:'', credits:0, grade:'', gradePoint:'' }]
      });
      renderSemesters();
      recalc();
    }

    function generateNextSemesterName() {
      // Generate the name of the next semester after the last one
      const SEASONS = ['Spring','Summer','Fall'];
      if (!semesters.length) return 'Current Semester';
      // Find last non-running semester
      const last = [...semesters].reverse().find(s => !s.running);
      if (!last || !last.name) return 'Current Semester';
      const match = last.name.match(/(Spring|Summer|Fall)\s+(\d{4})/);
      if (!match) return 'Current Semester';
      let season = match[1], year = parseInt(match[2]);
      const idx = SEASONS.indexOf(season);
      if (idx === 2) { season = 'Spring'; year++; }
      else { season = SEASONS[idx + 1]; }
      return `${season} ${year}`;
    }

    function addSemester(prefill = null) {
      const id = semesterCounter++;
      const allNames = generateSemesterNames(getStartSeason(), getStartYear(), semesters.length + 1);
      const name = allNames[semesters.length] || `Semester ${semesters.length + 1}`;
      const courses = prefill || [{ name: '', credits: 0, grade: '', gradePoint: '' }];
      semesters.push({ id, name, courses });
      renderSemesters();
      recalc();
    }

    function removeSemester(id) {
      semesters = semesters.filter(s => s.id !== id);
      renderSemesters();
      recalc();
    }

    function addCourse(semId) {
      const sem = semesters.find(s => s.id === semId);
      if (sem) { sem.courses.push({ name: '', credits: 0, grade: '' }); }
      renderSemesters();
      recalc();
    }

    function removeCourse(semId, cIdx) {
      const sem = semesters.find(s => s.id === semId);
      if (sem && sem.courses.length > 1) {
        sem.courses.splice(cIdx, 1);
        renderSemesters();
        recalc();
      }
    }


    // ── RETAKE DETECTION ─────────────────────────────────
    // Returns a Set of "semId-courseIdx" keys that are superseded retakes
    // Match by course code OR full name. Latest occurrence wins.
    // ── RETAKE POLICY ────────────────────────────────────
    // Admitted up to Fall 2024  → best grade counts
    // Admitted Spring 2025+     → latest grade counts
    function usesBestGradePolicy() {
      const season = getStartSeason();
      const year   = parseInt(getStartYear());
      if (!season || !year) return false;
      const idx = SEASON_ORDER.indexOf(season);
      // Based on transcript evidence: Fall 2024 uses LATEST grade policy
      // Only Spring 2024 and earlier use best grade policy
      if (year < 2024) return true;
      if (year === 2024 && idx === 0) return true;  // Spring 2024 → best grade
      if (year === 2024 && idx === 1) return true;  // Summer 2024 → best grade
      if (year === 2024 && idx === 2) return false; // Fall 2024 → latest grade
      return false; // 2026+ → latest policy
    }

    function getRetakenKeys() {
      const bestGrade = usesBestGradePolicy();

      // Flatten all courses with position info, in semester order
      const all = [];
      semesters.forEach(sem => {
        sem.courses.forEach((c, i) => {
          if (!c.name.trim()) return;
          const codeMatch = c.name.match(/\(([A-Z]{2,3}\d{3}[A-Z]?)\)$/);
          const code = codeMatch ? codeMatch[1] : null;
          const baseName = c.name.replace(/\s*\([^)]+\)$/, '').trim().toLowerCase();
          const gp = (c.grade && c.grade !== 'F(NT)') ? (GRADES[c.grade] ?? -1) : -1;
          all.push({ semId: sem.id, idx: i, code, baseName, key: `${sem.id}-${i}`, gp });
        });
      });

      // Group by code or name
      const groups = {};
      all.forEach(entry => {
        const groupKey = entry.code || entry.baseName;
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(entry);
      });

      const retakenKeys = new Set();
      Object.values(groups).forEach(group => {
        if (group.length < 2) return;
        if (bestGrade) {
          // Best grade policy: find the entry with highest gp, mark all others retaken
          const best = group.reduce((a, b) => a.gp >= b.gp ? a : b);
          group.forEach(e => { if (e.key !== best.key) retakenKeys.add(e.key); });
        } else {
          // Latest grade policy: last in semester order wins, all earlier are retaken
          group.slice(0, -1).forEach(e => retakenKeys.add(e.key));
        }
      });
      return retakenKeys;
    }

    function renderSemesters() {
      const container = document.getElementById('semestersContainer');
      document.getElementById('semesterCount').textContent = semesters.length;
      const runBtn = document.getElementById('addRunningSemBtn');
      if (runBtn) runBtn.disabled = semesters.some(s => s.running);
      const retakenKeys = getRetakenKeys();

      container.innerHTML = semesters.map(sem => {
        const gpa = calcSemGPA(sem, retakenKeys);
        const isRunning = !!sem.running;
        return `
        <div class="semester-block lg-surface${isRunning ? ' semester-running' : ''}" id="sem-${sem.id}"><div class="lg-shine"></div>
          <div class="semester-head">
            <div class="semester-head-left">
              <span class="semester-label">${sem.name}</span>
              ${isRunning
                ? `<span class="semester-running-badge">🎯 Projected</span>${gpa !== null ? `<span class="semester-gpa-badge" style="color:#F0A500;background:rgba(240,165,0,0.10);border:1px solid rgba(240,165,0,0.25);">GPA ${gpa.toFixed(2)}</span>` : ''}`
                : (gpa !== null ? `<span class="semester-gpa-badge">GPA ${gpa.toFixed(2)}</span>` : '')
              }
            </div>
            <div class="semester-actions">
              <button class="btn-icon danger" onclick="removeSemester(${sem.id})">Remove</button>
            </div>
          </div>
          <div class="courses-table">
            <div class="course-row course-header">
              <span>Course</span>
              <span>Credits</span>
              <span>Grade Point</span>
              <span>Grade</span>
            </div>
            ${sem.courses.map((c, i) => {
              const isRetaken = retakenKeys.has(`${sem.id}-${i}`);
              return `
            <div class="course-row${isRetaken ? ' retaken' : ''}">
              <div class="course-input-wrap" style="position:relative;">
                <input type="text" placeholder="Type course code / title"
                  value="${c.name}"
                  autocomplete="off"
                  oninput="onCourseInput(event,${sem.id},${i})"
                  onkeydown="onCourseKey(event,${sem.id},${i})"
                  onblur="setTimeout(()=>closeSuggestions('sug-${sem.id}-${i}'),180)" />
                ${isRetaken ? `<span class="retaken-badge">Retaken</span>` : ''}
              </div>
              <span class="credits-static">${c.credits}</span>
              ${c.credits === 0 && c.name.trim() !== ''
                ? `<select class="pf-select" onchange="onPFChange(${sem.id},${i},this.value)">
                    <option value="" disabled ${!c.grade ? 'selected' : ''}>P / F</option>
                    <option value="P" ${c.grade === 'P' ? 'selected' : ''}>P — Pass</option>
                    <option value="F" ${c.grade === 'F' ? 'selected' : ''}>F — Fail</option>
                  </select>`
                : `<input type="text" inputmode="decimal" placeholder="0.0 – 4.0"
                    value="${c.grade === 'F(NT)' ? 'NT' : (c.gradePoint !== undefined ? c.gradePoint : (c.grade && GRADES[c.grade] !== null ? GRADES[c.grade] : ''))}"
                    oninput="autoDetectGrade(${sem.id},${i},this.value,this)"
                    style="text-align:center;" />`
              }
              <span class="grade-letter" id="gl-${sem.id}-${i}"
                style="color:${
                  c.grade === 'F' ? '#e74c3c' :
                  c.grade === 'F(NT)' ? '#e74c3c' :
                  c.grade === 'P' ? '#2ECC71' :
                  c.grade && c.grade.startsWith('A') ? '#2ECC71' :
                  c.grade && c.grade.startsWith('B') ? '#27ae60' :
                  c.grade && c.grade.startsWith('C') ? '#F0A500' :
                  c.grade && c.grade.startsWith('D') ? '#e67e22' :
                  'var(--text3)'
                }">${c.grade || '—'}</span>
              <button class="btn-remove-course" onclick="removeCourse(${sem.id},${i})">×</button>
            </div>`;
            }).join('')}
          </div>
          <div class="add-course-row">
            <button class="btn-add-course" onclick="addCourse(${sem.id})">+ Add course</button>
          </div>
        </div>`;
      }).join('');
    }

    function onPFChange(semId, cIdx, val) {
      const sem = semesters.find(s => s.id === semId);
      if (!sem) return;
      sem.courses[cIdx].grade = val;
      sem.courses[cIdx].gradePoint = val;
      renderSemesters();
      recalc();
    }

    function autoDetectGrade(semId, cIdx, val, inputEl) {
      const letter = detectGrade(val);
      const sem = semesters.find(s => s.id === semId);
      if (!sem) return;
      sem.courses[cIdx].grade = letter;
      sem.courses[cIdx].gradePoint = val;

      // Flash border green on valid grade
      if (letter) {
        inputEl.style.borderColor = 'rgba(46,204,113,0.6)';
        setTimeout(() => inputEl.style.borderColor = '', 600);
      }

      // Full re-render so retaken state, GPA badges all stay in sync
      renderSemesters();
      recalc();

      // Restore focus to the grade point input that was being typed in
      const block = document.getElementById(`sem-${semId}`);
      if (block) {
        const rows = block.querySelectorAll('.course-row:not(.course-header)');
        const gpInput = rows[cIdx]?.querySelector('input[inputmode="decimal"]');
        if (gpInput) {
          gpInput.focus();
          // Move cursor to end
          const len = gpInput.value.length;
          gpInput.setSelectionRange(len, len);
        }
      }
    }

    function calcSemGPA(sem, retakenKeys) {
      const rk = retakenKeys || getRetakenKeys();
      let pts = 0, creds = 0;
      sem.courses.forEach((c, i) => {
        const gp = GRADES[c.grade];
        if (gp === undefined || !c.credits) return;
        if (c.grade === 'P' || c.grade === 'I') return;
        // F(NT): always counts toward semester GPA denominator as 0 pts (even if retaken)
        if (c.grade === 'F(NT)') { creds += c.credits; return; }
        if (rk.has(`${sem.id}-${i}`)) return;
        if (gp === null) return;
        pts += gp * c.credits;
        creds += c.credits;
      });
      return creds > 0 ? pts / creds : null;
    }

    function recalc() {
      let totalPts = 0, totalAttempted = 0, totalEarned = 0;
      const retakenKeys = getRetakenKeys();
      for (const sem of semesters) {
        sem.courses.forEach((c, i) => {
          const gp = GRADES[c.grade];
          if (gp === undefined || !c.credits) return;
          if (c.grade === 'P' || c.grade === 'I') return;
          const isRetaken = retakenKeys.has(`${sem.id}-${i}`);
          // BRACU counts ALL attempts toward credits attempted (including retaken/failed)
          totalAttempted += c.credits;
          // Only the active (non-retaken) grade counts toward CGPA and credits earned
          if (!isRetaken) {
            totalPts += gp * c.credits;
            if (gp > 0) totalEarned += c.credits;
          }
        });
      }

      const cgpa = totalEarned > 0 ? totalPts / totalEarned : null;
      const cgpaEl = document.getElementById('cgpaVal');
      cgpaEl.textContent = cgpa !== null ? cgpa.toFixed(2) : '—';
      const hasRunning = semesters.some(s => s.running);
      document.querySelector('.cgpa-label').textContent = hasRunning ? 'Projected CGPA' : 'Current CGPA';
      cgpaEl.style.color = cgpa === null ? 'var(--text3)' :
        cgpa >= 3.5 ? '#2ECC71' : cgpa >= 3.0 ? '#27ae60' :
        cgpa >= 2.5 ? '#F0A500' : '#e74c3c';

      document.getElementById('totalAttempted').textContent = totalAttempted.toFixed(1);
      document.getElementById('totalEarned').textContent = totalEarned.toFixed(1);

      // ── CREDITS PROGRESS BAR ──────────────────────────
      const dept = currentDept ? DEPARTMENTS[currentDept] : null;
      const totalRequired = dept ? dept.totalCredits : 0;
      const creditsBox = document.getElementById('creditsProgressBox');
      if (dept && totalRequired > 0) {
        creditsBox.style.display = '';
        const creditsPct = Math.min((totalEarned / totalRequired) * 100, 100);
        document.getElementById('creditsFill').style.width = creditsPct.toFixed(1) + '%';
        document.getElementById('creditsPct').textContent = creditsPct.toFixed(1) + '%';
        document.getElementById('creditsEarnedLabel').textContent = totalEarned.toFixed(0) + ' credits completed';
        document.getElementById('creditsTotalLabel').textContent = 'of ' + totalRequired;
      } else {
        creditsBox.style.display = 'none';
      }

      // ── ACADEMIC STANDING ─────────────────────────────
      const standingBox = document.getElementById('standingBox');
      const cgpaNum = totalEarned > 0 ? totalPts / totalEarned : null;
      const semCount = semesters.filter(s => s.courses.some(c => c.grade && GRADES[c.grade] !== undefined && GRADES[c.grade] !== null && c.credits > 0)).length;

      if (cgpaNum !== null) {
        standingBox.style.display = '';
        const title  = document.getElementById('standingTitle');
        const desc   = document.getElementById('standingDesc');
        const badge  = document.getElementById('standingBadge');
        // remove old standing classes
        standingBox.classList.remove('standing-excellent','standing-good','standing-warning','standing-danger');

        let standing, cls, emoji, description;

        if (cgpaNum >= 3.97) {
          standing = 'Perfect Standing'; cls = 'standing-excellent'; emoji = '🏆';
          description = 'Exceptional academic performance. You are at the top of your class.';
        } else if (cgpaNum >= 3.65) {
          standing = 'Higher Distinction'; cls = 'standing-excellent'; emoji = '🌟';
          description = 'Outstanding performance. You qualify for graduation with Higher Distinction (CGPA ≥ 3.65).';
        } else if (cgpaNum >= 3.50) {
          standing = 'Distinction'; cls = 'standing-excellent'; emoji = '⭐';
          description = 'Excellent academic record. You qualify for graduation with Distinction (CGPA ≥ 3.50).';
        } else if (cgpaNum >= 3.00) {
          standing = 'Good Standing'; cls = 'standing-good'; emoji = '✅';
          description = 'You are in good academic standing. Keep it up!';
        } else if (cgpaNum >= 2.50) {
          standing = 'Satisfactory'; cls = 'standing-good'; emoji = '👍';
          description = 'Acceptable academic performance. There is room to improve.';
        } else if (cgpaNum >= 2.00) {
          standing = 'Needs Improvement'; cls = 'standing-warning'; emoji = '⚠️';
          description = 'Your CGPA is below 2.50. Consistent improvement is needed to stay in good standing.';
        } else {
          standing = 'Academic Probation'; cls = 'standing-danger'; emoji = '❌';
          description = 'CGPA below 2.00 — you are on academic probation as per BRACU policy (Summer 2022+). Seek academic counselling immediately.';
        }

        standingBox.classList.add(cls);
        title.textContent  = standing;
        desc.textContent   = description;
        badge.textContent  = emoji;
      } else {
        standingBox.style.display = 'none';
      }

      // ── GPA TREND CHART ───────────────────────────────
      const trendBox = document.getElementById('trendChartBox');
      const trendCanvas = document.getElementById('trendCanvas');

      // Gather per-semester GPAs (only semesters with at least one graded course)
      const semGPAs = [];
      semesters.forEach(sem => {
        const gpa = calcSemGPA(sem, retakenKeys);
        if (gpa !== null) {
          // Get short label e.g. "Fall 25"
          const label = sem.name
            ? sem.name.replace(/\s*\(.*\)$/, '').replace(/(\d{4})/, y => "'" + y.slice(2))
            : `S${sem.id + 1}`;
          semGPAs.push({ label, gpa });
        }
      });

      if (semGPAs.length >= 2) {
        trendBox.style.display = '';

        // High / low range label
        const gpas = semGPAs.map(d => d.gpa);
        const first = gpas[0];
        const last  = gpas[gpas.length - 1];
        const diff  = last - first;
        let trendLabel, trendColor;
        if (Math.abs(diff) < 0.1) {
          trendLabel = '→ Stable';    trendColor = 'var(--text3)';
        } else if (diff > 0) {
          trendLabel = '↑ Improving'; trendColor = '#2ECC71';
        } else {
          trendLabel = '↓ Declining'; trendColor = '#e74c3c';
        }
        const trendEl = document.getElementById('trendRange');
        trendEl.textContent = trendLabel;
        trendEl.style.color = trendColor;
        trendEl.style.fontWeight = '600';

        // Draw on next frame so canvas has layout dimensions
        requestAnimationFrame(() => drawTrendChart(trendCanvas, semGPAs));
      } else {
        trendBox.style.display = 'none';
      }

      const pct = cgpa !== null ? Math.min((cgpa / 4) * 100, 100) : 0;
      document.getElementById('meterFill').style.width = pct + '%';
      document.getElementById('meterPct').textContent = cgpa !== null ? pct.toFixed(1) + '%' : '0%';

      const statusEl = document.getElementById('meterStatus');
      if (cgpa === null) {
        statusEl.innerHTML = 'Add your courses to get started.';
      } else if (cgpa >= 3.75) {
        statusEl.innerHTML = `<strong>Outstanding!</strong> CGPA ${cgpa.toFixed(2)} — Dean's List territory. Keep it up.`;
      } else if (cgpa >= 3.5) {
        statusEl.innerHTML = `<strong>Excellent.</strong> CGPA ${cgpa.toFixed(2)} — You're on track for a strong degree.`;
      } else if (cgpa >= 3.0) {
        statusEl.innerHTML = `<strong>Good standing.</strong> CGPA ${cgpa.toFixed(2)} — Push for 3.5 and you'll stand out.`;
      } else if (cgpa >= 2.5) {
        statusEl.innerHTML = `<strong>Keep pushing.</strong> CGPA ${cgpa.toFixed(2)} — Consider retaking weak courses for a boost.`;
      } else {
        statusEl.innerHTML = `<strong>Recovery mode.</strong> CGPA ${cgpa.toFixed(2)} — Focus on retakes and consistent grades from here.`;
      }

      runSimulator(cgpa, totalAttempted, totalPts);
    }

    function runSimulator(currentCgpa, currentCredits, currentPts) {
      const target = parseFloat(document.getElementById('targetCgpa').value);
      const remaining = parseFloat(document.getElementById('creditsRemaining').value);
      const resultEl = document.getElementById('simulatorResult');

      if (!target || !remaining || currentCgpa === null) {
        resultEl.innerHTML = 'Enter your target CGPA and remaining credits to see what you need.';
        return;
      }
      if (target > 4.0 || target < 0) {
        resultEl.innerHTML = '<span class="warn">Target CGPA must be between 0.0 and 4.0.</span>';
        return;
      }

      const totalCredits = currentCredits + remaining;
      const neededPts = target * totalCredits - currentPts;
      const neededGPA = neededPts / remaining;

      let msg = '';
      if (neededGPA <= 4.0 && neededGPA >= 0) {
        const difficulty = neededGPA >= 3.8 ? 'danger' : neededGPA >= 3.5 ? 'warn' : 'highlight';
        msg = `To reach CGPA <span class="highlight">${target.toFixed(2)}</span>, you need an average GPA of
               <span class="${difficulty}">${neededGPA.toFixed(2)}</span> across your remaining
               <span class="highlight">${remaining}</span> credits. `;
        if (neededGPA >= 3.9) msg += `This requires near-perfect grades every semester — <span class="danger">extremely difficult</span> but not impossible.`;
        else if (neededGPA >= 3.5) msg += `This is <span class="warn">challenging but achievable</span> with consistent effort and smart retakes.`;
        else if (neededGPA >= 3.0) msg += `This is <span class="highlight">very realistic</span> — stay consistent and avoid any D or F grades.`;
        else msg += `This is <span class="highlight">very achievable</span> — you're in a great position.`;
      } else if (neededGPA > 4.0) {
        msg = `<span class="danger">This target is mathematically out of reach</span> with ${remaining} credits remaining. ` +
              `Consider setting a target of <span class="highlight">${((4.0 * remaining + currentPts) / totalCredits).toFixed(2)}</span> as your ceiling, ` +
              `or increasing credits via retakes.`;
      } else {
        msg = `<span class="highlight">You've already achieved CGPA ${target.toFixed(2)}!</span> Set a higher goal.`;
      }
      resultEl.innerHTML = msg;
    }

    document.getElementById('targetCgpa').addEventListener('input', recalc);
    document.getElementById('creditsRemaining').addEventListener('input', recalc);
    document.getElementById('addSemesterBtn').addEventListener('click', () => addSemester());
    document.getElementById('addRunningSemBtn').addEventListener('click', () => addRunningSemester());

    // ── INIT ──────────────────────────────────────────────
    function initCalculator() {
      document.getElementById('deptCreditsText').textContent = '';
      document.getElementById('deptCredits').style.display = 'none';
      renderSemesters();
      recalc();
    }

    initCalculator();

    // ── CURSOR SYSTEM ─────────────────────────────────────
    const dot        = document.getElementById('cursor-dot');
    const ring       = document.getElementById('cursor-ring');
    const cursorGlow = document.getElementById('cursor-glow');
    const body       = document.body;

    let mX = window.innerWidth / 2,  mY = window.innerHeight / 2;
    let dX = mX, dY = mY;
    let rX = mX, rY = mY;
    let gX = mX, gY = mY;

    document.addEventListener('mousemove', e => { mX = e.clientX; mY = e.clientY; }, { passive: true });

    document.querySelectorAll('a, button, .feature-card, .nav-logo').forEach(el => {
      el.addEventListener('mouseenter', () => body.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => body.classList.remove('cursor-hover'));
    });
    document.querySelectorAll('select, textarea').forEach(el => {
      el.addEventListener('mouseenter', () => body.classList.add('cursor-text'));
      el.addEventListener('mouseleave', () => body.classList.remove('cursor-text'));
    });
    // P/F dropdown is dynamically rendered — use event delegation
    document.addEventListener('mouseover', e => {
      if (e.target.matches('.pf-select')) body.classList.add('cursor-text');
    });
    document.addEventListener('mouseout', e => {
      if (e.target.matches('.pf-select')) body.classList.remove('cursor-text');
    });
    document.addEventListener('mouseover', e => {
      if (e.target.matches('input, textarea')) body.classList.add('cursor-text');
    });
    document.addEventListener('mouseout', e => {
      if (e.target.matches('input, textarea')) body.classList.remove('cursor-text');
    });
    document.addEventListener('mousedown', () => body.classList.add('cursor-click'));
    document.addEventListener('mouseup',   () => body.classList.remove('cursor-click'));
    document.addEventListener('mouseleave', () => { dot.style.opacity = '0'; ring.style.opacity = '0'; cursorGlow.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { dot.style.opacity = '1'; ring.style.opacity = '1'; cursorGlow.style.opacity = '1'; });

    function animateCursor() {
      dX += (mX - dX) * 0.85; dY += (mY - dY) * 0.85;
      rX += (mX - rX) * 0.14; rY += (mY - rY) * 0.14;
      gX += (mX - gX) * 0.07; gY += (mY - gY) * 0.07;
      dot.style.left  = dX + 'px'; dot.style.top   = dY + 'px';
      ring.style.left = rX + 'px'; ring.style.top  = rY + 'px';
      cursorGlow.style.left = gX + 'px'; cursorGlow.style.top = gY + 'px';
      requestAnimationFrame(animateCursor);
    }
    animateCursor();

    document.querySelectorAll('.magnetic').forEach(el => {
      el.addEventListener('mousemove', e => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        el.style.transform = `translate(${(e.clientX - cx) * 0.35}px, ${(e.clientY - cy) * 0.35}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = 'translate(0,0)'; });
    });

    // ── DOT MATRIX ────────────────────────────────────────
    (function() {
      const canvas = document.getElementById('dot-matrix');
      const ctx    = canvas.getContext('2d');
      const SPACING = 28, BASE_R = 1.1, MAX_R = 3.2, REACH = 140, BASE_A = 0.13, MAX_A = 0.72;
      let W, H, cols, rows, cx = -999, cy = -999;

      function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
        cols = Math.ceil(W / SPACING) + 1;
        rows = Math.ceil(H / SPACING) + 1;
      }
      resize();
      window.addEventListener('resize', resize);
      window.addEventListener('mousemove', e => { cx = e.clientX; cy = e.clientY; }, { passive: true });
      window.addEventListener('mouseleave', () => { cx = -999; cy = -999; });

      function isLight() { return document.documentElement.dataset.theme === 'light'; }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        const light = isLight();
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = col * SPACING, y = row * SPACING;
            const dist = Math.sqrt((x-cx)**2 + (y-cy)**2);
            const ease = Math.max(0, 1 - dist / REACH) ** 2;
            const r = BASE_R + (MAX_R - BASE_R) * ease;
            const a = BASE_A + (MAX_A - BASE_A) * ease;
            const dotColor = light
              ? `rgba(10, ${Math.round(120 + 80*ease)}, 50, ${a})`
              : `rgba(46, ${Math.round(180 + 60*ease)}, ${Math.round(80 - 60*ease)}, ${a})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = dotColor;
            ctx.fill();
          }
        }
        requestAnimationFrame(draw);
      }
      draw();
      themeBtn.addEventListener('click', () => { ctx.clearRect(0, 0, W, H); });
    })();

    window.addEventListener('resize', () => {
      clearTimeout(window._resizeTimer);
      window._resizeTimer = setTimeout(recalc, 150);
    });