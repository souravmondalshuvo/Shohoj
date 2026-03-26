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
        { name: 'Business - Basics, Ethics and Environment (BUS102)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
        { name: 'Fundamentals of Mathematics (MAT101)', credits: 3, grade: '' },
        { name: 'Introduction to Statistics (STA101)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Financial Accounting (ACT201)', credits: 3, grade: '' },
        { name: 'Business Communication (BUS201)', credits: 3, grade: '' },
        { name: 'Introduction to Microeconomics (ECO101)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
        { name: 'Introduction to Macroeconomics (ECO102)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Management Accounting (ACT202)', credits: 3, grade: '' },
        { name: 'Management Practices and Organizational Behavior (MGT213)', credits: 3, grade: '' },
        { name: 'Principles of Marketing (MKT201)', credits: 3, grade: '' },
        { name: 'Computer Applications in Business (MSC221)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'Principles of Entrepreneurship (BUS321)', credits: 3, grade: '' },
        { name: 'Financial Environment and Banking (FIN201)', credits: 3, grade: '' },
        { name: 'Quantitative Methods for Business (BUS209)', credits: 3, grade: '' },
        { name: 'Business Law and Corporate Governance (BUS204)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 6', courses: [
        { name: 'International Business (BUS301)', credits: 3, grade: '' },
        { name: 'Financial Management (FIN301)', credits: 3, grade: '' },
        { name: 'Human Resource Management (MGT301)', credits: 3, grade: '' },
        { name: 'Marketing Management (MKT301)', credits: 3, grade: '' },
      ]},
    ]
  },
  ECO: {
    label: 'B.S.S. in Economics (ECO)',
    totalCredits: 120,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: [
      { name: 'Fall — Semester 1', courses: [
        { name: 'Introduction to Microeconomics (ECO101)', credits: 3, grade: '' },
        { name: 'Fundamentals of Mathematics (MAT101)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
        { name: 'Introduction to Statistics (STA101)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Introduction to Macroeconomics (ECO102)', credits: 3, grade: '' },
        { name: 'Mathematics for Business and Economics (ECO201)', credits: 3, grade: '' },
        { name: 'Statistical Methods for Business and Economics (ECO202)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Intermediate Microeconomics I (ECO206)', credits: 3, grade: '' },
        { name: 'Intermediate Macroeconomics I (ECO207)', credits: 3, grade: '' },
        { name: 'Introduction to Econometrics (ECO303)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'Intermediate Microeconomics II (ECO208)', credits: 3, grade: '' },
        { name: 'Intermediate Macroeconomics II (ECO209)', credits: 3, grade: '' },
        { name: 'History of Economic Thought (ECO310)', credits: 3, grade: '' },
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
        { name: 'Introduction to Linguistics (ENG111)', credits: 3, grade: '' },
        { name: 'Introduction to English Poetry (ENG113)', credits: 3, grade: '' },
        { name: 'Fundamentals of Mathematics (MAT101)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
        { name: 'Introduction to English Drama (ENG114)', credits: 3, grade: '' },
        { name: 'Introduction to English Prose (ENG115)', credits: 3, grade: '' },
        { name: 'Introduction to Statistics (STA101)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Survey of English Literature I (ENG213)', credits: 3, grade: '' },
        { name: 'Sociolinguistics (ENG211)', credits: 3, grade: '' },
        { name: 'Discourse Analysis (ENG221)', credits: 3, grade: '' },
        { name: 'The Study of English (ENG242)', credits: 3, grade: '' },
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
    seasons: ['Spring', 'Fall'],
    presets: [
      { name: 'Spring — Semester 1', courses: [
        { name: 'The Jurisprudence of Legal Concepts (LAW101)', credits: 3, grade: '' },
        { name: 'Obligations: Contract Law (LAW102)', credits: 3, grade: '' },
        { name: 'Delict: Law of Tort (LAW103)', credits: 3, grade: '' },
        { name: 'Muslim Family Law and Reforms (LAW202)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 2', courses: [
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
      { name: 'Fall — Semester 4', courses: [
        { name: 'Business Law (LAW205)', credits: 3, grade: '' },
        { name: 'Criminal Law (LAW302)', credits: 3, grade: '' },
        { name: 'Company Law (LAW303)', credits: 3, grade: '' },
        { name: 'International Law (Public) (LAW304)', credits: 3, grade: '' },
      ]},
    ]
  },
  CS: {
    label: 'B.Sc. in Computer Science (CS)',
    totalCredits: 124,
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
        { name: 'Digital Logic Design (CSE260)', credits: 3, grade: '' },
        { name: 'Integral Calculus (MAT120)', credits: 3, grade: '' },
        { name: 'Elements of Statistics and Probability (STA201)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'Algorithms (CSE221)', credits: 3, grade: '' },
        { name: 'Numerical Methods (CSE330)', credits: 3, grade: '' },
        { name: 'Computer Architecture (CSE340)', credits: 3, grade: '' },
        { name: 'Complex Variables & Laplace Transformations (MAT215)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 6', courses: [
        { name: 'Operating Systems (CSE321)', credits: 3, grade: '' },
        { name: 'Automata and Computability (CSE331)', credits: 3, grade: '' },
        { name: 'Database Systems (CSE370)', credits: 3, grade: '' },
        { name: 'Linear Algebra & Fourier Analysis (MAT216)', credits: 3, grade: '' },
      ]},
    ]
  },
  ECE: {
    label: 'B.Sc. in Electronic & Communication Engineering (ECE)',
    totalCredits: 136,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: [
      { name: 'Fall — Semester 1', courses: [
        { name: 'Principles of Physics I (PHY111)', credits: 3, grade: '' },
        { name: 'Principles of Chemistry (CHE110)', credits: 3, grade: '' },
        { name: 'Differential Calculus (MAT110)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Principles of Physics II (PHY112)', credits: 3, grade: '' },
        { name: 'Integral Calculus (MAT120)', credits: 3, grade: '' },
        { name: 'Electrical Circuits I (ECE101)', credits: 3, grade: '' },
        { name: 'Computer Programming (ECE103)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Elements of Statistics and Probability (STA201)', credits: 3, grade: '' },
        { name: 'Complex Variables & Laplace Transformations (MAT215)', credits: 3, grade: '' },
        { name: 'Electrical Circuits II (ECE203)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'Linear Algebra & Fourier Analysis (MAT216)', credits: 3, grade: '' },
        { name: 'Electronic Circuits I (ECE205)', credits: 3, grade: '' },
        { name: 'Numerical Techniques (ECE282)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 6', courses: [
        { name: 'Electromagnetic Waves and Fields (ECE241)', credits: 3, grade: '' },
        { name: 'Signals and Systems (ECE243)', credits: 3, grade: '' },
        { name: 'Digital Logic Design (ECE283)', credits: 3, grade: '' },
      ]},
    ]
  },
  ANT: {
    label: 'B.S.S. in Anthropology (ANT)',
    totalCredits: 120,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: [
      { name: 'Fall — Semester 1', courses: [
        { name: 'Introduction to Anthropology (ANT101)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
        { name: 'Introduction to Sociology (SOC101)', credits: 3, grade: '' },
        { name: 'Fundamentals of Mathematics (MAT101)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Biological Anthropology (ANT104)', credits: 3, grade: '' },
        { name: 'Language, Society and Culture (ANT201)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
        { name: 'Introduction to Statistics (STA101)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Inequality and Power (ANT202)', credits: 3, grade: '' },
        { name: 'Social Theory (ANT203)', credits: 3, grade: '' },
        { name: 'Gender and Society (ANT350)', credits: 3, grade: '' },
        { name: 'World Civilization and Culture (HUM101)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'History of Anthropological Thought (ANT301)', credits: 3, grade: '' },
        { name: 'Politics, Domination and Society (ANT320)', credits: 3, grade: '' },
        { name: 'Economy and Society (ANT321)', credits: 3, grade: '' },
        { name: 'Research Methodology (ANT376)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 6', courses: [
        { name: 'Contemporary Issues in Anthropological Theory (ANT302)', credits: 3, grade: '' },
        { name: 'Anthropology of Development (ANT330)', credits: 3, grade: '' },
        { name: 'Reading Ethnography: Understanding the Anthropological Method (ANT375)', credits: 3, grade: '' },
      ]},
    ]
  },
  PHY: {
    label: 'B.Sc. in Physics (PHY)',
    totalCredits: 132,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: [
      { name: 'Fall — Semester 1', courses: [
        { name: 'Principles of Physics I (PHY111)', credits: 3, grade: '' },
        { name: 'Differential Calculus (MAT110)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
        { name: 'Fundamentals of Physics (PHY102)', credits: 2, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Principles of Physics II (PHY112)', credits: 3, grade: '' },
        { name: 'Integral Calculus (MAT120)', credits: 3, grade: '' },
        { name: 'Waves, Oscillation and Acoustics (PHY113)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Electricity and Magnetism (PHY115)', credits: 3, grade: '' },
        { name: 'Complex Variables & Laplace Transformations (MAT215)', credits: 3, grade: '' },
        { name: 'Elements of Statistics and Probability (STA201)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'Solid State Physics (PHY201)', credits: 3, grade: '' },
        { name: 'Basic Electronics (PHY306)', credits: 3, grade: '' },
        { name: 'Linear Algebra & Fourier Analysis (MAT216)', credits: 3, grade: '' },
      ]},
    ]
  },
  APE: {
    label: 'B.Sc. in Applied Physics & Electronics (APE)',
    totalCredits: 130,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: [
      { name: 'Fall — Semester 1', courses: [
        { name: 'Mechanics, Properties of Matter, Waves & Oscillations (APE101)', credits: 3, grade: '' },
        { name: 'Introduction to Computer Science (CSE101)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
        { name: 'Introduction to Mathematics (MAT102)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Thermal Physics, Radiation & Statistical Mechanics (APE102)', credits: 3, grade: '' },
        { name: 'Electrical Circuits I (APE103)', credits: 3, grade: '' },
        { name: 'Calculus (MAT105)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
        { name: 'Bangladesh Studies (DEV101)', credits: 3, grade: '' },
        { name: 'APE Lab I (APE104)', credits: 1.5, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Solid State Physics & Materials Science (APE201)', credits: 3, grade: '' },
        { name: 'Electrodynamics & Electromagnetic Waves & Fields (APE202)', credits: 3, grade: '' },
        { name: 'Electricity and Magnetism (PHY115)', credits: 3, grade: '' },
        { name: 'Matrices, Linear Algebra & Differential Equations (MAT203)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'Electrical Circuits II (APE203)', credits: 3, grade: '' },
        { name: 'Digital Logic Design (APE204)', credits: 3, grade: '' },
        { name: 'Electronic Devices and Circuits I (APE205)', credits: 3, grade: '' },
        { name: 'Elements of Statistics and Probability (STA201)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 6', courses: [
        { name: 'Complex Variables & Fourier Analysis (MAT204)', credits: 3, grade: '' },
        { name: 'Optics (PHY202)', credits: 3, grade: '' },
        { name: 'APE Lab II (APE206)', credits: 1.5, grade: '' },
      ]},
    ]
  },
  MAT: {
    label: 'B.Sc. in Mathematics (MAT)',
    totalCredits: 127,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: [
      { name: 'Fall — Semester 1', courses: [
        { name: 'Differential Calculus (MAT110)', credits: 3, grade: '' },
        { name: 'Principles of Physics I (PHY111)', credits: 3, grade: '' },
        { name: 'Fundamentals of English (ENG101)', credits: 3, grade: '' },
        { name: 'Fundamentals of Mathematics (MAT101)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 2', courses: [
        { name: 'Integral Calculus (MAT120)', credits: 3, grade: '' },
        { name: 'Basic Algebra (MAT121)', credits: 3, grade: '' },
        { name: 'Principles of Physics II (PHY112)', credits: 3, grade: '' },
        { name: 'English Composition I (ENG102)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 3', courses: [
        { name: 'Bangla Language & Literature (BNG103)', credits: 3, grade: '' },
        { name: 'Emergence of Bangladesh (EMB101)', credits: 3, grade: '' },
        { name: 'Ethics and Culture (HUM103)', credits: 3, grade: '' },
      ]},
      { name: 'Fall — Semester 4', courses: [
        { name: 'Calculus I (MAT123)', credits: 3, grade: '' },
        { name: 'Complex Variables & Laplace Transformations (MAT215)', credits: 3, grade: '' },
        { name: 'Elements of Statistics and Probability (STA201)', credits: 3, grade: '' },
      ]},
      { name: 'Spring — Semester 5', courses: [
        { name: 'Calculus II (MAT211)', credits: 3, grade: '' },
        { name: 'Linear Algebra & Fourier Analysis (MAT216)', credits: 3, grade: '' },
        { name: 'Differential Equations I (MAT222)', credits: 3, grade: '' },
      ]},
      { name: 'Summer — Semester 6', courses: [
        { name: 'Complex Variables & Fourier Analysis (MAT204)', credits: 3, grade: '' },
        { name: 'Introduction to Numerical Methods (MAT205)', credits: 3, grade: '' },
        { name: 'Mathematics Lab I (MAT250)', credits: 2, grade: '' },
      ]},
    ]
  },
  MIC: {
    label: 'B.Sc. in Microbiology (MIC)',
    totalCredits: 136,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: []
  },
  BIO: {
    label: 'B.Sc. in Biotechnology (BIO)',
    totalCredits: 136,
    seasons: ['Spring', 'Summer', 'Fall'],
    presets: []
  },
};