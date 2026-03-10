// ── THEME TOGGLE ─────────────────────────────────────
    const html = document.documentElement;
    const themeBtn = document.getElementById('themeToggle');
    const pill = document.getElementById('togglePill');
    // Restore saved theme or default to dark
    let savedTheme = 'dark';
    try {
      const _raw = localStorage.getItem('shohoj_theme');
      if (_raw === 'dark' || _raw === 'light') savedTheme = _raw;
    } catch(e) {}
    html.dataset.theme = savedTheme;
    pill.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
    themeBtn.addEventListener('click', () => {
      const isDark = html.dataset.theme === 'dark';
      const newTheme = isDark ? 'light' : 'dark';
      html.dataset.theme = newTheme;
      pill.textContent = isDark ? '☀️' : '🌙';
      try { localStorage.setItem('shohoj_theme', newTheme); } catch(e) {}
      setTimeout(recalc, 30);
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
        label: 'B.Sc. in Computer Science and Engineering (CSE)',
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
    // ── COMPREHENSIVE BRACU COURSE CATALOG ───────────────
    // Covers CSE, EEE, BBA, ECO, ENG, LAW, PHR, ARC, BIO, CHE + GED
    const COURSE_DB = {};
    const _CATALOG = [
      // ── GED / Common ─────────────────────────────────
      ['BNG103','Bangla Language and Literature',3],
      ['EMB101','Emergence of Bangladesh',3],
      ['ENG101','Fundamentals of English',3],
      ['ENG102','English Composition I',3],
      ['HUM103','Ethics and Culture',3],
      ['MAT092','Remedial Course in Mathematics',0],
      ['PHY111','Principles of Physics I',3],
      ['PHY112','Principles of Physics II',3],
      ['MAT110','Mathematics I: Differential Calculus & Coordinate Geometry',3],
      ['MAT120','Mathematics II: Integral Calculus & Differential Equations',3],
      ['MAT215','Mathematics III: Complex Variables & Laplace Transformations',3],
      ['STA201','Elements of Statistics and Probability',3],
      ['SOC101','Introduction to Sociology',3],
      ['POL101','Introduction to Political Science',3],
      ['ECO101','Principles of Microeconomics',3],
      ['ECO102','Principles of Macroeconomics',3],
      // ── CSE ──────────────────────────────────────────
      ['CSE110','Programming Language I',3],
      ['CSE111','Programming Language II',3],
      ['CSE220','Data Structures',3],
      ['CSE221','Algorithms',3],
      ['CSE230','Discrete Mathematics',3],
      ['CSE250','Computer Organization and Architecture',3],
      ['CSE251','Digital Logic Design',3],
      ['CSE260','Database Systems',3],
      ['CSE310','Operating Systems',3],
      ['CSE320','Computer Networks',3],
      ['CSE330','Software Engineering',3],
      ['CSE340','Theory of Computation',3],
      ['CSE341','Programming Language Concepts',3],
      ['CSE350','Computer Graphics',3],
      ['CSE360','Artificial Intelligence',3],
      ['CSE361','Machine Learning',3],
      ['CSE370','Computer Security',3],
      ['CSE400','Computer Science and Engineering Project',3],
      ['CSE401','Computer Science and Engineering Thesis',6],
      ['CSE410','Compiler Design',3],
      ['CSE420','Microprocessor and Assembly Language',3],
      ['CSE421','Embedded Systems',3],
      ['CSE422','Internet of Things',3],
      ['CSE425','VLSI Design',3],
      ['CSE430','Numerical Methods',3],
      ['CSE431','Simulation and Modeling',3],
      ['CSE432','High Performance Computing',3],
      ['CSE440','Software Project Management',3],
      ['CSE445','Human Computer Interaction',3],
      ['CSE446','Mobile Application Development',3],
      ['CSE447','Web Technologies',3],
      ['CSE450','Computer Vision',3],
      ['CSE451','Natural Language Processing',3],
      ['CSE452','Deep Learning',3],
      ['CSE460','Information Retrieval',3],
      ['CSE461','Data Mining',3],
      ['CSE465','Bioinformatics',3],
      ['CSE470','Cryptography',3],
      ['CSE471','Network Security',3],
      ['CSE480','Game Development',3],
      ['CSE483','Cloud Computing',3],
      ['CSE484','Distributed Systems',3],
      ['CSE490','Special Topics in CSE',3],
      ['CSE499','Senior Design Project',3],
      // ── EEE ──────────────────────────────────────────
      ['EEE101','Introduction to Electrical Engineering',3],
      ['EEE102','Electrical Circuits I',3],
      ['EEE201','Electrical Circuits II',3],
      ['EEE202','Electronic Devices and Circuits I',3],
      ['EEE203','Electronic Devices and Circuits II',3],
      ['EEE204','Signals and Systems',3],
      ['EEE205','Electromagnetic Fields and Waves',3],
      ['EEE206','Engineering Mathematics',3],
      ['EEE210','Digital Electronics',3],
      ['EEE211','Electrical Machines I',3],
      ['EEE212','Electrical Machines II',3],
      ['EEE301','Control Systems',3],
      ['EEE302','Communication Theory',3],
      ['EEE303','Microprocessors and Interfacing',3],
      ['EEE304','Digital Signal Processing',3],
      ['EEE305','Power Electronics',3],
      ['EEE306','Power Systems I',3],
      ['EEE307','Power Systems II',3],
      ['EEE311','VLSI Design',3],
      ['EEE312','Antenna and Wave Propagation',3],
      ['EEE313','Wireless Communications',3],
      ['EEE401','Fiber Optic Communications',3],
      ['EEE402','Satellite Communications',3],
      ['EEE403','Digital Communications',3],
      ['EEE404','Computer Networks for EEE',3],
      ['EEE405','Robotics and Automation',3],
      ['EEE406','Renewable Energy Systems',3],
      ['EEE411','Industrial Instrumentation',3],
      ['EEE412','Biomedical Engineering',3],
      ['EEE413','High Voltage Engineering',3],
      ['EEE421','EEE Project',3],
      ['EEE422','EEE Thesis',6],
      ['EEE430','Image Processing',3],
      ['EEE431','Machine Learning for Engineers',3],
      ['EEE490','Special Topics in EEE',3],
      // ── BBA ──────────────────────────────────────────
      ['ACC101','Introduction to Financial Accounting',3],
      ['ACC201','Introduction to Management Accounting',3],
      ['ACC301','Intermediate Accounting I',3],
      ['ACC302','Intermediate Accounting II',3],
      ['ACC303','Advanced Accounting',3],
      ['ACC311','Cost and Management Accounting',3],
      ['ACC401','Auditing and Assurance',3],
      ['ACC402','Taxation',3],
      ['BUS101','Introduction to Business',3],
      ['BUS102','Business Communication',3],
      ['BUS201','Business Statistics',3],
      ['BUS202','Business Mathematics',3],
      ['BUS211','Business Law',3],
      ['BUS301','Entrepreneurship and Innovation',3],
      ['BUS302','Research Methods in Business',3],
      ['BUS401','Business Policy and Strategy',3],
      ['BUS499','BBA Internship',3],
      ['ECO201','Intermediate Microeconomics',3],
      ['ECO211','Intermediate Macroeconomics',3],
      ['ECO212','Bangladesh Economy',3],
      ['ECO301','Managerial Economics',3],
      ['ECO311','International Economics',3],
      ['ECO321','Development Economics',3],
      ['ECO331','Monetary Economics',3],
      ['FIN201','Principles of Finance',3],
      ['FIN301','Financial Management',3],
      ['FIN302','Investment Analysis and Portfolio Management',3],
      ['FIN303','Financial Markets and Institutions',3],
      ['FIN311','Corporate Finance',3],
      ['FIN312','International Finance',3],
      ['FIN401','Advanced Financial Management',3],
      ['HRM301','Human Resource Management',3],
      ['HRM302','Organizational Behavior',3],
      ['HRM303','Compensation Management',3],
      ['HRM401','Strategic HRM',3],
      ['MGT101','Principles of Management',3],
      ['MGT201','Organizational Theory and Design',3],
      ['MGT301','Operations Management',3],
      ['MGT302','Project Management',3],
      ['MGT401','Supply Chain Management',3],
      ['MKT201','Principles of Marketing',3],
      ['MKT301','Consumer Behavior',3],
      ['MKT302','Marketing Research',3],
      ['MKT303','Advertising and Promotion',3],
      ['MKT401','Strategic Marketing',3],
      ['MKT402','Digital Marketing',3],
      ['MKT403','International Marketing',3],
      // ── English ───────────────────────────────────────
      ['ENG111','Introduction to Literature',3],
      ['ENG121','Introduction to Linguistics',3],
      ['ENG201','British Literature I',3],
      ['ENG202','British Literature II',3],
      ['ENG211','American Literature',3],
      ['ENG212','World Literature in English',3],
      ['ENG221','Introduction to Language Studies',3],
      ['ENG222','Phonetics and Phonology',3],
      ['ENG223','Morphology and Syntax',3],
      ['ENG224','Semantics and Pragmatics',3],
      ['ENG225','Sociolinguistics',3],
      ['ENG226','Psycholinguistics',3],
      ['ENG301','Literary Theory and Criticism',3],
      ['ENG302','Postcolonial Literature',3],
      ['ENG303','South Asian Literature',3],
      ['ENG304','Bangladesh Literature in English',3],
      ['ENG311','Applied Linguistics',3],
      ['ENG312','Language Acquisition',3],
      ['ENG313','Discourse Analysis',3],
      ['ENG314','English for Specific Purposes',3],
      ['ENG401','Advanced Literary Studies',3],
      ['ENG411','Research Methods',3],
      ['ENG412','ELT Methodology',3],
      ['ENG421','Creative Writing',3],
      ['ENG422','Translation Studies',3],
      ['ENG431','English Thesis',6],
      // ── Law ───────────────────────────────────────────
      ['LAW101','Legal System of Bangladesh',3],
      ['LAW111','Law of Contract',3],
      ['LAW201','Constitutional Law',3],
      ['LAW211','Law of Tort',3],
      ['LAW221','Criminal Law',3],
      ['LAW222','Evidence Law',3],
      ['LAW301','Administrative Law',3],
      ['LAW302','Company Law',3],
      ['LAW311','Civil Procedure Code',3],
      ['LAW312','Criminal Procedure Code',3],
      ['LAW321','Land Law',3],
      ['LAW322','Family Law',3],
      ['LAW331','International Law',3],
      ['LAW332','Intellectual Property Law',3],
      ['LAW333','Environmental Law',3],
      ['LAW401','Jurisprudence',3],
      ['LAW411','Arbitration and Alternative Dispute Resolution',3],
      ['LAW412','Banking Law',3],
      ['LAW421','Tax Law',3],
      ['LAW422','Labour Law',3],
      ['LAW431','Moot Court and Legal Drafting',3],
      ['LAW432','Human Rights Law',3],
      // ── Pharmacy ─────────────────────────────────────
      ['PHR101','Pharmaceutics I',3],
      ['PHR102','Pharmaceutical Chemistry I',3],
      ['PHR103','Human Anatomy and Physiology I',3],
      ['PHR104','Human Anatomy and Physiology II',3],
      ['PHR201','Pharmaceutics II',3],
      ['PHR202','Pharmaceutical Chemistry II',3],
      ['PHR203','Pharmacology I',3],
      ['PHR204','Pharmacology II',3],
      ['PHR211','Microbiology',3],
      ['PHR212','Biochemistry',3],
      ['PHR301','Pharmaceutical Analysis',3],
      ['PHR302','Clinical Pharmacy',3],
      ['PHR303','Industrial Pharmacy',3],
      ['PHR311','Pharmacokinetics',3],
      ['PHR312','Toxicology',3],
      ['PHR321','Biotechnology',3],
      ['PHR322','Pharmaceutical Microbiology',3],
      ['PHR331','Pharmacy Practice',3],
      ['PHR332','Drug Regulatory Affairs',3],
      ['PHR401','Pharmaceutical Research',3],
      ['PHR402','Pharmacoeconomics',3],
      ['PHR403','Pharmacy Thesis',6],
      // ── Architecture ─────────────────────────────────
      ['ARC101','Architectural Design Studio I',6],
      ['ARC102','Architectural Design Studio II',6],
      ['ARC111','History of Architecture I',3],
      ['ARC112','History of Architecture II',3],
      ['ARC121','Architectural Graphics',3],
      ['ARC122','Building Construction I',3],
      ['ARC201','Architectural Design Studio III',6],
      ['ARC202','Architectural Design Studio IV',6],
      ['ARC211','History of Architecture III',3],
      ['ARC212','Urban Design',3],
      ['ARC221','Building Construction II',3],
      ['ARC222','Building Structures I',3],
      ['ARC301','Architectural Design Studio V',6],
      ['ARC302','Architectural Design Studio VI',6],
      ['ARC311','Building Services',3],
      ['ARC312','Environmental Science in Architecture',3],
      ['ARC321','Professional Practice',3],
      ['ARC322','Landscape Architecture',3],
      ['ARC331','Building Structures II',3],
      ['ARC401','Architectural Design Studio VII',6],
      ['ARC402','Architectural Design Studio VIII',6],
      ['ARC411','Architecture Thesis Project',12],
      // ── Biotechnology ─────────────────────────────────
      ['BIO101','Introduction to Biology',3],
      ['BIO102','Cell Biology',3],
      ['BIO201','Genetics',3],
      ['BIO202','Molecular Biology',3],
      ['BIO203','Biochemistry for Biotech',3],
      ['BIO204','Microbiology for Biotech',3],
      ['BIO301','Genetic Engineering',3],
      ['BIO302','Immunology',3],
      ['BIO303','Bioinformatics',3],
      ['BIO401','Biotechnology Thesis',6],
      // ── Chemical Engineering ──────────────────────────
      ['CHE101','Introduction to Chemical Engineering',3],
      ['CHE102','Chemistry I',3],
      ['CHE103','Chemistry II',3],
      ['CHE201','Chemical Engineering Thermodynamics',3],
      ['CHE202','Fluid Mechanics',3],
      ['CHE203','Heat Transfer',3],
      ['CHE301','Mass Transfer',3],
      ['CHE302','Chemical Reaction Engineering',3],
      ['CHE303','Process Control',3],
      ['CHE401','Plant Design',3],
      ['CHE402','Chemical Engineering Thesis',6],
    ];
    _CATALOG.forEach(([code, name, credits]) => {
      const full = `${name} (${code})`;
      COURSE_DB[code] = { code, name, credits, full };
    });
    // Also pull in any preset courses not already in catalog
    Object.values(DEPARTMENTS).forEach(dept => {
      dept.presets.forEach(sem => {
        sem.courses.forEach(c => {
          const match = c.name.match(/\(([A-Z]{2,4}\d{3}[A-Z]?)\)$/);
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

    function onCourseBlur(e, semId, cIdx) {
      const sem = semesters.find(s => s.id === semId);
      if (!sem || !sem.courses[cIdx]) return;
      const val = e.target.value.trim();
      // Only write back if value differs from stored (avoids unnecessary re-renders)
      if (sem.courses[cIdx].name !== val) {
        sem.courses[cIdx].name = val;
        // Don't re-render (would steal focus) — just recalc and save
        recalc();
      }
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
      // clear semesters until user confirms (skip if just restored from storage)
      if (_restoredFromStorage) {
        _restoredFromStorage = false; // consume the flag — next dept change WILL wipe
      } else {
        semesters = [];
        semesterCounter = 0;
      }
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
      // Skip rebuild if data was just restored from storage
      if (_restoredFromStorage) {
        _restoredFromStorage = false;
        renderSemesters();
        recalc();
        return;
      }

      semesters = [];
      semesterCounter = 0;
      clearState(); // wipe saved state when starting fresh

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
    let _restoredFromStorage = false; // prevents Let's go / dept change from wiping restored data

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
      const completedCount = semesters.filter(s => !s.running).length;
      const allNames = generateSemesterNames(getStartSeason(), getStartYear(), completedCount + 1);
      const name = allNames[completedCount] || `Semester ${completedCount + 1}`;
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

    function getRetakenKeys(semList) {
      const list = semList || semesters;
      const bestGrade = usesBestGradePolicy();

      // Flatten all courses with position info, in semester order
      const all = [];
      list.forEach(sem => {
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

    function getSemCreditWarning(sem) {
      // Only count credit-bearing courses (exclude P/F and empty rows)
      const total = sem.courses.reduce((sum, c) => {
        if (!c.name.trim() || !c.credits) return sum;
        if (c.grade === 'P' || c.grade === 'F(NT)') return sum; // non-credit courses
        return sum + c.credits;
      }, 0);
      if (total === 0) return null;
      if (total < 9)  return { type: 'error',   msg: `⚠ ${total} credits — below 9-credit minimum` };
      if (total > 15) return { type: 'error',   msg: `⛔ ${total} credits — exceeds 15-credit maximum` };
      if (total > 12) return { type: 'warn',    msg: `⚠ ${total} credits — requires chairman's permission` };
      return null; // 9–12: normal
    }

    function renderSemesters() {
      const container = document.getElementById('semestersContainer');
      const esc = s => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      document.getElementById('semesterCount').textContent = semesters.length;
      const runBtn = document.getElementById('addRunningSemBtn');
      if (runBtn) runBtn.disabled = semesters.some(s => s.running);
      const retakenKeys = getRetakenKeys();

      container.innerHTML = semesters.map(sem => {
        const gpa = calcSemGPA(sem);
        const isRunning = !!sem.running;
        return `
        <div class="semester-block lg-surface${isRunning ? ' semester-running' : ''}" id="sem-${sem.id}" draggable="${isRunning ? 'false' : 'true'}"><div class="lg-shine"></div>
          <div class="semester-head">
            <div class="semester-head-left">
              ${!isRunning ? `<span class="drag-handle" title="Drag to reorder">⠿</span>` : ''}           <span class="semester-label">${sem.name}</span>
              ${isRunning
                ? `<span class="semester-running-badge">🎯 Projected</span>${gpa !== null ? `<span class="semester-gpa-badge" style="color:#F0A500;background:rgba(240,165,0,0.10);border:1px solid rgba(240,165,0,0.25);">GPA ${gpa.toFixed(2)}</span>` : ''}`
                : (gpa !== null ? `<span class="semester-gpa-badge">GPA ${gpa.toFixed(2)}</span>` : '')
              }
              ${!isRunning && sem.courses.some(c => c.name.trim() && !c.grade)
                ? `<span class="semester-incomplete-badge">⚠ Incomplete</span>`
                : ''
              }
              ${(() => {
                const w = getSemCreditWarning(sem);
                if (!w) return '';
                const cls = w.type === 'error' ? 'semester-credit-error-badge' : 'semester-credit-warn-badge';
                return `<span class="${cls}">${w.msg}</span>`;
              })()}
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
                  value="${esc(c.name)}"
                  autocomplete="off"
                  oninput="onCourseInput(event,${sem.id},${i})"
                  onkeydown="onCourseKey(event,${sem.id},${i})"
                  onblur="onCourseBlur(event,${sem.id},${i})"
                  onblur="setTimeout(()=>closeSuggestions('sug-${sem.id}-${i}'),180)" />
                ${isRetaken ? `<span class="retaken-badge">Retaken</span>` : ''}
              </div>
              <span class="credits-static-wrap">
                <span class="credits-static">${c.credits}</span>${
                  c.name.trim() && c.credits > 0 && ![0.5,1,1.5,2,2.5,3,3.5,4].includes(c.credits)
                    ? `<span class="credit-error-dot" title="Unusual credit value: ${c.credits}"></span>`
                    : c.name.trim() && c.credits > 0 && c.credits > 4
                    ? `<span class="credit-error-dot" title="Credits above 4 is unusual"></span>`
                    : ''
                }</span>
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

      // ── EMPTY STATE ──────────────────────────────────────
      if (semesters.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🎓</div>
            <div class="empty-state-title">No semesters yet</div>
            <div class="empty-state-sub">
              Add your first semester to start tracking your CGPA,
              or load sample data to see how everything works.
            </div>
            <div class="empty-state-actions">
              <button class="btn-sample" onclick="loadSampleData()">✨ Load sample data</button>
              <button class="btn-sample-ghost" onclick="addSemester()">+ Add semester</button>
            </div>
            <div class="empty-arrow">← use the buttons above too &nbsp;↑</div>
          </div>`;
        return;
      }

      // ── DRAG-AND-DROP WIRING ─────────────────────────────
      setTimeout(() => {
        let dragSrcId = null;
        container.querySelectorAll('.semester-block[draggable="true"]').forEach(block => {
          block.addEventListener('dragstart', e => {
            dragSrcId = parseInt(block.id.replace('sem-', ''));
            block.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
          });
          block.addEventListener('dragend', () => {
            block.classList.remove('dragging');
            container.querySelectorAll('.semester-block').forEach(b => b.classList.remove('drag-over'));
          });
          block.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            container.querySelectorAll('.semester-block').forEach(b => b.classList.remove('drag-over'));
            const targetId = parseInt(block.id.replace('sem-', ''));
            if (targetId !== dragSrcId) block.classList.add('drag-over');
          });
          block.addEventListener('dragleave', () => block.classList.remove('drag-over'));
          block.addEventListener('drop', e => {
            e.preventDefault();
            block.classList.remove('drag-over');
            const targetId = parseInt(block.id.replace('sem-', ''));
            if (dragSrcId === null || dragSrcId === targetId) return;
            const srcIdx = semesters.findIndex(s => s.id === dragSrcId);
            const tgtIdx = semesters.findIndex(s => s.id === targetId);
            if (srcIdx < 0 || tgtIdx < 0) return;
            const [moved] = semesters.splice(srcIdx, 1);
            semesters.splice(tgtIdx, 0, moved);
            dragSrcId = null;
            renderSemesters();
            recalc();
            saveState();
          });
        });
      }, 0);
    }

    // ── SAMPLE DATA LOADER ───────────────────────────────────
    function loadSampleData() {
      if (semesters.length > 0 &&
          !confirm('This will replace your current data. Continue?')) return;
      semesters = [];
      semesterCounter = 0;
      const sample = [
        { name: 'Fall 2024', courses: [
          { name: 'Programming Language I (CSE110)',   credits: 3, grade: 'B+', gradePoint: 3.3 },
          { name: 'Fundamentals of English (ENG101)',  credits: 3, grade: 'A-', gradePoint: 3.7 },
          { name: 'Remedial Mathematics (MAT092)',     credits: 0, grade: 'P',  gradePoint: 'P' },
          { name: 'Principles of Physics I (PHY111)', credits: 3, grade: 'B',  gradePoint: 3.0 },
        ]},
        { name: 'Spring 2025', courses: [
          { name: 'Programming Language II (CSE111)',  credits: 3, grade: 'B-', gradePoint: 2.7 },
          { name: 'Discrete Mathematics (CSE230)',     credits: 3, grade: 'B+', gradePoint: 3.3 },
          { name: 'Differential Calculus (MAT110)',    credits: 3, grade: 'A',  gradePoint: 4.0 },
          { name: 'Principles of Physics II (PHY112)', credits: 3, grade: 'B',  gradePoint: 3.0 },
        ]},
      ];
      sample.forEach(s => {
        const id = semesterCounter++;
        semesters.push({ id, name: s.name, courses: s.courses });
      });
      renderSemesters();
      recalc();
      saveState();
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
      // Special case: typing "NT" sets F(NT) grade
      if (val.trim().toUpperCase() === 'NT') {
        const sem = semesters.find(s => s.id === semId);
        if (!sem) return;
        sem.courses[cIdx].grade = 'F(NT)';
        sem.courses[cIdx].gradePoint = 'NT';
        renderSemesters();
        recalc();
        return;
      }
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

    function calcSemGPA(sem) {
      // Semester GPA includes ALL courses taken that semester — retaken or not.
      // Only cumulative CGPA skips retaken rows.
      let pts = 0, creds = 0;
      sem.courses.forEach((c, i) => {
        const gp = GRADES[c.grade];
        if (gp === undefined || !c.credits) return;
        if (c.grade === 'P' || c.grade === 'I') return;
        // F(NT): counts toward sem GPA denominator as 0 pts
        if (c.grade === 'F(NT)') { creds += c.credits; return; }
        if (gp === null) return;
        pts += gp * c.credits;
        creds += c.credits;
      });
      return creds > 0 ? pts / creds : null;
    }

    const STORAGE_KEY = 'shohoj_cgpa_v1';

    function saveState() {
      try {
        const state = {
          currentDept,
          semesterCounter,
          semesters,
          startSeason: document.getElementById('startSeason')?.value || '',
          startYear:   document.getElementById('startYear')?.value   || '',
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch(e) { /* storage unavailable */ }
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const state = JSON.parse(raw);
        if (!state.currentDept || !state.semesters?.length) return false;

        // Restore dept dropdown
        const deptSel = document.getElementById('deptSelect');
        if (deptSel) { deptSel.value = state.currentDept; }
        currentDept = state.currentDept;

        // Restore start season/year dropdowns
        const seasonSel = document.getElementById('startSeason');
        const yearSel   = document.getElementById('startYear');
        if (seasonSel && state.startSeason) seasonSel.value = state.startSeason;
        if (yearSel   && state.startYear)   yearSel.value   = state.startYear;

        // Restore semesters & counter
        semesters        = state.semesters;
        semesterCounter  = state.semesterCounter || semesters.length;

        // Show dept info + start row (so user can still change semester)
        const dept = DEPARTMENTS[currentDept];
        if (dept) {
          document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
          document.getElementById('deptCredits').style.display = '';
        }
        const startRow = document.getElementById('startSemRow');
        if (startRow) startRow.style.display = 'flex';

        _restoredFromStorage = true;
        renderSemesters();
        recalc();
        return true;
      } catch(e) { return false; }
    }

    function clearState() {
      try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    }

    function recalc() {
      let totalPts = 0, totalAttempted = 0, totalEarned = 0, totalEarnedCGPA = 0;
      const retakenKeys = getRetakenKeys();
      // For progress bar: retake keys considering only completed semesters
      const completedOnly = semesters.filter(s => !s.running);
      const retakenKeysCompleted = getRetakenKeys(completedOnly);
      for (const sem of semesters) {
        sem.courses.forEach((c, i) => {
          const gp = GRADES[c.grade];
          if (gp === undefined || !c.credits) return;
          if (c.grade === 'P' || c.grade === 'I') return;
          const isRetaken = retakenKeys.has(`${sem.id}-${i}`);
          // BRACU counts ALL attempts toward credits attempted (excluding running sem)
          if (!sem.running) totalAttempted += c.credits;
          // Only the active (non-retaken) grade counts toward CGPA pts
          if (!isRetaken) {
            totalPts += gp * c.credits;
            // CGPA denominator: ATTEMPTED credits of active courses (includes F and F(NT))
            // BRACU formula: CGPA = totalPts / totalAttempted (not earned)
            // F(NT) = gp 0, null check excludes only P(null) and I(null)
            if (gp !== null) totalEarnedCGPA += c.credits;
          }
          // Credits earned for progress bar: completed sems only, using completed-only retake keys
          if (gp > 0 && !sem.running && !retakenKeysCompleted.has(`${sem.id}-${i}`)) totalEarned += c.credits;
        });
      }

      const cgpa = totalEarnedCGPA > 0 ? totalPts / totalEarnedCGPA : null;

      // CGPA for completed semesters only (for meter + status bar)
      let completedPts = 0, completedEarned = 0;
      semesters.filter(s => !s.running).forEach(sem => {
        sem.courses.forEach((c, i) => {
          const gp = GRADES[c.grade];
          if (gp === undefined || !c.credits || c.grade === 'P' || c.grade === 'I') return;
          if (retakenKeysCompleted.has(`${sem.id}-${i}`)) return;
          completedPts += gp * c.credits;
          // BRACU denominator = attempted credits (includes F and F(NT) with 0 pts)
          if (gp !== null) completedEarned += c.credits;
        });
      });
      const cgpaCompleted = completedEarned > 0 ? completedPts / completedEarned : null;
      const cgpaEl = document.getElementById('cgpaVal');
      cgpaEl.textContent = cgpa !== null ? cgpa.toFixed(2) : '—';
      const hasRunning = semesters.some(s => s.running);
      document.querySelector('.cgpa-label').textContent = hasRunning ? 'Projected CGPA' : 'Current CGPA';

      // Global incomplete warning
      const hasIncomplete = semesters.some(s => !s.running && s.courses.some(c => c.name.trim() && !c.grade));
      let incWarn = document.getElementById('incompleteWarning');
      if (!incWarn) {
        incWarn = document.createElement('div');
        incWarn.id = 'incompleteWarning';
        incWarn.className = 'incomplete-warning';
        const meter = document.querySelector('.cgpa-meter');
        if (meter) meter.parentNode.insertBefore(incWarn, meter.nextSibling);
      }
      if (hasIncomplete) {
        const count = semesters.filter(s => !s.running && s.courses.some(c => c.name.trim() && !c.grade)).length;
        incWarn.textContent = `⚠ ${count} semester${count > 1 ? 's have' : ' has'} missing grades — CGPA may be inaccurate`;
        incWarn.style.display = '';
      } else {
        incWarn.style.display = 'none';
      }
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
      const cgpaNum = cgpaCompleted; // standing based on completed sems only
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
        if (sem.running) return; // exclude running semester from trend chart
        const gpa = calcSemGPA(sem);
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

      const pct = cgpaCompleted !== null ? Math.min((cgpaCompleted / 4) * 100, 100) : 0;
      document.getElementById('meterFill').style.width = pct + '%';
      document.getElementById('meterPct').textContent = cgpaCompleted !== null ? pct.toFixed(1) + '%' : '0%';

      const statusEl = document.getElementById('meterStatus');
      if (cgpa === null) {
        statusEl.innerHTML = 'Add your courses to get started.';
      } else if (cgpaCompleted >= 3.75) {
        statusEl.innerHTML = `<strong>Outstanding!</strong> CGPA ${cgpaCompleted.toFixed(2)} — Dean's List territory. Keep it up.`;
      } else if (cgpaCompleted >= 3.5) {
        statusEl.innerHTML = `<strong>Excellent.</strong> CGPA ${cgpaCompleted.toFixed(2)} — You're on track for a strong degree.`;
      } else if (cgpaCompleted >= 3.0) {
        statusEl.innerHTML = `<strong>Good standing.</strong> CGPA ${cgpaCompleted.toFixed(2)} — Push for 3.5 and you'll stand out.`;
      } else if (cgpaCompleted >= 2.5) {
        statusEl.innerHTML = `<strong>Keep pushing.</strong> CGPA ${cgpaCompleted.toFixed(2)} — Consider retaking weak courses for a boost.`;
      } else {
        statusEl.innerHTML = `<strong>Recovery mode.</strong> CGPA ${cgpa.toFixed(2)} — Focus on retakes and consistent grades from here.`;
      }

      runSimulator(cgpa, totalAttempted, totalPts);
      saveState();
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
               <span class="highlight">${remaining}</span> credits.`;
        if (neededGPA >= 3.9) msg += ` This requires near-perfect grades — <span class="danger">extremely difficult</span> but not impossible.`;
        else if (neededGPA >= 3.5) msg += ` This is <span class="warn">challenging but achievable</span> with consistent effort and smart retakes.`;
        else if (neededGPA >= 3.0) msg += ` This is <span class="highlight">very realistic</span> — stay consistent and avoid D or F grades.`;
        else msg += ` This is <span class="highlight">very achievable</span> — you're in a great position.`;

        // ── Semester breakdown ──────────────────────────────
        // Show how many semesters at standard credit loads (9/12/15 cr/sem)
        // and the approximate letter grade needed
        const gpToLetter = gp => {
          if (gp >= 3.85) return 'All A';
          if (gp >= 3.50) return 'A / A-';
          if (gp >= 3.15) return 'B+ / A-';
          if (gp >= 2.85) return 'B / B+';
          if (gp >= 2.50) return 'B- / B';
          if (gp >= 2.15) return 'C+ / B-';
          if (gp >= 1.85) return 'C / C+';
          return 'C- or below';
        };
        const crLoads = [9, 12, 15];
        const gpColor = neededGPA >= 3.8 ? '#e74c3c' : neededGPA >= 3.5 ? '#F0A500' : '#2ECC71';
        const rows = crLoads.map(cr => {
          const semsNeeded = Math.ceil(remaining / cr);
          const label = semsNeeded === 1 ? '1 semester' : `${semsNeeded} semesters`;
          return `<tr>
            <td style="padding:4px 10px;color:var(--text2);text-align:center">${cr} cr/sem</td>
            <td style="padding:4px 10px;color:var(--text3);text-align:center">${label}</td>
            <td style="padding:4px 10px;text-align:center;font-weight:700;color:${gpColor}">${neededGPA.toFixed(2)}</td>
            <td style="padding:4px 10px;text-align:center;color:var(--text2)">${gpToLetter(neededGPA)}</td>
          </tr>`;
        }).join('');

        msg += `<div style="margin-top:10px;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="border-bottom:1px solid var(--border)">
              <th style="padding:4px 10px;text-align:center;color:var(--text3);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:1px">Credits/sem</th>
              <th style="padding:4px 10px;text-align:center;color:var(--text3);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:1px">Semesters left</th>
              <th style="padding:4px 10px;text-align:center;color:var(--text3);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:1px">GPA needed</th>
              <th style="padding:4px 10px;text-align:center;color:var(--text3);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:1px">~Grades</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      } else if (neededGPA > 4.0) {
        const ceiling = ((4.0 * remaining + currentPts) / totalCredits).toFixed(2);
        msg = `<span class="danger">This target is mathematically out of reach</span> with ${remaining} credits remaining. ` +
              `Your ceiling with perfect grades is <span class="highlight">${ceiling}</span>. ` +
              `Consider lowering your target or boosting via strategic retakes below.`;
      } else {
        msg = `<span class="highlight">You've already achieved CGPA ${target.toFixed(2)}!</span> Set a higher goal.`;
      }

      // ── RETAKE SUGGESTIONS ──────────────────────────────
      msg += buildRetakeSuggestions(currentCgpa, currentCredits, currentPts, target);

      resultEl.innerHTML = msg;
    }

    // ── RETAKE SUGGESTION STATE ───────────────────────────
    // Tracks which candidate courses the user has checked in the retake table
    const _retakeChecked = new Set(); // keys: "courseName||semName"

    function buildRetakeSuggestions(currentCgpa, currentCredits, currentPts, target) {
      if (currentCgpa === null || !semesters.length) return '';

      const retakenKeys = getRetakenKeys();
      const candidates = [];

      semesters.forEach(sem => {
        if (sem.running) return;
        sem.courses.forEach((c, i) => {
          if (!c.name.trim() || !c.credits) return;
          const gp = GRADES[c.grade];
          if (gp === undefined || gp === null) return;
          if (retakenKeys.has(`${sem.id}-${i}`)) return;
          if (gp >= 3.0) return; // B or above — not worth retaking for CGPA

          const semLabel = sem.name.replace(/\s*\(.*\)$/, '');
          const key = `${c.name}||${semLabel}`;

          // CGPA delta formula: (gpNew - gpOld) * credits / totalAttempted
          // currentCredits = totalAttempted (denominator)
          const boostToB  = c.credits * (3.0 - gp) / currentCredits;
          const boostToA  = c.credits * (4.0 - gp) / currentCredits;

          candidates.push({ name: c.name, grade: c.grade, gp, credits: c.credits,
                            sem: semLabel, key, boostToB, boostToA });
        });
      });

      if (!candidates.length) return '';

      // Sort: biggest boost to B first (highest impact)
      candidates.sort((a, b) => b.boostToB - a.boostToB);
      const top = candidates.slice(0, 6);

      // Clean up stale checked keys
      for (const k of [..._retakeChecked]) {
        if (!top.find(c => c.key === k)) _retakeChecked.delete(k);
      }

      // ── Grade colour helper ─────────────────────────────
      const gradeCol = g =>
        (g === 'F' || g === 'F(NT)') ? '#e74c3c' :
        (g === 'D' || g === 'D-' || g === 'D+') ? '#e67e22' : '#F0A500';

      // ── Build table rows ────────────────────────────────
      let cumBoost = 0;
      let ptsAfter  = currentPts;
      let credAfter = currentCredits; // denom stays same (retake doesn't add to attempted)

      const rows = top.map((c, idx) => {
        const checked = _retakeChecked.has(c.key);
        if (checked) { cumBoost += c.boostToB; ptsAfter += c.credits * (3.0 - c.gp); }
        const cgpaIfB = Math.min(4.0, currentCgpa + c.boostToB).toFixed(2);
        const cgpaIfA = Math.min(4.0, currentCgpa + c.boostToA).toFixed(2);
        const chk = checked
          ? `<span style="color:#2ECC71;font-size:14px">☑</span>`
          : `<span style="color:var(--text3);font-size:14px">☐</span>`;
        const rowBg = checked ? 'background:rgba(29,185,84,0.07);' : '';
        return `<tr style="border-bottom:1px solid var(--border);cursor:pointer;${rowBg}"
                    onclick="window._toggleRetake('${c.key.replace(/'/g,"\\'")}')">
          <td style="padding:6px 8px;font-size:12px">${chk}</td>
          <td style="padding:6px 8px;color:var(--text);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.name}">${c.name}</td>
          <td style="padding:6px 8px;text-align:center;font-size:11px;color:var(--text3)">${c.sem}</td>
          <td style="padding:6px 8px;text-align:center;font-size:12px">
            <span style="font-weight:700;color:${gradeCol(c.grade)}">${c.grade}</span>
            <span style="color:var(--text3)"> → </span>
            <span style="font-weight:700;color:#2ECC71">B</span>
          </td>
          <td style="padding:6px 8px;text-align:center;font-size:12px;font-weight:700;color:#2ECC71">${cgpaIfB}</td>
          <td style="padding:6px 8px;text-align:center;font-size:11px;color:var(--text3)">${cgpaIfA} <span style="font-size:9px">(if A)</span></td>
        </tr>`;
      }).join('');

      // ── Cumulative impact panel ─────────────────────────
      const cgpaAfterRetakes = Math.min(4.0, currentCgpa + cumBoost);
      const checkedCount = _retakeChecked.size;

      let retakeImpactHtml = '';
      if (checkedCount > 0 && target) {
        const remaining = parseFloat(document.getElementById('creditsRemaining').value) || 0;
        // After retakes: how much do you still need from new credits?
        const newNeededPts = target * (credAfter + remaining) - ptsAfter;
        const newNeededGPA = remaining > 0 ? newNeededPts / remaining : null;
        const cgpaColor = cgpaAfterRetakes >= target ? '#2ECC71' : cgpaAfterRetakes >= 3.0 ? '#F0A500' : '#e74c3c';
        const targetLine = (newNeededGPA !== null && remaining > 0)
          ? (newNeededGPA > 4.0
              ? `Even with these retakes, reaching <strong>${target.toFixed(2)}</strong> requires more than perfect grades from remaining credits.`
              : newNeededGPA <= 0
              ? `🎉 With these retakes alone, you'd already exceed your target of <strong style="color:#2ECC71">${target.toFixed(2)}</strong>!`
              : `After these retakes, you'd need avg GPA <strong style="color:${newNeededGPA >= 3.5 ? '#F0A500' : '#2ECC71'}">${newNeededGPA.toFixed(2)}</strong> from your remaining <strong>${remaining}</strong> credits to hit <strong>${target.toFixed(2)}</strong>.`)
          : '';

        retakeImpactHtml = `
          <div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(29,185,84,0.08);border:1px solid rgba(29,185,84,0.2)">
            <div style="font-size:12px;color:var(--text2)">
              ✅ <strong>${checkedCount} retake${checkedCount > 1 ? 's' : ''} selected</strong> —
              CGPA goes from <strong>${currentCgpa.toFixed(2)}</strong> →
              <strong style="color:${cgpaColor};font-size:14px">${cgpaAfterRetakes.toFixed(2)}</strong>
              <span style="color:var(--text3);font-size:11px">(+${cumBoost.toFixed(2)} boost if all raised to B)</span>
            </div>
            ${targetLine ? `<div style="margin-top:6px;font-size:12px;color:var(--text2)">${targetLine}</div>` : ''}
          </div>`;
      } else if (checkedCount === 0) {
        retakeImpactHtml = `
          <div style="margin-top:8px;font-size:11px;color:var(--text3)">
            💡 Click any row to select it and see how your CGPA changes after those retakes.
          </div>`;
      }

      return `
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:4px">
            🔁 Smart Retake Strategy
          </div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
            Courses ranked by CGPA impact if raised to <strong style="color:#2ECC71">B (3.0)</strong>. Click rows to simulate stacking retakes.
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:1px solid var(--border)">
                  <th style="padding:4px 8px;width:24px"></th>
                  <th style="padding:4px 8px;text-align:left;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Course</th>
                  <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Semester</th>
                  <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Grade → Target</th>
                  <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">CGPA (B)</th>
                  <th style="padding:4px 8px;text-align:center;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase">CGPA (A)</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${retakeImpactHtml}
        </div>`;
    }

    // Global toggle handler for retake checkboxes (called from inline onclick)
    window._toggleRetake = function(key) {
      if (_retakeChecked.has(key)) _retakeChecked.delete(key);
      else _retakeChecked.add(key);
      recalc(); // re-render simulator with updated selection
    };

    document.getElementById('targetCgpa').addEventListener('input', recalc);
    document.getElementById('creditsRemaining').addEventListener('input', recalc);
    document.getElementById('addSemesterBtn').addEventListener('click', () => addSemester());
    document.getElementById('addRunningSemBtn').addEventListener('click', () => addRunningSemester());

    // ── INIT ──────────────────────────────────────────────

    function exportPDF() {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) { alert('PDF library not loaded. Please check your connection.'); return; }
      if (!semesters.length) { alert('No data to export.'); return; }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, margin = 16;
      const col = W - margin * 2;
      let y = 0;

      // ── helpers ──────────────────────────────────────────
      const hex = c => { const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return [r,g,b]; };
      const GREEN  = hex('#1DB954');
      const GREEN2 = hex('#145E30');
      const WHITE  = [255,255,255];
      const GRAY1  = [20,40,20];
      const GRAY2  = [60,90,60];
      const GRAY3  = [120,150,120];
      const LIGHT  = [235,245,235];
      const RETAKE = hex('#F0A500');
      const RED    = hex('#e74c3c');

      function newPage() {
        doc.addPage();
        y = margin;
      }

      function checkY(needed = 10) {
        if (y + needed > 282) newPage();
      }

      // ── recompute stats ───────────────────────────────────
      const retakenKeys = getRetakenKeys();
      const retakenKeysCompleted = getRetakenKeys(semesters.filter(s => !s.running));
      let totalPts = 0, totalAttempted = 0, totalEarned = 0, totalEarnedCGPA = 0;
      let completedPts = 0, completedEarned = 0;
      semesters.forEach(sem => {
        sem.courses.forEach((c, i) => {
          const gp = GRADES[c.grade];
          if (gp === undefined || !c.credits || c.grade === 'P' || c.grade === 'I') return;
          if (!sem.running) totalAttempted += c.credits;
          const isRetaken = retakenKeys.has(`${sem.id}-${i}`);
          if (!isRetaken) { totalPts += gp * c.credits; if (gp !== null) totalEarnedCGPA += c.credits; }
          if (gp > 0 && !sem.running && !retakenKeysCompleted.has(`${sem.id}-${i}`)) totalEarned += c.credits;
        });
      });
      semesters.filter(s => !s.running).forEach(sem => {
        sem.courses.forEach((c, i) => {
          const gp = GRADES[c.grade];
          if (gp === undefined || !c.credits || c.grade === 'P' || c.grade === 'I') return;
          if (retakenKeysCompleted.has(`${sem.id}-${i}`)) return;
          completedPts += gp * c.credits; if (gp !== null) completedEarned += c.credits;
        });
      });
      const cgpa          = totalEarnedCGPA > 0 ? totalPts / totalEarnedCGPA : null;
      const cgpaCompleted = completedEarned  > 0 ? completedPts / completedEarned : null;
      const hasRunning    = semesters.some(s => s.running);
      const dept          = DEPARTMENTS[currentDept];

      // ── HEADER ────────────────────────────────────────────
      doc.setFillColor(...GREEN2);
      doc.rect(0, 0, W, 42, 'F');

      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREEN);
      doc.text('Shohoj', margin, 14);
      doc.setTextColor(...WHITE);
      doc.text('CGPA Report', margin + 26, 14);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY3);
      doc.text(dept ? dept.label : '', margin, 21);
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
      const timeStr = now.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
      doc.text('Generated: ' + dateStr + ' at ' + timeStr, margin, 27);

      // Big CGPA number
      const cgpaDisplay = cgpa !== null ? cgpa.toFixed(2) : '--';
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREEN);
      doc.text(cgpaDisplay, W - margin, 20, { align: 'right' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY3);
      doc.text(hasRunning ? 'PROJECTED CGPA' : 'CURRENT CGPA', W - margin, 27, { align: 'right' });

      y = 50;

      // ── SUMMARY STATS ROW ─────────────────────────────────
      const stats = [
        { label: 'Credits Attempted', value: totalAttempted.toFixed(0) },
        { label: 'Credits Earned',    value: totalEarned.toFixed(0) },
        { label: 'Semesters',         value: semesters.filter(s=>!s.running).length },
        { label: hasRunning ? 'Projected CGPA' : 'Current CGPA', value: cgpaDisplay },
      ];
      if (hasRunning && cgpaCompleted !== null) {
        stats.push({ label: 'Completed CGPA', value: cgpaCompleted.toFixed(2) });
      }
      const bw = col / stats.length;
      stats.forEach((s, i) => {
        const x = margin + i * bw;
        doc.setFillColor(...LIGHT);
        doc.roundedRect(x, y, bw - 2, 16, 2, 2, 'F');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GREEN2);
        doc.text(String(s.value), x + bw/2 - 1, y + 8, { align: 'center' });
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRAY2);
        doc.text(s.label, x + bw/2 - 1, y + 13, { align: 'center' });
      });
      y += 22;

      // ── SEMESTER SECTIONS ─────────────────────────────────
      const rk = retakenKeys; // reuse already-computed retakenKeys

      semesters.forEach((sem, si) => {
        const semGPA = calcSemGPA(sem);
        const courses = sem.courses.filter(c => c.name.trim());
        if (!courses.length) return;

        // Estimate height needed: header(8) + col header(6) + courses(7 each) + gap(4)
        const needed = 8 + 6 + courses.length * 7 + 4;
        checkY(needed);

        // Semester header bar
        doc.setFillColor(...(sem.running ? hex('#2C2000') : GREEN2));
        doc.roundedRect(margin, y, col, 8, 1.5, 1.5, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(sem.running ? RETAKE : GREEN));
        // Strip HTML but reconstruct ordinal suffix as plain text
        // e.g. "Fall 2025 (1<sup>st</sup> Semester)" → "Fall 2025 (1st Semester)"
        // jsPDF can't do superscript, so we fake it: draw number, then tiny suffix higher up
        const semNameRaw = sem.name;
        const supMatch = semNameRaw.match(/^(.*?\()(\d+)<sup>(\w+)<\/sup>(.*)$/);
        if (supMatch) {
          // Split: prefix + number + suffix text
          const prefix    = supMatch[1]; // e.g. "Fall 2025 ("
          const num       = supMatch[2]; // e.g. "1"
          const sup       = supMatch[3]; // e.g. "st"
          const rest      = supMatch[4]; // e.g. " Semester)"
          // Draw prefix+number at normal size
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...(sem.running ? RETAKE : GREEN));
          const prefixNumStr = prefix + num;
          doc.text(prefixNumStr, margin + 3, y + 5.5);
          const prefixNumW = doc.getTextWidth(prefixNumStr);
          // Draw superscript suffix smaller and higher
          doc.setFontSize(5.5);
          doc.text(sup, margin + 3 + prefixNumW, y + 3.8);
          const supW = doc.getTextWidth(sup); // measured at 5.5pt — accurate
          // Draw rest at normal size
          doc.setFontSize(9);
          doc.text(rest, margin + 3 + prefixNumW + supW, y + 5.5);
          var semNameClean = prefix + num + sup + rest; // for getTextWidth fallback
        } else {
          var semNameClean = semNameRaw.replace(/<sup>[^<]*<\/sup>/g, '');
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...(sem.running ? RETAKE : GREEN));
          doc.text(semNameClean, margin + 3, y + 5.5);
        }

        if (semGPA !== null) {
          doc.setTextColor(...(sem.running ? RETAKE : GREEN));
          doc.text('GPA ' + semGPA.toFixed(2), W - margin - 3, y + 5.5, { align: 'right' });
        }
        if (sem.running) {
          doc.setFontSize(9); // measure at 9pt — same size name was drawn at
          const semNameW = doc.getTextWidth(semNameClean);
          doc.setFontSize(7);
          doc.setTextColor(...RETAKE);
          doc.text('[Running]', margin + 3 + semNameW + 3, y + 5.5);
        }
        y += 10;

        // Column headers
        doc.setFillColor(245, 250, 245);
        doc.rect(margin, y, col, 6, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GRAY2);
        doc.text('COURSE', margin + 2, y + 4);
        doc.text('CREDITS', margin + col * 0.72, y + 4, { align: 'center' });
        doc.text('GRADE PT', margin + col * 0.84, y + 4, { align: 'center' });
        doc.text('GRADE', margin + col * 0.94, y + 4, { align: 'center' });
        y += 6;

        // Course rows
        courses.forEach((c, ci) => {
          const gp = GRADES[c.grade];
          const isRetaken = rk.has(`${sem.id}-${sem.courses.indexOf(c)}`);
          const isFNT     = c.grade === 'F(NT)';
          const isF       = c.grade === 'F';

          // Alternating row bg
          if (ci % 2 === 0) {
            doc.setFillColor(248, 253, 248);
            doc.rect(margin, y, col, 7, 'F');
          }

          // Retaken badge background
          if (isRetaken) {
            doc.setFillColor(255, 248, 225);
            doc.rect(margin, y, col, 7, 'F');
          }

          doc.setFontSize(7.5);
          doc.setFont('helvetica', isRetaken ? 'italic' : 'normal');
          doc.setTextColor(...(isRetaken ? [160,120,0] : GRAY1));
          // Truncate long course names
          let name = c.name;
          while (doc.getTextWidth(name) > col * 0.65 && name.length > 5) name = name.slice(0, -1);
          if (name !== c.name) name += '...';
          doc.text(name, margin + 2, y + 4.8);

          if (isRetaken) {
            doc.setFontSize(6);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...RETAKE);
            doc.text('RT', margin + col * 0.67, y + 4.8, { align: 'center' });
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...GRAY1);
          doc.text(String(c.credits), margin + col * 0.72, y + 4.8, { align: 'center' });

          if (gp !== undefined && gp !== null && c.grade !== 'P' && c.grade !== 'I') {
            doc.text(gp.toFixed(1), margin + col * 0.84, y + 4.8, { align: 'center' });
          }

          // Grade with color
          const isPI = c.grade === 'P' || c.grade === 'I';
          const gradeColor = isPI ? GRAY3 : isFNT || isF ? RED : isRetaken ? [160,120,0] : (gp >= 3.5 ? GREEN : gp >= 2.0 ? GRAY1 : RED);
          doc.setTextColor(...gradeColor);
          doc.setFont('helvetica', 'bold');
          doc.text(c.grade || '-', margin + col * 0.94, y + 4.8, { align: 'center' });
          doc.setFont('helvetica', 'normal');

          // Bottom divider
          doc.setDrawColor(220, 235, 220);
          doc.setLineWidth(0.1);
          doc.line(margin, y + 7, margin + col, y + 7);

          y += 7;
        });

        y += 5; // gap between semesters
      });

      // ── FOOTER ────────────────────────────────────────────
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRAY3);
        doc.text('Shohoj - BRACU Smart CGPA Calculator', margin, 292);
        doc.text(`Page ${p} of ${totalPages}`, W - margin, 292, { align: 'right' });
      }

      // ── SAVE ─────────────────────────────────────────────
      const fname = `CGPA_Report_${new Date().toISOString().slice(0,10)}.pdf`;
      doc.save(fname);
    }

    // ── PDF TRANSCRIPT IMPORT ─────────────────────────────
    // Returns theme-matched colors for the import modal
    function getModalTheme() {
      const isDark = document.documentElement.dataset.theme === 'dark';
      if (isDark) {
        return {
          isDark,
          // Card background is set in index.html as #0f1f14
          text:              '#e8f0ea',
          text2:             '#8aab90',
          text3:             '#6a9b72',
          tableHeadBg:       'rgba(46,204,113,0.06)',
          tableRowBorder:    'rgba(46,204,113,0.10)',
          warnBg:            'rgba(240,165,0,0.10)',
          warnBorder:        'rgba(240,165,0,0.25)',
          warnText:          '#F0A500',
          cancelColor:       'rgba(255,255,255,0.65)',
          cancelBorder:      'rgba(255,255,255,0.18)',
          cancelHoverBg:     'rgba(255,255,255,0.08)',
          cancelHoverBorder: 'rgba(255,255,255,0.35)',
          cancelHoverColor:  '#ffffff',
          tableBorder:       'rgba(46,204,113,0.18)',
        };
      } else {
        return {
          isDark,
          // Card background set to white in index.html for light theme
          text:              '#0d2914',
          text2:             '#3a6b47',
          text3:             '#5a8f65',
          tableHeadBg:       'rgba(46,204,113,0.08)',
          tableRowBorder:    'rgba(46,204,113,0.12)',
          warnBg:            'rgba(240,165,0,0.08)',
          warnBorder:        'rgba(240,165,0,0.30)',
          warnText:          '#b07800',
          cancelColor:       '#3a6b47',
          cancelBorder:      'rgba(46,204,113,0.35)',
          cancelHoverBg:     'rgba(46,204,113,0.08)',
          cancelHoverBorder: 'rgba(46,204,113,0.5)',
          cancelHoverColor:  '#0d2914',
          tableBorder:       'rgba(46,204,113,0.22)',
        };
      }
    }

    function showImportModal(html) {
      const modal = document.getElementById('importModal');
      const card  = document.getElementById('importModalCard');
      const isDark = document.documentElement.dataset.theme === 'dark';
      // Backdrop: dark overlay in dark mode, soft green-tinted in light mode
      modal.style.background = isDark
        ? 'rgba(0,0,0,0.75)'
        : 'rgba(13,41,20,0.45)';
      // Apply theme-matched card styling
      if (isDark) {
        card.style.background   = '#0f1f14';
        card.style.border       = '1px solid rgba(46,204,113,0.22)';
        card.style.boxShadow    = '0 24px 80px rgba(0,0,0,0.6)';
      } else {
        card.style.background   = '#ffffff';
        card.style.border       = '1px solid rgba(46,204,113,0.30)';
        card.style.boxShadow    = '0 24px 80px rgba(46,204,113,0.15), 0 0 0 1px rgba(255,255,255,0.9)';
      }
      document.getElementById('importModalContent').innerHTML = html;
      modal.style.display = 'flex';
    }
    function hideImportModal() {
      const modal = document.getElementById('importModal');
      modal.style.display = 'none';
      // Reset file input so same file can be re-selected
      const fi = document.getElementById('transcriptFileInput');
      if (fi) fi.value = '';
    }
    // Close modal on backdrop click (not when clicking inside the card)
    document.getElementById('importModal').addEventListener('click', function(e) {
      const card = document.getElementById('importModalCard');
      if (card && !card.contains(e.target)) hideImportModal();
    });

    async function importTranscriptPDF(inputEl) {
      const file = inputEl.files[0];
      if (!file) return;

      // Loading state
      const t = getModalTheme();
      showImportModal(`
        <div style="text-align:center;padding:20px 0">
          <div style="font-size:28px;margin-bottom:12px">⏳</div>
          <div style="font-size:15px;font-weight:600;color:${t.text}">Reading transcript…</div>
          <div style="font-size:12px;color:${t.text3};margin-top:6px">Parsing your grade sheet</div>
        </div>`);

      try {
        // Set PDF.js worker
        if (window.pdfjsLib) {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        } else {
          throw new Error('PDF.js not loaded. Check your internet connection.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        // Extract all text from all pages
        let fullText = '';
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          // Join items with spaces, preserve line breaks via y-position grouping
          let lastY = null;
          for (const item of content.items) {
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 3) {
              fullText += '\n';
            }
            fullText += item.str + ' ';
            lastY = item.transform[5];
          }
          fullText += '\n';
        }

        // ── PARSE ──────────────────────────────────────
        let parsed = parseTranscriptText(fullText);

        // ── FALLBACK: blob parser ───────────────────────────────────────
        // If line-based parser found semesters but suspiciously few courses
        // (e.g. PDF.js scrambled column order), re-parse the raw text blob
        // by scanning for course-code tokens directly, independent of line breaks.
        const totalCourses = parsed.semesters.reduce((s,sem)=>s+sem.courses.length,0);
        const semCount     = parsed.semesters.length;
        if (semCount > 0 && totalCourses < semCount * 2) {
          console.warn('[Shohoj] Line parser got only', totalCourses, 'courses — trying blob fallback');
          const blobParsed = parseBlobFallback(fullText);
          if (blobParsed.semesters.length > 0) {
            const blobTotal = blobParsed.semesters.reduce((s,sem)=>s+sem.courses.length,0);
            if (blobTotal > totalCourses) {
              console.info('[Shohoj] Blob fallback found', blobTotal, 'courses — using it');
              parsed = blobParsed;
            }
          }
        }

        if (!parsed.semesters.length) {
          throw new Error('No BRACU semester data found. Make sure this is an official BRACU grade sheet (Unofficial Copy).');
        }

        // ── CONFIRM MODAL ──────────────────────────────
        const _mt = getModalTheme();
        const semRows = parsed.semesters.map(s =>
          `<tr>
            <td style="padding:4px 8px;color:${_mt.text};font-size:13px">${s.name}</td>
            <td style="padding:4px 8px;text-align:center;color:${_mt.text3};font-size:13px">${s.courses.length} courses</td>
            <td style="padding:4px 8px;text-align:center;font-size:13px;color:#1DB954;font-weight:600">${s.courses.filter(c=>c.grade&&c.grade!=='P').length} graded</td>
          </tr>`
        ).join('');

        const totalCoursesDisplay = parsed.semesters.reduce((n, s) => n + s.courses.length, 0);

        const t2 = getModalTheme();
        showImportModal(`
          <div style="margin-bottom:16px">
            <div style="font-size:18px;font-weight:700;color:${t2.text};margin-bottom:4px">📄 Transcript Parsed</div>
            <div style="font-size:12px;color:${t2.text3}">Found <strong style="color:#1DB954">${parsed.semesters.length} semesters</strong> and <strong style="color:#1DB954">${totalCoursesDisplay} courses</strong></div>
          </div>
          <div style="overflow-x:auto;margin-bottom:16px;border:1px solid ${t2.tableBorder};border-radius:8px">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="border-bottom:1px solid ${t2.tableRowBorder};background:${t2.tableHeadBg}">
                <th style="padding:6px 8px;text-align:left;font-size:10px;color:${t2.text3};text-transform:uppercase;letter-spacing:1px">Semester</th>
                <th style="padding:6px 8px;text-align:center;font-size:10px;color:${t2.text3};text-transform:uppercase;letter-spacing:1px">Courses</th>
                <th style="padding:6px 8px;text-align:center;font-size:10px;color:${t2.text3};text-transform:uppercase;letter-spacing:1px">Graded</th>
              </tr></thead>
              <tbody>${semRows}</tbody>
            </table>
          </div>
          ${parsed.detectedDept ? `<div style="font-size:12px;color:${t2.text3};margin-bottom:12px">🎓 Detected department: <strong style="color:${t2.text}">${parsed.detectedDept}</strong></div>` : ''}
          <div style="font-size:12px;color:${t2.warnText};margin-bottom:16px;padding:8px 10px;background:${t2.warnBg};border-radius:6px;border:1px solid ${t2.warnBorder}">
            ⚠ This will <strong>replace</strong> your current data. Any unsaved changes will be lost.
          </div>
          <div style="display:flex;gap:10px">
            <button onclick="applyImport(${JSON.stringify(parsed).replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')})"
              onmouseenter="this.style.background='#17a348';this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(29,185,84,0.4)'"
              onmouseleave="this.style.background='#1DB954';this.style.transform='translateY(0)';this.style.boxShadow='none'"
              onmousedown="this.style.transform='translateY(1px)';this.style.boxShadow='none'"
              onmouseup="this.style.transform='translateY(-1px)'"
              style="flex:1;padding:10px;border-radius:8px;border:none;background:#1DB954;color:#000;font-weight:700;font-size:14px;cursor:pointer;transition:background 0.15s,transform 0.1s,box-shadow 0.15s">
              ✅ Import Now
            </button>
            <button onclick="hideImportModal()"
              onmouseenter="this.style.background='${t2.cancelHoverBg}';this.style.borderColor='${t2.cancelHoverBorder}';this.style.color='${t2.cancelHoverColor}';this.style.transform='translateY(-1px)'"
              onmouseleave="this.style.background='transparent';this.style.borderColor='${t2.cancelBorder}';this.style.color='${t2.cancelColor}';this.style.transform='translateY(0)'"
              onmousedown="this.style.transform='translateY(1px)'"
              onmouseup="this.style.transform='translateY(-1px)'"
              style="padding:10px 16px;border-radius:8px;border:1px solid ${t2.cancelBorder};background:transparent;color:${t2.cancelColor};font-size:14px;cursor:pointer;transition:background 0.15s,border-color 0.15s,color 0.15s,transform 0.1s">
              Cancel
            </button>
          </div>`);

      } catch (err) {
        const te = getModalTheme();
        showImportModal(`
          <div style="text-align:center;padding:8px 0">
            <div style="font-size:28px;margin-bottom:12px">❌</div>
            <div style="font-size:15px;font-weight:600;color:${te.text};margin-bottom:8px">Import Failed</div>
            <div style="font-size:12px;color:${te.text3};margin-bottom:20px;line-height:1.6">${err.message}</div>
            <button onclick="hideImportModal()"
              onmouseenter="this.style.background='${te.cancelHoverBg}';this.style.borderColor='${te.cancelHoverBorder}';this.style.color='${te.cancelHoverColor}'"
              onmouseleave="this.style.background='transparent';this.style.borderColor='${te.cancelBorder}';this.style.color='${te.cancelColor}'"
              style="padding:8px 20px;border-radius:8px;border:1px solid ${te.cancelBorder};background:transparent;color:${te.cancelColor};cursor:pointer;transition:background 0.15s,border-color 0.15s,color 0.15s">
              Close
            </button>
          </div>`);
      }
    }


    // Flexible continuation-line parser: extracts credits/grade/gradePoint from a line
    // regardless of what order PDF.js returns the table columns.
    // Handles: "GEOMETRY 3.00 B 3.00", "3.00 GEOMETRY B 3.00", "3.00 B 3.00 GEOMETRY" etc.
    function _parseContLine(line, pendingTitle) {
      // Must contain at least 2 floats and 1 grade letter to be a valid continuation
      const floatRe = /\b(\d+\.\d+)\b/g;
      // Use lookahead/lookbehind instead of \b — \b fails before '(' in F(NT)/C+(RT)
      const gradeRe = /(?<!\w)((?:[A-Z][+-]?)(?:\((?:NT|RT)\))|[A-Z][+-]?)(?!\w)/;

      const floats = [...line.matchAll(floatRe)].map(m => ({ val: parseFloat(m[1]), idx: m.index }));
      const gradeM = line.match(gradeRe);

      if (floats.length < 2 || !gradeM) return null;

      // Pick the two floats: one is credits (standard value), one is grade points
      const VALID_CREDITS = new Set([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);
      let creditsEntry = floats.find(f => VALID_CREDITS.has(f.val));
      let gpEntry      = floats.find(f => f !== creditsEntry);
      if (!creditsEntry || !gpEntry) {
        // Fallback: first float = credits, second = gp
        creditsEntry = floats[0];
        gpEntry      = floats[1];
      }

      // Strip the two float values and the grade from the line to get the title remainder
      let remainder = line;
      // Remove in reverse index order to preserve positions
      const toRemove = [
        { idx: creditsEntry.idx, len: creditsEntry.val.toString().length + (line[creditsEntry.idx + creditsEntry.val.toString().length] === '0' ? 1 : 0) },
        { idx: gpEntry.idx,      len: gpEntry.val.toString().length      + (line[gpEntry.idx      + gpEntry.val.toString().length]      === '0' ? 1 : 0) },
        { idx: gradeM.index,     len: gradeM[0].length },
      ].sort((a, b) => b.idx - a.idx); // descending

      // Use string replacement to remove matched tokens
      remainder = remainder
        .replace(new RegExp('\\b' + creditsEntry.val.toFixed(2) + '\\b'), '')
        .replace(new RegExp('\\b' + gpEntry.val.toFixed(2) + '\\b'), '')
        .replace(gradeRe, '')
        .replace(/\s{2,}/g, ' ').trim();

      const fullTitle = (pendingTitle + (remainder ? ' ' + remainder : '')).trim();
      return { fullTitle, credits: creditsEntry.val, grade: gradeM[0], gradePoint: gpEntry.val };
    }

    // ── BLOB FALLBACK PARSER ─────────────────────────────────────────────
    // Scans raw text blob for course-code + data patterns regardless of line breaks.
    // Used when PDF.js scrambles column order and the line-based parser misses courses.
    function parseBlobFallback(text) {
      const SEASON = { FALL:'Fall', SPRING:'Spring', SUMMER:'Summer' };
      const semesters = [];
      let currentSem = null;

      // Collapse all whitespace/newlines into single spaces for blob scanning
      const blob = text.replace(/\s+/g, ' ');

      // Find semester headers in order
      const semRe = /SEMESTER[:\s]+([A-Z]+)\s+(\d{4})/gi;
      const semMatches = [];
      let sm;
      while ((sm = semRe.exec(blob)) !== null) {
        const season = sm[1].toUpperCase();
        if (SEASON[season]) {
          semMatches.push({ name: `${SEASON[season]} ${sm[2]}`, season: SEASON[season], year: parseInt(sm[2]), idx: sm.index });
        }
      }
      if (!semMatches.length) return { semesters: [], detectedDept: null };

      // For each semester, scan the blob slice between this header and the next
      for (let i = 0; i < semMatches.length; i++) {
        const start = semMatches[i].idx;
        const end   = i + 1 < semMatches.length ? semMatches[i+1].idx : blob.length;
        const slice = blob.slice(start, end);

        const courses = [];
        // Match: COURSECODE ... CREDITS GRADE GRADEPOINTS
        // e.g. "CSE110 PROGRAMMING LANGUAGE I 3.00 C- 1.70"
        // Course code followed by anything, then float, grade, float
        const courseRe = /\b([A-Z]{2,4}\d{3}[A-Z]?)\b(.{1,120}?)\b(\d+\.\d+)\s+((?:[A-Z][+-]?)(?:\((?:NT|RT)\))|[A-Z][+-]?)\s+(\d+\.\d+)/g;
        let cm;
        while ((cm = courseRe.exec(slice)) !== null) {
          const code  = cm[1];
          const creds = parseFloat(cm[3]);
          let grade   = cm[4].trim();
          const gp    = parseFloat(cm[5]);

          // Skip semester/cumulative summary lines
          if (/^(SEMESTER|CUMULATIVE)/i.test(cm[0])) continue;
          // Skip if credits > 4 (likely a year like 2024)
          if (creds > 4) continue;

          const isRetake = grade.includes('(RT)');
          let cleanGrade = grade.replace(/\s*\(RT\)\s*/g, '').trim();
          if (/^F\s*\(?NT\)?$/i.test(cleanGrade)) cleanGrade = 'F(NT)';

          const dbEntry = COURSE_DB[code];
          const finalName    = dbEntry ? dbEntry.full : `${code}`;
          const finalCredits = dbEntry ? dbEntry.credits : creds;

          courses.push({
            name: finalName, credits: finalCredits,
            grade: cleanGrade,
            gradePoint: cleanGrade === 'F(NT)' ? 'NT' : (gp > 0 ? gp : (cleanGrade === 'F' ? '0' : '')),
            _wasRetake: isRetake,
          });
        }

        if (courses.length) {
          const { season, year } = semMatches[i];
          semesters.push({ name: semMatches[i].name, season, year, courses });
        }
      }

      const detectedDept = /CSE|COMPUTER SCIENCE/i.test(blob)
        ? 'B.Sc. in Computer Science and Engineering (CSE)'
        : /BBA|BUSINESS ADMINISTRATION/i.test(blob)
        ? 'Bachelor of Business Administration (BBA)'
        : null;
      return { semesters, detectedDept };
    }

    function parseTranscriptText(text) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const semesters = [];
      let currentSem = null;
      let detectedDept = '';

      // Detect department from header text
      // Note: PDF.js may split "COMPUTER\nSCIENCE" across lines — use \s* to bridge
      if (/COMPUTER[\s\S]{0,10}SCIENCE/i.test(text) || /B\.?SC\.?\s+IN\s+COMPUTER/i.test(text)) detectedDept = 'B.Sc. in Computer Science and Engineering (CSE)';
      else if (/ELECTRICAL/i.test(text)) detectedDept = 'BSc EEE — Electrical & Electronic Engineering';
      else if (/BUSINESS ADMINISTRATION/i.test(text)) detectedDept = 'Bachelor of Business Administration (BBA)';
      else if (/PHARMACY/i.test(text)) detectedDept = 'B.Sc. in Pharmacy (PHR)';
      else if (/ARCHITECTURE/i.test(text)) detectedDept = 'B.Sc. in Architecture (ARC)';
      else if (/LAW/i.test(text)) detectedDept = 'Bachelor of Laws (LLB)';
      else if (/B\.?A\.?\s+IN\s+ENGLISH|BACHELOR\s+OF\s+ARTS\s+IN\s+ENGLISH/i.test(text)) detectedDept = 'B.A. in English (ENG)';

      // Course regex: code + title (multi-word) + credits + grade + grade points
      // Handles: C-, B+, F (NT), C+ (RT), P, D+
      const courseRe = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+?)\s+([\d]+\.[\d]+)\s+((?:[A-Z][+-]?|[A-Z]\s*\([A-Z]+\)|[A-Z][+-]?\s*\([A-Z]+\))|P|F)\s+([\d]+\.[\d]+)\s*$/;
      const semRe    = /^SEMESTER[:\s]*([A-Z]+)\s+(\d{4})/i;

      const SEASON_MAP = { SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };

      let pendingCode = '';   // course code from a line whose title wraps to next line
      let pendingTitle = '';  // partial title accumulated so far

      for (const line of lines) {
        // Semester header detection
        const semMatch = line.match(semRe);
        if (semMatch) {
          pendingCode = ''; pendingTitle = '';
          const season = SEASON_MAP[semMatch[1].toUpperCase()] || semMatch[1];
          const year   = semMatch[2];
          currentSem = { name: `${season} ${year}`, season, year: parseInt(year), courses: [] };
          semesters.push(currentSem);
          continue;
        }

        // Skip summary lines
        if (/^(SEMESTER|CUMULATIVE)\s+Credits/i.test(line)) continue;
        if (/^(Credits Attempted|Credits Earned|GPA|CGPA)/i.test(line)) continue;
        if (/^(BRAC University|Grade Sheet|Student|Name|Program|Course No)/i.test(line)) continue;
        if (/^Page \d/i.test(line)) continue;

        if (!currentSem) continue;

        // Normalise grade markers
        const normalised = line
          .replace(/F\s*\(NT\)/g, 'F(NT)')
          .replace(/([A-Z][+-]?)\s*\(RT\)/g, '$1(RT)')
          .replace(/\s{2,}/g, ' ');

        // ── CONTINUATION LINE handling ────────────────────
        // If previous line had a course code but title wrapped, try to complete it.
        // PDF.js may return table columns in any order (credits before title-remainder,
        // or title-remainder before credits) depending on PDF content stream ordering.
        // So we extract credits/grade/gp positionally regardless of column order.
        if (pendingCode) {
          const contResult = _parseContLine(normalised, pendingTitle);
          if (contResult) {
            const { fullTitle, credits, grade, gradePoint } = contResult;
            const isRetake  = grade.includes('(RT)');
            let cleanGrade  = grade.replace(/\s*\(RT\)\s*/g, '').trim();
            if (/^F\s*\(NT\)$/i.test(cleanGrade)) cleanGrade = 'F(NT)';
            const titleCased = fullTitle.split(/\s+/).map(w =>
              w.length <= 2 ? w : w[0] + w.slice(1).toLowerCase()
            ).join(' ');
            const dbEntry      = COURSE_DB[pendingCode];
            const finalName    = dbEntry ? dbEntry.full : `${titleCased} (${pendingCode})`;
            const finalCredits = dbEntry ? dbEntry.credits : credits;
            currentSem.courses.push({
              name: finalName, credits: finalCredits,
              grade: cleanGrade,
              gradePoint: cleanGrade === 'F(NT)' ? 'NT' : (gradePoint > 0 ? gradePoint : (cleanGrade === 'F' ? '0' : '')),
              _wasRetake: isRetake,
            });
            pendingCode = ''; pendingTitle = '';
            continue;
          }
          // Continuation didn't resolve — line is more title text, keep accumulating
          pendingTitle += ' ' + normalised;
          continue;
        }

        // ── NORMAL COURSE LINE ────────────────────────────
        const m = normalised.match(courseRe);
        if (m) {
          let [, code, title, creditsStr, grade, gpStr] = m;
          grade  = grade.trim();
          const credits   = parseFloat(creditsStr);
          const gradePoint = parseFloat(gpStr);
          const isRetake  = grade.includes('(RT)');
          let cleanGrade = grade.replace(/\s*\(RT\)\s*/g, '').trim();
          if (/^F\s*\(NT\)$/i.test(cleanGrade)) cleanGrade = 'F(NT)';
          const titleCased = title.trim().split(/\s+/).map(w =>
            w.length <= 2 ? w : w[0] + w.slice(1).toLowerCase()
          ).join(' ');
          const dbEntry      = COURSE_DB[code];
          const finalName    = dbEntry ? dbEntry.full : `${titleCased} (${code})`;
          const finalCredits = dbEntry ? dbEntry.credits : credits;
          currentSem.courses.push({
            name: finalName, credits: finalCredits,
            grade: cleanGrade,
            gradePoint: cleanGrade === 'F(NT)' ? 'NT' : (gradePoint > 0 ? gradePoint : (cleanGrade === 'F' ? '0' : '')),
            _wasRetake: isRetake,
          });
          pendingCode = ''; pendingTitle = '';
        } else {
          // ── PARTIAL COURSE LINE (title wraps) ────────────
          // Detect: starts with course code but no credits/grade at end
          const partialRe = /^([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+)$/;
          const pm = normalised.match(partialRe);
          if (pm && !semRe.test(normalised)) {
            pendingCode  = pm[1];
            pendingTitle = pm[2];
          }
        }

      } // end for loop

      // Remove empty semesters
      return { semesters: semesters.filter(s => s.courses.length > 0), detectedDept };
    }

    function applyImport(parsed) {
      hideImportModal();

      // Detect start season/year from first semester
      const first = parsed.semesters[0];
      if (first) {
        const seasonSel = document.getElementById('startSeason');
        const yearSel   = document.getElementById('startYear');
        if (seasonSel) seasonSel.value = first.season;
        if (yearSel)   yearSel.value   = String(first.year);
      }

      // Set department if detected
      if (parsed.detectedDept) {
        const deptSel = document.getElementById('deptSelect');
        const match = Object.entries(DEPARTMENTS).find(([,d]) => d.label === parsed.detectedDept);
        if (match && deptSel) {
          deptSel.value = match[0];
          currentDept = match[0];
          const dept = DEPARTMENTS[currentDept];
          if (dept) {
            document.getElementById('deptCreditsText').textContent = dept.totalCredits + ' Total Credits';
            document.getElementById('deptCredits').style.display = '';
          }
        }
      }

      // Show the start row if hidden
      const startRow = document.getElementById('startSemRow');
      if (startRow) startRow.style.display = 'flex';

      // Wipe old localStorage before applying imported data
      clearState();

      // Build semesters array
      semesterCounter = 0;
      semesters = parsed.semesters.map(s => ({
        id: semesterCounter++,
        name: s.name,
        courses: s.courses,
      }));

      renderSemesters();
      recalc();
      saveState();

      // Scroll to calculator
      const calc = document.getElementById('calculator');
      if (calc) {
        const top = calc.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }

    window.applyImport    = applyImport;
    window.hideImportModal = hideImportModal;

    function initCalculator() {
      document.getElementById('deptCreditsText').textContent = '';
      document.getElementById('deptCredits').style.display = 'none';
      // Try to restore previous session first
      if (!loadState()) {
        renderSemesters();
        recalc();
      }
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