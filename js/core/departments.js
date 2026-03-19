export const DEPARTMENTS = {
  CSE: {
    label: 'B.Sc. in Computer Science and Engineering (CSE)',
    totalCredits: 136,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: [
      { name: 'Fall — Semester 1', courses: [
        { name: 'Programming Language I (CSE110)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
        { name: 'Remedial Mathematics (MAT092)', credits: 0, grade: '' },
        { name: 'Principles of Physics I (PHY111)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Programming Language-II (CSE111)', credits: 3, grade: '' },
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
        { name: 'Circuits and Electronics (CSE250)', credits: 3, grade: '' },
        { name: 'Integral Calculus (MAT120)', credits: 3, grade: '' },
        { name: 'Statistics & Probability (STA201)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'Algorithms (CSE221)', credits: 3, grade: '' },
        { name: 'Computer Architecture (CSE340)', credits: 3, grade: '' },
        { name: 'Software Engineering (CSE470)', credits: 3, grade: '' },
        { name: 'Linear Algebra (MAT215)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 6', courses: [
        { name: 'Database Systems (CSE370)', credits: 3, grade: '' },
        { name: 'Operating Systems (CSE321)', credits: 3, grade: '' },
        { name: 'Computer Networks (CSE421)', credits: 3, grade: '' },
        { name: 'Artificial Intelligence (CSE422)', credits: 3, grade: '' },
      ]},
    ]
  },
  EEE: {
    label: 'BSc EEE — Electrical & Electronic Engineering',
    totalCredits: 136,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: [
      { name: 'Fall — Semester 1', courses: [
        { name: 'Electrical Circuits I (EEE101)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
        { name: 'Differential Calculus (MAT110)', credits: 3, grade: '' },
        { name: 'Principles of Physics I (PHY111)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Computer Programming (EEE103)', credits: 3, grade: '' },
        { name: 'Electrical Circuits II (EEE203)', credits: 3, grade: '' },
        { name: 'Integral Calculus (MAT120)', credits: 3, grade: '' },
        { name: 'Principles of Physics II (PHY112)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Electronic Circuits I (EEE205)', credits: 3, grade: '' },
        { name: 'Signals and Systems (EEE243)', credits: 3, grade: '' },
        { name: 'Linear Algebra (MAT215)', credits: 3, grade: '' },
        { name: 'Statistics & Probability (STA201)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'Energy Conversion I (EEE221)', credits: 3, grade: '' },
        { name: 'Electromagnetic Waves and Fields (EEE241)', credits: 3, grade: '' },
        { name: 'Digital Logic Design (EEE283)', credits: 3, grade: '' },
        { name: 'Numerical Techniques (EEE282)', credits: 3, grade: '' },
      ]},
    ]
  },
  BBA: {
    label: 'Bachelor of Business Administration (BBA)',
    totalCredits: 130,
    seasons: ['Spring', 'Summer', 'Fall'],
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
    seasons: ['Spring', 'Summer', 'Fall'],
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
    seasons: ['Spring', 'Summer', 'Fall'],
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
    label: 'B.Arch. in Architecture (ARC)',
    totalCredits: 207,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: [
      { name: 'Fall — Semester 1', courses: [
        { name: 'Design I: Basic Design (ARC101)', credits: 4.5, grade: '' },
        { name: 'Graphic Communication I (ARC111)', credits: 3, grade: '' },
        { name: 'Introduction to Architecture (ARC121)', credits: 2, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Design II (ARC102)', credits: 4.5, grade: '' },
        { name: 'Graphic Communication II (ARC112)', credits: 1.5, grade: '' },
        { name: 'CAD: Computer Aided Design (ARC113)', credits: 1.5, grade: '' },
        { name: 'History of Art and Architecture I (ARC122)', credits: 2, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'History of Art and Architecture II (ARC123)', credits: 2, grade: '' },
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Design III (ARC201)', credits: 6, grade: '' },
        { name: 'Construction I (ARC241)', credits: 2, grade: '' },
        { name: 'History of Art and Architecture III (ARC224)', credits: 2, grade: '' },
        { name: 'Computer Graphics (ARC214)', credits: 1.5, grade: '' },
      ]},
    ]
  },
  PHR: {
    label: 'B.Sc. in Pharmacy (PHR)',
    totalCredits: 164,
    seasons: ['Spring', 'Summer'],
    presets: [
      { name: 'Spring — Semester 1', courses: [
        { name: 'Inorganic Chemistry I (PHB101)', credits: 3, grade: '' },
        { name: 'Pharmaceutical Microbiology I (PHB102)', credits: 3, grade: '' },
        { name: 'Physiology & Anatomy I (PHB103)', credits: 3, grade: '' },
        { name: 'Organic Chemistry I (PHB104)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 2', courses: [
        { name: 'Inorganic Chemistry II (PHB105)', credits: 3, grade: '' },
        { name: 'Physical Pharmacy I (PHB106)', credits: 3, grade: '' },
        { name: 'Pharmaceutical Microbiology II (PHB108)', credits: 3, grade: '' },
        { name: 'Organic Chemistry II (PHB109)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 3', courses: [
        { name: 'Mathematics and Elementary Statistics (PHB107)', credits: 3, grade: '' },
        { name: 'Pharmacognosy & Herbal Medicine (PHB202)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 4', courses: [
        { name: 'Physical Pharmacy II (PHB203)', credits: 3, grade: '' },
        { name: 'Pharmaceutical Analysis I (PHB204)', credits: 3, grade: '' },
        { name: 'Pharmacology I (PHB205)', credits: 3, grade: '' },
        { name: 'Pharmaceutical Calculations (PHB206)', credits: 3, grade: '' },
      ]},
    ]
  },
  LAW: {
    label: 'Bachelor of Laws (LLB)',
    totalCredits: 135,
    seasons: ['Spring', 'Summer'],
    presets: [
      { name: 'Spring — Semester 1', courses: [
        { name: 'The Jurisprudence of Legal Concepts (LAW101)', credits: 3, grade: '' },
        { name: 'Obligations: Contract Law (LAW102)', credits: 3, grade: '' },
        { name: 'Delict: Law of Tort (LAW103)', credits: 3, grade: '' },
        { name: 'Muslim Family Law and Reforms (LAW202)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 2', courses: [
        { name: 'Constitutional Law (LAW104)', credits: 3, grade: '' },
        { name: 'Equitable Principles and Specific Relief (LAW201)', credits: 3, grade: '' },
        { name: 'Property Law and Transfer (LAW203)', credits: 3, grade: '' },
        { name: 'Law of Registration and Limitation (LAW204)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 3', courses: [
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 4', courses: [
        { name: 'Business Law (LAW205)', credits: 3, grade: '' },
        { name: 'Criminal Law (LAW302)', credits: 3, grade: '' },
        { name: 'Company Law (LAW303)', credits: 3, grade: '' },
        { name: 'International Law (Public) (LAW304)', credits: 3, grade: '' },
      ]},
    ]
  },
};