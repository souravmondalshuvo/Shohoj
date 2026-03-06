// ── THEME TOGGLE ─────────────────────────────────────
    const html = document.documentElement;
    const themeBtn = document.getElementById('themeToggle');
    const pill = document.getElementById('togglePill');
    // Start in dark mode — pill on right, moon icon
    pill.textContent = '🌙';
    themeBtn.addEventListener('click', () => {
      const isDark = html.dataset.theme === 'dark';
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
      // add glass to nav only after scrolling past hero badge area
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
        orb.style.transform += '';
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
      'F':  0.00, 'P':  null, 'I': null
    };

    // reverse map: grade point → letter grade
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
      // exact match first
      for (const [pt, letter] of POINTS_TO_GRADE) {
        if (Math.abs(n - pt) < 0.01) return letter;
      }
      // closest match
      let closest = null, minDiff = Infinity;
      for (const [pt, letter] of POINTS_TO_GRADE) {
        const diff = Math.abs(n - pt);
        if (diff < minDiff) { minDiff = diff; closest = letter; }
      }
      return minDiff <= 0.20 ? closest : '';
    }
    const SEMESTER_NAMES = [
      'Fall 2024','Spring 2025','Summer 2025','Fall 2025',
      'Spring 2026','Summer 2026','Fall 2026','Spring 2027',
      'Spring 2028','Summer 2028','Fall 2028','Spring 2029'
    ];

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
    // Flat list of every course across all depts for autocomplete
    // Build course DB from all dept presets — stored separately so always available
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
          onmousedown="pickSuggestion(${semId},${cIdx},'${c.full.replace(/'/g,"\'")}',${c.credits})">
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

      // tier 1: exact code match first
      // tier 2: code starts with val
      // tier 3: code contains val
      // tier 4: name contains val
      const exactMatch = COURSE_DB[raw.toUpperCase()];
      const t1 = exactMatch ? [exactMatch] : [];
      const t2 = ALL_COURSES.filter(c => c !== exactMatch && c.code.toLowerCase().startsWith(val));
      const t3 = ALL_COURSES.filter(c => c !== exactMatch && !t2.includes(c) && c.code.toLowerCase().includes(val));
      const t4 = ALL_COURSES.filter(c => c !== exactMatch && !t2.includes(c) && !t3.includes(c) && c.name.toLowerCase().includes(val));

      const matches = [...t1, ...t2, ...t3, ...t4].slice(0, 8);

      if (!matches.length) { portal.innerHTML = ''; return; }

      // ALWAYS show dropdown — let user see and choose
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

    // close on scroll/resize reposition
    window.addEventListener('scroll', () => {
      if (activeInput && portal.innerHTML) {
        portal.innerHTML = '';
      }
    }, { passive: true });

    function pickSuggestion(semId, cIdx, fullName, credits) {
      portal.innerHTML = '';
      const sem = semesters.find(s => s.id === semId);
      if (!sem) return;
      sem.courses[cIdx].name    = fullName;
      sem.courses[cIdx].credits = credits;

      // update DOM in-place — no re-render so input stays alive
      const block = document.getElementById(`sem-${semId}`);
      if (block) {
        // +2 because first child is lg-shine, second is course-header row
        const rows = block.querySelectorAll('.course-row:not(.course-header)');
        const row  = rows[cIdx];
        if (row) {
          const nameInput = row.querySelector('.course-input-wrap input');
          const creditSpan = row.querySelector('.credits-static');
          if (nameInput)  nameInput.value = fullName;
          if (creditSpan) creditSpan.textContent = credits;
          // focus grade point
          const gp = row.querySelector('input[inputmode="decimal"]');
          if (gp) setTimeout(() => gp.focus(), 30);
        }
      }
      recalc();
    }

    function onDeptChange() {
      const sel = document.getElementById('deptSelect');
      currentDept = sel.value;
      if (!currentDept) return;
      const dept = DEPARTMENTS[currentDept];
      // show & update credits badge
      const creditsEl = document.getElementById('deptCredits');
      if (creditsEl) creditsEl.style.display = 'inline-flex';
      document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
      // reset calculator with blank courses (no grades pre-filled)
      semesters = [];
      semesterCounter = 0;
      dept.presets.forEach(p => {
        const id = semesterCounter++;
        semesters.push({ id, name: p.name, courses: p.courses.map(c => ({
          name: '', credits: c.credits, grade: '', gradePoint: ''
        })) });
      });
      renderSemesters();
      recalc();
    }

    let semesters = [];
    let semesterCounter = 0;

    function gradeSelect(selected = '') {
      return `<select onchange="recalc()">
        <option value="">Grade</option>
        ${Object.keys(GRADES).map(g =>
          `<option value="${g}" ${g === selected ? 'selected' : ''}>${g}</option>`
        ).join('')}
      </select>`;
    }

    function addSemester(prefill = null) {
      const id = semesterCounter++;
      const name = SEMESTER_NAMES[semesters.length] || `Semester ${semesters.length + 1}`;
      const courses = prefill || [{ name: '', credits: 3, grade: '' }];
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
      if (sem) { sem.courses.push({ name: '', credits: 3, grade: '' }); }
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

    function renderSemesters() {
      const container = document.getElementById('semestersContainer');
      document.getElementById('semesterCount').textContent = semesters.length;

      container.innerHTML = semesters.map(sem => {
        const gpa = calcSemGPA(sem);
        return `
        <div class="semester-block lg-surface" id="sem-${sem.id}"><div class="lg-shine"></div>
          <div class="semester-head">
            <div class="semester-head-left">
              <span class="semester-label">${sem.name}</span>
              ${gpa !== null ? `<span class="semester-gpa-badge">GPA ${gpa.toFixed(2)}</span>` : ''}
            </div>
            <div class="semester-actions">
              <button class="btn-icon danger" onclick="removeSemester(${sem.id})">Remove</button>
            </div>
          </div>
          <div class="courses-table">
            <div class="course-row course-header">
              <span>Course</span>
              <span style="text-align:center;">Credits</span>
              <span style="text-align:center;">Grade Point</span>
              <span style="text-align:center;">Grade</span>
              <span></span>
            </div>
            ${sem.courses.map((c, i) => `
            <div class="course-row">
              <div class="course-input-wrap">
                <input type="text" placeholder="Type course code, e.g. CSE110"
                  value="${c.name}"
                  autocomplete="off"
                  oninput="onCourseInput(event,${sem.id},${i})"
                  onkeydown="onCourseKey(event,${sem.id},${i})"
                  onblur="setTimeout(()=>closeSuggestions('sug-${sem.id}-${i}'),180)" />
                <div class="course-suggestions" id="sug-${sem.id}-${i}"></div>
              </div>
              <span class="credits-static">${c.credits}</span>
              <input type="text" inputmode="decimal" placeholder="0.0 – 4.0"
                value="${c.gradePoint !== undefined ? c.gradePoint : (c.grade && GRADES[c.grade] !== null ? GRADES[c.grade] : '')}"
                oninput="autoDetectGrade(${sem.id},${i},this.value,this)"
                style="text-align:center;" />
              <span class="grade-letter" id="gl-${sem.id}-${i}"
                style="color:${
                  c.grade === 'F' ? '#e74c3c' :
                  c.grade && c.grade.startsWith('A') ? '#2ECC71' :
                  c.grade && c.grade.startsWith('B') ? '#27ae60' :
                  c.grade && c.grade.startsWith('C') ? '#F0A500' :
                  c.grade && c.grade.startsWith('D') ? '#e67e22' :
                  'var(--text3)'
                }">${c.grade || '—'}</span>
              <button class="btn-remove-course" onclick="removeCourse(${sem.id},${i})">×</button>
            </div>`).join('')}
          </div>
          <div class="add-course-row">
            <button class="btn-add-course" onclick="addCourse(${sem.id})">+ Add course</button>
          </div>
        </div>`;
      }).join('');
    }

    function updateCourse(semId, cIdx, field, value) {
      const sem = semesters.find(s => s.id === semId);
      if (sem) {
        sem.courses[cIdx][field] = field === 'credits' ? parseFloat(value) || 0 : value;
        recalc();
        const gpa = calcSemGPA(sem);
        const block = document.getElementById(`sem-${semId}`);
        if (block) {
          const badge = block.querySelector('.semester-gpa-badge');
          if (badge && gpa !== null) badge.textContent = `GPA ${gpa.toFixed(2)}`;
          else if (!badge && gpa !== null) {
            block.querySelector('.semester-head-left')
              .insertAdjacentHTML('beforeend', `<span class="semester-gpa-badge">GPA ${gpa.toFixed(2)}</span>`);
          }
        }
      }
    }

    function autoDetectGrade(semId, cIdx, val, inputEl) {
      const letter = detectGrade(val);
      const sem = semesters.find(s => s.id === semId);
      if (sem) {
        sem.courses[cIdx].grade = letter;
        sem.courses[cIdx].gradePoint = val;
        // update the letter badge next to input
        const badge = document.getElementById(`gl-${semId}-${cIdx}`);
        if (badge) {
          badge.textContent = letter;
          badge.style.color = letter === 'F' ? '#e74c3c' :
                              letter.startsWith('A') ? '#2ECC71' :
                              letter.startsWith('B') ? '#27ae60' :
                              letter.startsWith('C') ? '#F0A500' :
                              letter.startsWith('D') ? '#e67e22' : 'var(--text3)';
        }
        // flash input border green if matched
        if (letter) {
          inputEl.style.borderColor = 'rgba(46,204,113,0.6)';
          setTimeout(() => inputEl.style.borderColor = '', 600);
        }
        recalc();
        const gpa = calcSemGPA(sem);
        const block = document.getElementById(`sem-${semId}`);
        if (block) {
          const badge2 = block.querySelector('.semester-gpa-badge');
          if (badge2 && gpa !== null) badge2.textContent = `GPA ${gpa.toFixed(2)}`;
          else if (!badge2 && gpa !== null) {
            block.querySelector('.semester-head-left')
              .insertAdjacentHTML('beforeend', `<span class="semester-gpa-badge">GPA ${gpa.toFixed(2)}</span>`);
          }
        }
      }
    }

    function calcSemGPA(sem) {
      let pts = 0, creds = 0;
      for (const c of sem.courses) {
        const gp = GRADES[c.grade];
        if (gp === null || gp === undefined || !c.credits) continue;
        if (c.grade === 'P') continue;
        pts += gp * c.credits;
        creds += c.credits;
      }
      return creds > 0 ? pts / creds : null;
    }

    function recalc() {
      let totalPts = 0, totalAttempted = 0, totalEarned = 0;

      for (const sem of semesters) {
        for (const c of sem.courses) {
          const gp = GRADES[c.grade];
          if (gp === undefined || !c.credits) continue;
          if (c.grade === 'P' || c.grade === 'I') continue;
          totalAttempted += c.credits;
          totalPts += gp * c.credits;
          if (gp > 0) totalEarned += c.credits;
        }
      }

      const cgpa = totalAttempted > 0 ? totalPts / totalAttempted : null;

      // Update display
      const cgpaEl = document.getElementById('cgpaVal');
      cgpaEl.textContent = cgpa !== null ? cgpa.toFixed(2) : '—';
      cgpaEl.style.color = cgpa === null ? 'var(--text3)' :
        cgpa >= 3.5 ? '#2ECC71' : cgpa >= 3.0 ? '#27ae60' :
        cgpa >= 2.5 ? '#F0A500' : '#e74c3c';

      document.getElementById('totalAttempted').textContent = totalAttempted.toFixed(1);
      document.getElementById('totalEarned').textContent = totalEarned.toFixed(1);

      // Meter
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

      // Simulator
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

    // Simulator live update
    document.getElementById('targetCgpa').addEventListener('input', () => {
      const cgpa = parseFloat(document.getElementById('cgpaVal').textContent);
      const attempted = parseFloat(document.getElementById('totalAttempted').textContent);
      // recalc handles it
      recalc();
    });
    document.getElementById('creditsRemaining').addEventListener('input', recalc);

    // Add semester button
    document.getElementById('addSemesterBtn').addEventListener('click', () => addSemester());

    // ── INIT ──────────────────────────────────────────────
    function initCalculator() {
      // start blank — user selects dept first
      document.getElementById('deptCreditsText').textContent = '';
      document.getElementById('deptCredits').style.display = 'none';
      renderSemesters();
      recalc();
    }

    function initCalculatorFOUNDER() {
      // load CSE presets with founder's actual grades filled in (kept for reference)
      const founderData = [
        { name: 'Fall 2024', courses: [
          { name: 'Programming Language I (CSE110)', credits: 3, grade: 'C-' },
          { name: 'Fundamentals of English (ENG101)', credits: 3, grade: 'B+' },
          { name: 'Remedial Mathematics (MAT092)',   credits: 0, grade: 'P'  },
          { name: 'Principles of Physics I (PHY111)', credits: 3, grade: 'B-' },
        ]},
        { name: 'Spring 2025', courses: [
          { name: 'Programming Language II (CSE111)', credits: 3, grade: 'F'  },
          { name: 'Discrete Mathematics (CSE230)',    credits: 3, grade: 'D+' },
          { name: 'Differential Calculus (MAT110)',   credits: 3, grade: 'B'  },
          { name: 'Principles of Physics II (PHY112)', credits: 3, grade: 'B-' },
        ]},
        { name: 'Summer 2025', courses: [
          { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: 'A-' },
          { name: 'Emergence of Bangladesh (EMB101)',      credits: 3, grade: 'B-' },
          { name: 'English Composition I (ENG102)',        credits: 3, grade: 'B'  },
          { name: 'Ethics and Culture (HUM103)',           credits: 3, grade: 'B'  },
        ]},
        { name: 'Fall 2025', courses: [
          { name: 'Programming Language II (CSE111)', credits: 3, grade: 'C+' },
          { name: 'Integral Calculus (MAT120)',        credits: 3, grade: 'B'  },
          { name: 'Statistics & Probability (STA201)', credits: 3, grade: 'D'  },
        ]},
      ];
      founderData.forEach(sem => {
        const id = semesterCounter++;
        semesters.push({ id, name: sem.name, courses: sem.courses });
      });
      document.getElementById('deptCreditsText').textContent = '136 Total Credits';
      renderSemesters();
      recalc();
      document.getElementById('creditsRemaining').value = 97;
      document.getElementById('targetCgpa').value = 3.50;
      recalc();
    }

    initCalculator();
  
    // ── CURSOR SYSTEM ─────────────────────────────────────
    const dot       = document.getElementById('cursor-dot');
    const ring      = document.getElementById('cursor-ring');
    const cursorGlow = document.getElementById('cursor-glow');
    const body      = document.body;

    let mX = window.innerWidth / 2,  mY = window.innerHeight / 2;
    let dX = mX, dY = mY;
    let rX = mX, rY = mY;
    let gX = mX, gY = mY;

    document.addEventListener('mousemove', e => {
      mX = e.clientX; mY = e.clientY;
    }, { passive: true });

    // cursor states
    document.querySelectorAll('a, button, .feature-card, .nav-logo').forEach(el => {
      el.addEventListener('mouseenter', () => body.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => body.classList.remove('cursor-hover'));
    });
    document.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('mouseenter', () => body.classList.add('cursor-text'));
      el.addEventListener('mouseleave', () => body.classList.remove('cursor-text'));
    });
    document.addEventListener('mousedown', () => body.classList.add('cursor-click'));
    document.addEventListener('mouseup',   () => body.classList.remove('cursor-click'));

    document.addEventListener('mouseleave', () => {
      dot.style.opacity = '0'; ring.style.opacity = '0';
      cursorGlow.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
      dot.style.opacity = '1'; ring.style.opacity = '1';
      cursorGlow.style.opacity = '1';
    });

    function animateCursor() {
      dX += (mX - dX) * 0.85;
      dY += (mY - dY) * 0.85;
      rX += (mX - rX) * 0.14;
      rY += (mY - rY) * 0.14;
      gX += (mX - gX) * 0.07;
      gY += (mY - gY) * 0.07;

      dot.style.left  = dX + 'px';
      dot.style.top   = dY + 'px';
      ring.style.left = rX + 'px';
      ring.style.top  = rY + 'px';
      cursorGlow.style.left = gX + 'px';
      cursorGlow.style.top  = gY + 'px';

      requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // ── MAGNETIC ELEMENTS ─────────────────────────────────
    document.querySelectorAll('.magnetic').forEach(el => {
      el.addEventListener('mousemove', e => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const dx = (e.clientX - cx) * 0.35;
        const dy = (e.clientY - cy) * 0.35;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'translate(0,0)';
      });
    });


    // ── DOT MATRIX ────────────────────────────────────────
    (function() {
      const canvas = document.getElementById('dot-matrix');
      const ctx    = canvas.getContext('2d');

      const SPACING   = 28;    // gap between dots
      const BASE_R    = 1.1;   // resting dot radius
      const MAX_R     = 3.2;   // max radius near cursor
      const REACH     = 140;   // cursor influence radius (px)
      const BASE_A    = 0.13;  // resting opacity
      const MAX_A     = 0.72;  // max opacity near cursor

      let W, H, cols, rows;
      let cx = -999, cy = -999; // cursor position

      function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
        cols = Math.ceil(W / SPACING) + 1;
        rows = Math.ceil(H / SPACING) + 1;
      }
      resize();
      window.addEventListener('resize', resize);

      // track cursor globally (already tracked by cursor system, but keep independent)
      window.addEventListener('mousemove', e => {
        cx = e.clientX; cy = e.clientY;
      }, { passive: true });
      window.addEventListener('mouseleave', () => { cx = -999; cy = -999; });

      function isLight() {
        return document.documentElement.dataset.theme === 'light';
      }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        const light = isLight();

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = col * SPACING;
            const y = row * SPACING;

            const dx   = x - cx;
            const dy   = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // proximity factor 0→1
            const prox = Math.max(0, 1 - dist / REACH);
            // ease with power curve for smooth falloff
            const ease = prox * prox;

            const r = BASE_R + (MAX_R - BASE_R) * ease;
            const a = BASE_A + (MAX_A - BASE_A) * ease;

            // colour: green tint when lit, neutral when resting
            let dotColor;
            if (light) {
              // light mode: dark green dots
              const g = Math.round(120 + 80 * ease);
              dotColor = `rgba(10, ${g}, 50, ${a})`;
            } else {
              // dark mode: green-tinted dots
              const g = Math.round(180 + 60 * ease);
              const b = Math.round(80  - 60 * ease);
              dotColor = `rgba(46, ${g}, ${b}, ${a})`;
            }

            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = dotColor;
            ctx.fill();
          }
        }
        requestAnimationFrame(draw);
      }
      draw();

      // re-draw when theme toggles
      themeBtn.addEventListener('click', () => { ctx.clearRect(0, 0, W, H); });
    })();