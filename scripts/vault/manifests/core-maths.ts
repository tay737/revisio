/**
 * Core Maths (AQA 1350) — import manifest.
 *
 * Nine topics (spec 3.1–3.4, 3.8–3.10), each with a detailed lesson transcribed
 * from the vault notes plus a summarised revision lesson, a maths practice set
 * pinning the engine concepts each topic examines, exam-simulator papers
 * (specimen QP, June 2022 QP/MS, formulae sheet), and real exam questions with
 * mark-scheme marking, AO splits, model answers and keyword auto-marking.
 *
 * Question data is transcribed from AQA-13501-SQP-CR (specimen), AQA-13501-QP-JUN22
 * and AQA-13501-MS-JUN22. Wording, marks and mark-scheme points as published.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LessonSpec, QuestionSpec, SubjectSpec, TopicSpec } from '../import';
import { cleanPaperMd, CM_ASSETS, readVault } from '../papers';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, p), 'utf8');

// ── lesson bodies from the vault notes ──────────────────────────────────────

/**
 * Split `core-maths-summary.md` into its `## N.N …` sections. The heading is
 * stripped — the lesson title carries it.
 */
function summarySection(no: string): string {
  const all = read('../content/core-maths-summary.md');
  const re = new RegExp(`## ${no.replace('.', '\\.')}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`);
  return re.exec(all)?.[1]?.trim() ?? '';
}

const specLinesByTopic: Record<string, string> = {
  '3.1': [
    '- **D1.1** qualitative vs quantitative; discrete vs continuous; primary vs secondary data',
    '- **D1.2** collecting data: questionnaire, interview, observation, control experiment — strengths and weaknesses',
    '- **D2.1** populations and samples; sampling error vs bias',
    '- **D2.2** sampling methods: simple random, systematic, cluster, stratified, quota',
    '- **D2.3** sample size vs cost, time and accuracy',
    '- **D3.1** mean, median, mode, range, quartiles, IQR, standard deviation from raw data and diagrams',
    '- **D3.2** choosing measures: outlier-sensitivity and skew',
    '- **D4.1** histograms (equal and unequal widths), cumulative frequency, box plots, stem-and-leaf',
    '- **D4.2** frequency density; area = frequency',
  ].join('\n'),
  '3.2': [
    '- **F1.1** substitution; order of operations; limits of accuracy; error intervals',
    '- **F1.2** approximate solutions by trial and improvement',
    '- **F2.1** percentage multipliers; increase/decrease; successive change',
    '- **F2.2** percentage of, percentage change, and finding the original (divide by the multiplier)',
    '- **F2.3** percentage points vs percentage change',
    '- **F3.1** simple and compound interest',
    '- **F3.2** AER from the formulae sheet; AER vs nominal rate; AER vs APR',
    '- **F4.1** cost of credit; APR',
    '- **F4.2** repayment products: student loans, mortgages',
    '- **F5.1** graphical representation of financial products; labelling and reading graphs',
    '- **F6.1** income tax, National Insurance and VAT as multipliers; progressive bands',
    '- **F7.1** inflation and indices (RPI/CPI)',
    '- **F7.2** iteration and spreadsheets; currency exchange with commission; budgeting',
  ].join('\n'),
  '3.3': [
    '- **E1.1** open problem-solving: identify, represent, solve, interpret, evaluate',
    '- **E1.2** the modelling cycle; assumptions vs simplifications',
    '- **E1.3** interpreting results in context',
    '- **E1.4** evaluating models; sources of error',
    '- **E2.1** Fermi estimation: order-of-magnitude reasoning, assumptions, sanity checks',
  ].join('\n'),
  '3.4': [
    '- **C1.1** interrogating claims: does the conclusion follow from that data; sample bias; percentage vs percentage-point confusion',
    '- **C2.1** communicating: context, relevant figures, notation and units, rounding, interpretation, limitations',
    '- **C3.1** comparing a model with data: systematic difference, size, consequence, assumptions',
    '- **C3.2** media data traps: truncated axes, cherry-picked periods, percentage-point confusion, missing baselines, survivorship bias, correlation read as causation',
  ].join('\n'),
  '3.8': [
    '- **R1.1** activity-on-node networks; dependencies; precedence',
    '- **R2.1** early and late times via forwards and backwards passes',
    '- **R2.2** critical activities; the critical path as the longest path; float',
    '- **R3.1** Gantt (cascade) charts; drawing and shading critical activities',
  ].join('\n'),
  '3.9': [
    '- **R4.1** exhaustive outcomes; probabilities sum to 1; estimated probabilities',
    '- **R5.1** Venn and tree diagrams; union/intersection/complement notation',
    '- **R6.1** independent vs dependent events; conditional probability',
    '- **R7.1** expected value E(X) = Σ xᵢpᵢ; long-run average vs prediction',
  ].join('\n'),
  '3.10': [
    '- **R8.1** sources of uncertainty; deciding between risks',
    '- **R9.1** control measures: costs, benefits, insurance, regulatory floors',
    '- **R10.1** expected net value; the regulatory framework; minimising the maximum possible loss',
  ].join('\n'),
};

type Detail = { file: string; title: string; specRefs: string; description: string };

const TOPIC_DETAILS: Record<string, Detail> = {
  '3.1': {
    file: 'core-maths-3.1.md',
    title: 'Analysis of data',
    specRefs: '3.1 (D1–D4)',
    description: 'Types of data, sampling (including stratified), averages and spread, histograms, box plots and cumulative frequency.',
  },
  '3.2': {
    file: 'core-maths-3.2.md',
    title: 'Maths for personal finance',
    specRefs: '3.2 (F1–F7)',
    description: 'Percentages and multipliers, interest and AER, credit and APR, tax and VAT, exchange, budgeting.',
  },
  '3.3': {
    file: 'core-maths-3.3.md',
    title: 'Estimation',
    specRefs: '3.3 (E1–E2)',
    description: 'The modelling cycle and Fermi estimation — assumptions, order-of-magnitude working, interpretation and evaluation.',
  },
  '3.4': {
    file: 'core-maths-3.4.md',
    title: 'Critical analysis of data and models',
    specRefs: '3.4 (C1–C3)',
    description: 'Interrogating claims and media statistics: bias, percentage-point traps, misleading graphs, model vs data.',
  },
  '3.8': {
    file: 'core-maths-3.8.md',
    title: 'Critical path analysis',
    specRefs: '3.8 (R1–R3)',
    description: 'Activity-on-node networks, forwards/backwards passes, critical activities, float and Gantt charts.',
  },
  '3.9': {
    file: 'core-maths-3.9.md',
    title: 'Expectation and probability',
    specRefs: '3.9 (R4–R7)',
    description: 'Probability estimation, tree and Venn diagrams, combined events, expected value of a random variable.',
  },
  '3.10': {
    file: 'core-maths-3.10.md',
    title: 'Cost benefit analysis',
    specRefs: '3.10 (R8–R10)',
    description: 'Deciding under uncertainty: expected net value, control measures, regulation, worst-case thinking.',
  },
};

function buildLessons(no: string): LessonSpec[] {
  const d = TOPIC_DETAILS[no];
  const detailed = read(`../content/${d.file}`).trim();
  const summary = summarySection(no);
  const specLines = specLinesByTopic[no] ?? '';
  return [
    {
      id: `cm:${no}:detailed`,
      title: `${d.title} — detailed notes`,
      detailedMd: `${detailed}\n\n## Specification lines covered\n\n${specLines}\n`,
      summaryMd: summary,
      specRefs: d.specRefs,
    },
    {
      id: `cm:${no}:summary`,
      title: `${d.title} — revision summary`,
      detailedMd: [
        `# ${d.title} — revision summary`,
        '',
        summary,
        '',
        '## How to use this page',
        '',
        `Revise from these bullets, then test yourself with the maths practice set and the real exam questions under **${d.title} — detailed notes**. The detailed notes carry the full explanations, worked examples and the exact specification lines (D1–D4, F1–F7, E1–E2, C1–C3, R1–R10) each bullet maps to.`,
        '',
        '## Specification lines covered',
        '',
        specLines,
      ].join('\n'),
      summaryMd: summary,
      specRefs: d.specRefs,
    },
  ];
}

function mathSetFor(no: string): NonNullable<TopicSpec['mathSet']> | undefined {
  switch (no) {
    case '3.1':
      return {
        id: 'cm-set:3.1',
        title: 'Core Maths practice — data & sampling',
        description: 'Stratified samples, means from tables, and probability warm-ups aligned to spec 3.1.',
        concepts: ['cm-stratified-sample', 'mean', 'rounding', 'percent-change', 'ratio'],
        defaultCount: 10,
        defaultDifficulty: 'mixed',
      };
    case '3.2':
      return {
        id: 'cm-set:3.2',
        title: 'Core Maths practice — personal finance',
        description: 'Reverse percentages, interest, AER, tax bands and exchange — the engine room of Paper 1.',
        concepts: ['cm-percent-original', 'cm-simple-compound', 'cm-aer', 'cm-tax-bands', 'cm-exchange', 'percent-of', 'percent-change'],
        defaultCount: 12,
        defaultDifficulty: 'mixed',
      };
    case '3.3':
      return {
        id: 'cm-set:3.3',
        title: 'Core Maths practice — estimation',
        description: 'Fermi problems: build estimateable parts, multiply, sanity-check the order of magnitude.',
        concepts: ['cm-fermi', 'unit-conversion', 'rounding', 'multiply', 'divide'],
        defaultCount: 8,
        defaultDifficulty: 'mixed',
      };
    case '3.4':
      return {
        id: 'cm-set:3.4',
        title: 'Core Maths practice — critical analysis drills',
        description: 'Percentage change vs percentage points and mean-versus-outlier judgement — the arithmetic behind 3.4.',
        concepts: ['percent-change', 'cm-percent-original', 'mean', 'rounding'],
        defaultCount: 8,
        defaultDifficulty: 'mixed',
      };
    case '3.8':
      return {
        id: 'cm-set:3.8',
        title: 'Core Maths practice — critical path',
        description: 'Critical path and float arithmetic on activity networks.',
        concepts: ['cm-critical-path', 'add-subtract'],
        defaultCount: 8,
        defaultDifficulty: 'mixed',
      };
    case '3.9':
      return {
        id: 'cm-set:3.9',
        title: 'Core Maths practice — expectation',
        description: 'Tree diagrams and expected value: multiply along paths, add across paths, weight by probability.',
        concepts: ['cm-expected-value', 'cm-tree-probability', 'probability', 'fractions-of'],
        defaultCount: 10,
        defaultDifficulty: 'mixed',
      };
    case '3.10':
      return {
        id: 'cm-set:3.10',
        title: 'Core Maths practice — cost benefit',
        description: 'Expected net value with costs, benefits and probabilities — then argue beyond the average.',
        concepts: ['cm-expected-value', 'cm-tree-probability', 'percent-of'],
        defaultCount: 8,
        defaultDifficulty: 'mixed',
      };
    default:
      return undefined;
  }
}

function buildTopics(): TopicSpec[] {
  const order = ['3.1', '3.2', '3.3', '3.4', '3.8', '3.9', '3.10'];
  const topics: TopicSpec[] = order.map((no, i) => {
    const d = TOPIC_DETAILS[no];
    return {
      id: `cm:${no}`,
      name: `${no} ${d.title}`,
      description: d.description,
      position: i + 1,
      lessons: buildLessons(no),
      mathSet: mathSetFor(no),
    };
  });

  topics.push({
    id: 'cm:paper1',
    name: 'Paper 1 exam workshop',
    description: 'How Paper 1 (1350/1) works: Preliminary Material, formulae sheet, AO weightings, and the real questions to practise on.',
    position: 8,
    lessons: [
      {
        id: 'cm:paper1:briefing',
        title: 'Paper 1 exam workshop — briefing',
        detailedMd: [
          '# Paper 1 — exam workshop',
          '',
          '**Format.** 1 hour 30 minutes, 60 marks, calculator allowed. A clean copy of the **Preliminary Material** and the **formulae sheet** is issued in the exam. The marks for each question are shown in brackets; final answers should be given to an appropriate degree of accuracy, and **show all necessary working — otherwise marks for method may be lost**.',
          '',
          '**Assessment objectives (Paper 1).** AO1 (understand and apply) ~25–30%, AO2 (solve problems in context) ~31–40%, AO3 (interpret, communicate, evaluate) ~31–40%. Over half the marks reward selecting techniques and communicating reasoning, not just computing.',
          '',
          '## How marks are actually awarded',
          '',
          '- **M marks** are for *method*: the correct structure (a multiplier, a weighted mean, a stratified fraction) even with arithmetic slips.',
          '- **A marks** are for accurate values **following through** from your own earlier values (ft) — a wrong mean used correctly still earns the later marks.',
          '- **B marks** are standalone statements: an assumption in range, a correct spreadsheet formula, a correct five-figure summary.',
          '- Estimation questions (Fermi) award marks for **assumptions in stated ranges** and an **accurate answer for your own assumptions** — there is no single right number.',
          '- "You must show your working" questions are marked as if working is shown even if it is missing, so never leave them blank.',
          '',
          '## Command words',
          '',
          '- **Circle / State / Write down** — no working needed.',
          '- **Calculate / Work out** — show the method.',
          '- **Estimate** — state assumptions; accuracy is judged against your assumptions.',
          '- **Explain / Comment on** — a reason, in context.',
          '- **Show that / Is the claim justified** — compute both sides and finish with a decision sentence.',
          '',
          '## The formulae sheet',
          '',
          'AER and APR are printed: $r=(1+\\tfrac{i}{n})^{n}-1$ with $i,r$ as **decimals**, and the APR discounting sum. Cone, sphere and pyramid volumes are included too. The sheet is provided — the skill is knowing *when* each formula applies, which is what the 3.2 practice set drills.',
        ].join('\n'),
        summaryMd: [
          'Paper 1: 1h30, 60 marks, calculator, Preliminary Material + formulae sheet provided.',
          '',
          '- M marks = method, A marks = accuracy **ft your own values**, B marks = standalone facts. Estimation questions credit assumptions in range and answers consistent with them.',
          '- Show working — "marks for method may be lost" is printed on the paper.',
          '- AO2 + AO3 carry ~70%: the exam rewards selecting techniques and communicating, not just arithmetic.',
        ].join('\n'),
        specRefs: 'Paper 1 (AQA 1350/1)',
      },
    ],
  });

  topics.push({
    id: 'cm:paper2b',
    name: 'Paper 2B exam workshop',
    description: 'Paper 2B (1350/2B) format: statistical literacy, the pre-release data pack, and how the AO weightings differ from Paper 1.',
    position: 9,
    lessons: [
      {
        id: 'cm:paper2b:briefing',
        title: 'Paper 2B exam workshop — briefing',
        detailedMd: [
          '# Paper 2B — exam workshop',
          '',
          '**Format.** 1 hour 30 minutes, 60 marks, calculator allowed. Paper 2B is the *statistical literacy* variant of Paper 2: it always sits on the pre-release **data pack** (five real datasets issued in advance), and its questions are built around comparing, interpreting and criticising real data.',
          '',
          '**What that means for revision.**',
          '',
          '- Know the data pack variables inside out — every 2B paper since 2016 asks you to compare or combine variables from it, and the Preliminary Material reprints summary tables from it.',
          '- The core skill is the modelling cycle from 3.1–3.4 applied to *real* data: compute a measure, **interpret in context**, then **criticise the claim** (bias, sampling, percentage points, misleading diagrams).',
          '- Structured extended questions follow the same shape every year: calculate (AO1/AO2) → compare or interpret (AO2) → evaluate the reliability or the claim (AO3). Aim to finish every response with a decision sentence that names the measure you used.',
          '',
          '**Assessment objectives.** Paper 2 mirrors Paper 1\u2019s profile: AO1 ~25–30%, AO2 ~31–40%, AO3 ~31–40% — over half the marks for interpretation and communication.',
        ].join('\n'),
        summaryMd: [
          'Paper 2B: 1h30, 60 marks, calculator, built on the pre-release data pack.',
          '',
          '- Every paper compares or combines data-pack variables — learn the variables and their units before anything else.',
          '- The repeating question shape: calculate → interpret in context → criticise the claim (bias, sampling, percentage points, misleading diagrams).',
          '- Finish every interpretive answer with a decision sentence naming the measure used — that sentence is where AO3 lives.',
        ].join('\n'),
        specRefs: 'Paper 2B (AQA 1350/2B)',
      },
    ],
  });

  return topics;
}

// ── papers (QP/MS/DB transcriptions, cleaned) ───────────────────────────────

const specimenQpRaw = readVault(CM_ASSETS, 'Question Papers', 'AQA-13501-SQP-CR.md');
const jun22QpRaw = readVault(CM_ASSETS, 'Question Papers', 'AQA-13501-QP-JUN22.md');
const jun22MsRaw = readVault(CM_ASSETS, 'Mark Schemes', 'AQA-13501-MS-JUN22.md');
const dbJun22Raw = readVault(CM_ASSETS, 'Formulae Sheets', 'AQA-13501-DB-JUN22.md');

// The formulae sheet note carries both a faithful transcription and a garbled
// raw dump; keep the transcription half only.
const dbJun22Clean = cleanPaperMd(dbJun22Raw.split('## Raw text extraction')[0]);

// ── exam questions ──────────────────────────────────────────────────────────

const QUESTIONS: QuestionSpec[] = [
  {
    id: 'cmq:13501-spec:q1a',
    topicId: 'cm:3.1',
    questionRef: 'Specimen Paper 1 Q1(a)',
    questionMd: [
      'Rasheed is collecting data about cars in a car park.',
      '',
      'Draw a line from each variable on the left to the type of data it is. (In this practice version, choose the type for the **amount of time each car is in the car park**.)',
      '',
      'Variables: the amount of time each car is in the car park; the make of each car; the number of people in each car when it arrives.',
    ].join('\n'),
    marks: 3,
    markSchemeMd: [
      '**B1** for each correct classification, up to three marks (any two lines from one box on the left is a choice and scores zero):',
      '',
      '- amount of time each car is in the car park → **quantitative and continuous**',
      '- make of each car → **qualitative and discrete** (as presented by the mark scheme: a category label)',
      '- number of people in each car → **quantitative and discrete**',
    ].join('\n'),
    modelAnswerMd: [
      '- Time in the car park is **quantitative and continuous** — it is measured and can take any value in a range (e.g. 23.4 minutes).',
      '- Make of car is **qualitative and discrete** — a category label, not a measurement.',
      '- Number of people is **quantitative and discrete** — a count, so only whole values make sense.',
    ].join('\n'),
    markingNotesMd: 'One mark per correct classification. The discrete/continuous test: ask whether a fractional value makes sense ("half a person" does not; "15.4 minutes" does).',
    aoSplit: [{ ao: 'AO1', marks: 3 }],
    specRefs: '3.1 D1.1',
    kind: 'mcq',
    options: ['Qualitative and discrete', 'Qualitative and continuous', 'Quantitative and continuous', 'Quantitative and discrete'],
    correctIdx: 2,
    keywords: undefined,
    board: 'AQA',
  },
  {
    id: 'cmq:13501-spec:q1b',
    topicId: 'cm:3.1',
    questionRef: 'Specimen Paper 1 Q1(b)',
    questionMd: [
      'Rob wants to find out what students and staff think about the parking at his college.',
      '',
      'The table shows information about the students and staff.',
      '',
      '| | Students aged 16–18 | Students aged 19+ | Staff |',
      '| --- | ---: | ---: | ---: |',
      '| Male | 345 | 129 | 56 |',
      '| Female | 406 | 162 | 42 |',
      '',
      'Rob decides to take a stratified sample of 80 from these groups of students and staff.',
      '',
      'Work out the number of male students aged 19+ that should be in the sample.',
    ].join('\n'),
    marks: 2,
    markSchemeMd: [
      '**M1** for $\\dfrac{129}{345+406+129+162+56+42}\\times 80$ or $\\dfrac{129}{1140}\\times 80$ or $0.113\\ldots \\times 80$ — **oe**',
      '',
      '**A1** 9 with no incorrect method or total seen',
      '',
      '*Guidance:* use of 0.11 leading to 8.8 which rounds to 9 scores M1 A0. Rounding to 9 from a value not in [9.03, 9.1] can gain max M1.',
    ].join('\n'),
    modelAnswerMd: [
      'Total population: $345+406+129+162+56+42 = 1140$.',
      '',
      'Stratified sample size for male students aged 19+: $\\dfrac{129}{1140} \\times 80 = 9.05\\ldots$',
      '',
      '**9 male students aged 19+** should be in the sample.',
    ].join('\n'),
    markingNotesMd: 'Method mark for the stratum share × sample size; accuracy mark for exactly 9. Totalling the population is part of the method — adding only part of the table loses the M1.',
    aoSplit: [{ ao: 'AO1', marks: 1 }, { ao: 'AO2', marks: 1 }],
    specRefs: '3.1 D2.2',
    keywords: [
      { required: true, phrase: '129', synonyms: ['male students aged 19', 'male 19+'] },
      { required: true, phrase: '1140', synonyms: ['345 + 406 + 129 + 162 + 56 + 42'] },
      { required: true, phrase: '80' },
      { required: true, phrase: '9' },
    ],
    minPoints: 3,
    sourceYear: undefined,
    board: 'AQA',
  },
  {
    id: 'cmq:13501-spec:q2',
    topicId: 'cm:3.2',
    questionRef: 'Specimen Paper 1 Q2',
    questionMd: [
      'Use Income Tax and National Insurance rates in the Preliminary Material.',
      '',
      'Tara has a gross income of £38 000 per year.',
      '',
      'She has the standard personal allowance and pays the basic rate of Income Tax and the basic rate of National Insurance on her taxable income.',
      '',
      'Work out Tara\u2019s total annual deduction for Income Tax and National Insurance.',
    ].join('\n'),
    marks: 3,
    markSchemeMd: [
      'Award marks for the progressive-band method (specimen guidance):',
      '',
      '- **B1** taxable income = £38 000 − £12 570 = £25 430 (only the slice above the allowance is taxed)',
      '- **B1** Income Tax = £25 430 × 20% = £5086, **or** National Insurance at the basic rate on the portion above the NI primary threshold',
      '- **B1** a correct total of the deductions consistent with their figures',
      '',
      '*Guidance:* taxing the whole £38 000 at 20% is the classic error and loses the first mark. Rates come from the Preliminary Material for the year of the paper.',
    ].join('\n'),
    modelAnswerMd: [
      'Taxable income: $38\\,000 - 12\\,570 = 25\\,430$.',
      '',
      'Income Tax at 20%: $25\\,430 \\times 0.20 = £5086.00$.',
      '',
      'National Insurance (2021–22 primary threshold £9568, basic 12%): $(25\\,430 - 9568) \\times 0.12$ on the slice above the threshold… in whole-year terms: $(38\\,000 - 9568) \\times 0.12 = £3411.84$.',
      '',
      'Total deductions: $5086.00 + 3411.84 = £8497.84$ per year.',
    ].join('\n'),
    markingNotesMd: 'Progressive bands: only the slice in each band pays that band\u2019s rate. State which rates you are using (they come from the Preliminary Material).',
    aoSplit: [{ ao: 'AO1', marks: 1 }, { ao: 'AO2', marks: 2 }],
    specRefs: '3.2 F6.1',
    keywords: [
      { required: true, phrase: '12570', synonyms: ['12 570'] },
      { required: true, phrase: '25430', synonyms: ['25 430'] },
      { required: true, phrase: '20%', synonyms: ['0.2', '0.20'] },
    ],
    minPoints: 3,
    board: 'AQA',
  },
  {
    id: 'cmq:13501-jun22:q4b',
    topicId: 'cm:3.2',
    questionRef: 'June 2022 Paper 1 Q4(b)',
    questionMd: [
      'Jessica invests an amount in a variable rate savings account.',
      '',
      'The account receives compound interest at:',
      '',
      '- 2.4% per year for the first 2 years, then',
      '- 3.1% per year for the next 5 years.',
      '',
      'Jessica says, "My investment will increase by 20.3%, because 2 × 2.4 + 5 × 3.1 = 20.3."',
      '',
      'By calculating the correct percentage increase, show that she is wrong.',
    ].join('\n'),
    marks: 4,
    markSchemeMd: [
      '**M1** 1.024 or 1.031 seen (multipliers implied)',
      '',
      '**M1dep** $1.024^{2}$ and $1.031^{5}$',
      '',
      '**M1** $1.024^{2} \\times 1.031^{5}$ or $[1.22, 1.222]$ — **oe** (e.g. £100 × 1.024² × 1.031⁵ = £122.1…; year-on-year working implying this method scores M3)',
      '',
      '**A1** [22, 22.2] (%)',
      '',
      '*Guidance:* calculations worked out separately must be to at least 3 decimal places — rounding each year to 3 d.p. first gives 1.049 × 1.165 = 1.222, which still reaches 22.2%.',
    ].join('\n'),
    modelAnswerMd: [
      'Convert each rate to a multiplier and apply it for the number of years it runs:',
      '',
      '$1.024^{2} \\times 1.031^{5} = 1.048576 \\times 1.165364\\ldots = 1.2219\\ldots$',
      '',
      'Overall increase $= 22.2\\%$ (to 1 d.p.), **not** 20.3%.',
      '',
      'Jessica\u2019s error: she added percentages instead of multiplying multipliers. Compound percentages multiply: $0.024$ twice and $0.031$ five times do not sum — each year\u2019s interest is charged on a bigger balance, so the true growth (22.2%) is larger than the naive sum (20.3%).',
    ].join('\n'),
    markingNotesMd: 'M marks for building and using the multipliers, A for the percentage. The "show that she is wrong" finish is the computed percentage compared with 20.3%.',
    aoSplit: [{ ao: 'AO1', marks: 1 }, { ao: 'AO2', marks: 3 }],
    specRefs: '3.2 F2.1, F3.1',
    keywords: [
      { required: true, phrase: '1.024', synonyms: ['2.4%', '0.024'] },
      { required: true, phrase: '1.031', synonyms: ['3.1%', '0.031'] },
      { required: true, phrase: '1.222', synonyms: ['1.22', '122', '22.2%', '22%'] },
      { required: true, phrase: 'wrong', synonyms: ['not 20.3', 'higher than 20.3', 'more than 20.3'] },
    ],
    minPoints: 3,
    sourceYear: 2022,
    board: 'AQA',
  },
  {
    id: 'cmq:13501-jun22:q5',
    topicId: 'cm:3.3',
    questionRef: 'June 2022 Paper 1 Q5',
    questionMd: [
      'Estimate the number of hours in a year that a washing machine is in use in an average household.',
      '',
      'State any assumptions you make.',
      '',
      'You must show your working.',
    ].join('\n'),
    marks: 4,
    markSchemeMd: [
      '**B2** makes an assumption about the number of hours per week (or month) a washing machine is on for an average household — allow 3 to 21 per week (or 12 to 90 per month)',
      '',
      'or **B1** assumption about days per week/month it is on (3–7 per week; 12–30 per month) or hours a day it is on (1–3 hours)',
      '',
      '**M1** their days per week × hours per day × weeks in a year — **oe** (allow 48–52 weeks; 336–365 days per year)',
      '',
      '**A1** accurate answer for *their* calculation (decimal answers allowed)',
      '',
      '*Guidance:* for the final 2 marks they may use numbers outside the allowed ranges for the assumptions. The answer is judged against the assumptions, not against a fixed value.',
    ].join('\n'),
    modelAnswerMd: [
      'Assumptions: an average household runs **4 washes a week**; each cycle takes **1.5 hours**.',
      '',
      'Hours per year: $4 \\times 1.5 \\times 52 = 312$ hours.',
      '',
      '**≈ 312 hours a year** (about 13 full days). Sanity check: just over an hour a day for a family household is plausible — the order of magnitude is right.',
    ].join('\n'),
    markingNotesMd: 'Fermi questions are marked on the assumptions (in range) and on the arithmetic being consistent with them. State the assumption, then use it.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO2', marks: 2 }],
    specRefs: '3.3 E2.1',
    keywords: [
      { required: true, phrase: 'assume', synonyms: ['assumption', 'assuming'] },
      { required: true, phrase: 'week', synonyms: ['per week', 'weekly', 'month', 'day'] },
      { required: true, phrase: '52', synonyms: ['365', '12 months', 'year'] },
    ],
    minPoints: 3,
    sourceYear: 2022,
    board: 'AQA',
  },
  {
    id: 'cmq:13501-jun22:q6',
    topicId: 'cm:3.2',
    questionRef: 'June 2022 Paper 1 Q6',
    questionMd: [
      'Use Income Tax and National Insurance 2021–2022 in the Preliminary Material.',
      '',
      'John has a gross income of £49 000 per year.',
      '',
      '8% of his gross income is deducted and paid into his company pension.',
      '',
      'He pays Income Tax and National Insurance, but has no further deductions. He has the standard personal allowance. The pension amount is deducted before Income Tax and National Insurance are calculated.',
      '',
      'John wants to move to a new flat, which will cost £1050 per month to rent.',
      '',
      'He says, "I will only be able to afford the rent if it is less than 2⁄5 of my net monthly income."',
      '',
      'Can John afford the rent? You must show your working.',
    ].join('\n'),
    marks: 8,
    markSchemeMd: [
      '**M1** $49\\,000 \\times 0.92$ or $49\\,000 - (49\\,000 \\times 0.08)$ or £45 080 — the pension comes off first',
      '',
      '**M1** (their 45 080 − 12 570) × 0.2 or £6502 — Income Tax, standard rate',
      '',
      '**M1** (their 45 080 − 9568) × 0.12 or £4261.44 — National Insurance, basic rate (allow 9568.01)',
      '',
      '**M1** their 6502 + their 4261.44 (total tax and NI — £10 763.44 scores M4 at this stage)',
      '',
      '**M1** their 45 080 − their 10 763.44',
      '',
      '**A1** £34 316.56 annual net pay',
      '',
      '**M1** (their 34 316.56 ÷ 12) × 2⁄5 or £1143…, **or** (1050 × 12) ÷ their 34 316.56 or 0.367…, — **oe**',
      '',
      '**A1ft** £1143… and **Yes** (or 0.367… and 0.4 and **Yes**) — ft their annual net pay',
      '',
      '*Guidance:* if the 8% pension deduction is not deducted a maximum of 6 marks can be scored. Monthly and annual routes both reach the same final answer (government rounding makes the monthly net pay £2859.67; either is accepted).',
    ].join('\n'),
    modelAnswerMd: [
      'Pension first: $49\\,000 \\times 0.92 = £45\\,080$ taxable-equivalent income.',
      '',
      'Income Tax (2021–22): only the slice above the £12 570 allowance is taxed at 20%: $(45\\,080 - 12\\,570) \\times 0.20 = £6502.00$.',
      '',
      'National Insurance: the slice above the £9568 primary threshold at 12%: $(45\\,080 - 9568) \\times 0.12 = £4261.44$.',
      '',
      'Net income: $45\\,080 - 6502.00 - 4261.44 = £34\\,316.56$ a year, so $£34\\,316.56 ÷ 12 = £2859.71$ a month.',
      '',
      'Two-fifths of net monthly income: $2859.71 \\times \\tfrac{2}{5} = £1143.88$.',
      '',
      'Rent £1050 is less than £1143.88, so **yes — John can afford the flat** (rent ≈ 36.7% of net monthly income).',
    ].join('\n'),
    markingNotesMd: 'The structured M chain is the point: pension → tax → NI → net → compare. Taxing the whole salary at 20% or forgetting the pension costs method marks even with a "yes". Finish with the decision sentence.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO2', marks: 6 }],
    specRefs: '3.2 F6.1, F7.2',
    keywords: [
      { required: true, phrase: '45080', synonyms: ['45 080', '8%', 'pension'] },
      { required: true, phrase: '6502', synonyms: ['6 502', '20%'] },
      { required: true, phrase: '4261.44', synonyms: ['4 261.44', '12%', '355.16'] },
      { required: true, phrase: '34316.56', synonyms: ['34 316.56', '34316.08', '2859.71', '2859.67', '2 859.71'] },
      { required: true, phrase: '1143', synonyms: ['1 143', '0.37', '0.36', '2/5', '40%'] },
      { required: true, phrase: 'yes', synonyms: ['can afford', 'afford'] },
    ],
    minPoints: 5,
    sourceYear: 2022,
    board: 'AQA',
  },
  {
    id: 'cmq:13501-jun22:q9a',
    topicId: 'cm:3.3',
    questionRef: 'June 2022 Paper 1 Q9(a)',
    questionMd: [
      'Use Sweet Factory in the Preliminary Material. You may also use the Formulae Sheet.',
      '',
      'The factory is making a new sweet. The sweet will be a **sphere of radius 0.8 cm**. The sweets will be packaged into **cylindrical tubes of radius 2 cm and height 10 cm**.',
      '',
      'One machine will be used for these new sweets. It will take an hour and a half before the first sweets are produced and packaged. Once the first sweets come off the production line in their tubes, production is continuous until the end of the day.',
      '',
      'Estimate how many tubes of sweets can be filled in one working day.',
      '',
      'Give your answer to a suitable degree of accuracy. State any assumptions you make. You must show your working.',
    ].join('\n'),
    marks: 9,
    markSchemeMd: [
      '**B1** assumption about hours the factory is open per day (allow 8 to 18; production hours 5 to 17, i.e. after deducting the 1.5-hour start-up)',
      '',
      '**B1** assumption about sweets produced per minute — must be [12 000, 16 000] (implied by being used in a calculation)',
      '',
      '**M1** volume of a sweet: $\\tfrac{4}{3}\\pi \\times 0.8^{3}$ or ≈ 2.14 cm³',
      '',
      '**M1** volume of the tube: $\\pi \\times 2^{2} \\times 10$ or ≈ 125.7 cm³',
      '',
      '**B1** assumption of waste space deducted — allow 20% to 60% wasted space (may be implied)',
      '',
      '**M1** divides their tube volume by their sweet volume with the deduction for wastage (e.g. $125.7 \\times 0.6 ÷ 2.14$)',
      '',
      '**M1** their production hours × 60 × their sweets per minute — number of sweets per day',
      '',
      '**M1** their sweets per day ÷ their sweets per tube — sweets per tube must be an integer',
      '',
      '**A1ft** correct total for their assumptions, with the final two method marks scored; answer cannot be a decimal (may be rounded suitably, e.g. to the nearest 10, 100 or 1000)',
    ].join('\n'),
    modelAnswerMd: [
      'Assumptions: the factory runs a **10-hour day**, so production runs for $10 - 1.5 = 8.5$ hours. The machine makes **15 000 sweets a minute**. About **40%** of a tube\u2019s volume is wasted space around the sweets.',
      '',
      'Volume of one sweet: $\\tfrac{4}{3}\\pi \\times 0.8^{3} = 2.14$ cm³ (3 s.f.).',
      '',
      'Volume of a tube: $\\pi \\times 2^{2} \\times 10 = 125.7$ cm³ (3 s.f.).',
      '',
      'Usable volume: $125.7 \\times 0.6 = 75.4$ cm³, so sweets per tube: $75.4 ÷ 2.14 = 35.2 →$ **35 sweets per tube** (whole sweets only).',
      '',
      'Sweets per day: $8.5 \\times 60 \\times 15\\,000 = 7\\,650\\,000$.',
      '',
      'Tubes per day: $7\\,650\\,000 ÷ 35 = 218\\,571.4…$',
      '',
      '**≈ 219 000 tubes** (to the nearest thousand).',
    ].join('\n'),
    markingNotesMd: 'Nine marks for the modelling chain: two assumptions in range, two volumes, a wastage allowance, and three linking steps. A wrong volume still earns the later method marks if the structure is right (ft). The A1 requires the final two method marks and an integer answer.',
    aoSplit: [{ ao: 'AO1', marks: 3 }, { ao: 'AO2', marks: 4 }, { ao: 'AO3', marks: 2 }],
    specRefs: '3.3 E1.2, E2.1',
    keywords: [
      { required: true, phrase: '4/3', synonyms: ['4π/3', 'volume of sphere', '1.33'] },
      { required: true, phrase: '0.8', synonyms: ['0.8³', '0.8^3'] },
      { required: true, phrase: '125.7', synonyms: ['125.66', '40π', '126'] },
      { required: true, phrase: 'waste', synonyms: ['wastage', 'wasted space', 'packing', 'air space'] },
      { required: true, phrase: 'tube', synonyms: ['tubes'] },
    ],
    minPoints: 4,
    sourceYear: 2022,
    board: 'AQA',
  },
];

// ── the subject spec ────────────────────────────────────────────────────────

const coreMaths: SubjectSpec = {
  id: 'core-maths',
  name: 'Core Maths (AQA 1350)',
  slug: 'core-maths-aqa-1350',
  description:
    'AQA Level 3 Certificate Mathematical Studies (1350): Paper 1 (data, personal finance, estimation, critical analysis) and Paper 2B (statistical literacy on the pre-release data pack), with critical path, expectation and cost benefit analysis.',
  mathsEnabled: true,
  topics: buildTopics(),
  papers: [
    {
      id: 'cmp:13501-spec-qp',
      kind: 'question_paper',
      title: 'Paper 1 — Specimen Question Paper (1350/1)',
      board: 'AQA',
      series: 'Specimen',
      paperCode: '1350/1',
      totalMarks: 60,
      durationMinutes: 90,
      contentMd: cleanPaperMd(specimenQpRaw),
    },
    {
      id: 'cmp:13501-jun22-qp',
      kind: 'question_paper',
      title: 'Paper 1 — Question Paper, June 2022 (1350/1)',
      board: 'AQA',
      series: 'June 2022',
      paperCode: '1350/1',
      totalMarks: 60,
      durationMinutes: 90,
      contentMd: cleanPaperMd(jun22QpRaw),
    },
    {
      id: 'cmp:13501-jun22-ms',
      kind: 'mark_scheme',
      title: 'Paper 1 — Mark Scheme, June 2022 (1350/1)',
      board: 'AQA',
      series: 'June 2022',
      paperCode: '1350/1',
      totalMarks: 60,
      contentMd: cleanPaperMd(jun22MsRaw),
    },
    {
      id: 'cmp:13501-db-jun22',
      kind: 'formulae_sheet',
      title: 'Formulae Sheet, June 2022 (1350/1)',
      board: 'AQA',
      series: 'June 2022',
      paperCode: '1350/1',
      contentMd: dbJun22Clean,
    },
  ],
  questions: QUESTIONS,
};

export default coreMaths;
