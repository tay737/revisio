import 'dotenv/config';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';

// Reseed target: the Postgres database in DATABASE_URL (Supabase).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL ?? '').includes('localhost') ? undefined : { rejectUnauthorized: false },
  max: 4,
});

// Clean reseed: wipe data (schema is managed by drizzle migrations), then re-insert below.
const TABLES = [
  'audit_log', 'feature_flags', 'imports', 'class_memberships', 'classes',
  'league_memberships', 'user_achievements', 'achievements', 'streaks', 'xp_events',
  'exam_attempts', 'exam_questions', 'cram_sessions', 'review_logs', 'card_user_states',
  'user_topic_states', 'user_subjects', 'card_answers', 'cards', 'lessons', 'topics',
  'subjects', 'approval_requests', 'refresh_tokens', 'email_tokens', 'users',
];
await pool.query(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);

const db = drizzle(pool, { schema });

const hash = (pw: string) => bcrypt.hashSync(pw, 10);
const now = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const tomorrow = new Date(Date.now() + 86_400_000);

// Schema is created beforehand: `npm run db:push` (drizzle-kit push, Postgres).

// ── Users ───────────────────────────────────────────────────────────────────
const [devUser] = await db
  .insert(schema.users)
  .values({
    id: uuid(), email: 'dev@srs.dev', name: 'Dev Admin', passwordHash: hash('Password123!'),
    role: 'developer', status: 'active', emailVerifiedAt: now(),
  })
  .returning();

const [teacher] = await db
  .insert(schema.users)
  .values({
    id: uuid(), email: 'teacher@srs.dev', name: 'Ms. Pearson', passwordHash: hash('Password123!'),
    role: 'teacher', status: 'active', emailVerifiedAt: now(),
  })
  .returning();

const [student] = await db
  .insert(schema.users)
  .values({
    id: uuid(), email: 'student@srs.dev', name: 'Alex Rivera', passwordHash: hash('Password123!'),
    role: 'student', status: 'active', emailVerifiedAt: now(),
  })
  .returning();

const [pendingTeacher] = await db
  .insert(schema.users)
  .values({
    id: uuid(), email: 'newteacher@srs.dev', name: 'Mr. Okafor', passwordHash: hash('Password123!'),
    role: 'student', status: 'pending', // registered via staff portal, awaiting approval
    emailVerifiedAt: now(),
  })
  .returning();

await db.insert(schema.approvalRequests).values({
  id: uuid(), userId: pendingTeacher.id, roleRequested: 'teacher',
  note: 'Head of Biology at Northgate High.',
});

// ── Subject → topics → lessons → cards ─────────────────────────────────────
await db.insert(schema.subjects).values({
  id: 'subj-bio', name: 'Biology', slug: 'biology',
  description: 'AQA GCSE Biology (8461) — core topics.',
});

// Student subscribes to the subject
await db.insert(schema.userSubjects).values({ userId: student.id, subjectId: 'subj-bio' });

const topicRows = await db
  .insert(schema.topics)
  .values([
    {
      id: 'top-cell', subjectId: 'subj-bio', name: 'Cell Biology', slug: 'cell-biology',
      description: 'Eukaryotes, prokaryotes, microscopy and mitosis.', position: 1,
    },
    {
      id: 'top-transport', subjectId: 'subj-bio', name: 'Transport Systems', slug: 'transport-systems',
      description: 'Diffusion, osmosis and active transport.', position: 2,
    },
    {
      id: 'top-infection', subjectId: 'subj-bio', name: 'Infection & Response', slug: 'infection-response',
      description: 'Communicable diseases and the immune system.', position: 3,
    },
  ])
  .returning();

await db.insert(schema.lessons).values([
  {
    id: 'les-euk', topicId: 'top-cell', title: 'Eukaryotes & Prokaryotes', position: 1,
    detailedMd: [
      '## Eukaryotic cells',
      'Eukaryotic cells contain a **nucleus** enclosed by a membrane, holding genetic material (DNA) organised into chromosomes.',
      '- Found in animals, plants, fungi and protists.',
      '- Organelles: nucleus, mitochondria (site of aerobic respiration), ribosomes (protein synthesis), cell membrane, (plants: chloroplasts, permanent vacuole, cellulose cell wall).',
      '',
      '## Prokaryotic cells',
      'Prokaryotes (e.g. bacteria) are much smaller. Their DNA is a **single loop** (plasmids may carry extra genes); no nucleus, no mitochondria.',
      '- May have a slime capsule, flagella for movement.',
      '',
      '> **Exam tip:** Always compare *size*, *nucleus* and *organelles* when asked to contrast cell types.',
    ].join('\n'),
    summaryMd: [
      '- Eukaryote = nucleus + membrane-bound organelles (animals, plants, fungi).',
      '- Prokaryote = tiny, single-loop DNA, no nucleus (bacteria).',
      '- Mitochondria = respiration; ribosomes = protein synthesis.',
    ].join('\n'),
    specRefs: '4.1.1.1; 4.1.1.2',
  },
  {
    id: 'les-mitosis', topicId: 'top-cell', title: 'Mitosis & the Cell Cycle', position: 2,
    detailedMd: [
      '## The cell cycle',
      '1. **Interphase** — DNA replicates, organelles multiply.',
      '2. **Mitosis** — chromosomes line up, spindle fibres pull them to opposite poles; the cell divides once.',
      '3. Result: two genetically identical diploid daughter cells.',
      '',
      '## Uses of mitosis',
      'Growth, repair, asexual reproduction.',
    ].join('\n'),
    summaryMd: ['- Interphase: copy DNA. Mitosis: divide once → 2 identical cells.'].join('\n'),
    specRefs: '4.1.2.2',
  },
  {
    id: 'les-diffusion', topicId: 'top-transport', title: 'Diffusion, Osmosis & Active Transport', position: 1,
    detailedMd: [
      '## Diffusion',
      'Net movement of particles from a **high to low concentration** gradient, passive, down the gradient.',
      '',
      '## Osmosis',
      'Diffusion of **water** through a partially permeable membrane, from a dilute to a more concentrated solution.',
      '',
      '## Active transport',
      'Movement **against** the gradient using **ATP energy** (e.g. mineral ions in root hair cells).',
    ].join('\n'),
    summaryMd: [
      '- Diffusion: high→low, passive.',
      '- Osmosis: water only, partially permeable membrane.',
      '- Active transport: low→high, needs ATP.',
    ].join('\n'),
    specRefs: '4.2.2.1; 4.2.2.2; 4.2.2.3',
  },
  {
    id: 'les-immune', topicId: 'top-infection', title: 'The Immune System', position: 1,
    detailedMd: [
      '## Defence mechanisms',
      'Skin (barrier), mucus (traps pathogens), stomach acid (kills).',
      '',
      '## Phagocytosis & lymphocytes',
      '- **Phagocytes** engulf pathogens (non-specific).',
      '- **Lymphocytes** produce **antibodies** that bind antigens; memory cells give long-term immunity.',
      '- Vaccination introduces a dead/attenuated pathogen → primary immune response → memory cells.',
    ].join('\n'),
    summaryMd: ['- Phagocytes engulf; lymphocytes make antibodies; vaccines → memory cells.'].join('\n'),
    specRefs: '4.3.1.5; 4.3.1.6',
  },
]);

// ── Cards ───────────────────────────────────────────────────────────────────
const cloze = (
  topicId: string, lessonId: string, textWithBlank: string, answers: string[], explanation = ''
) => ({
  id: uuid(), topicId, lessonId, kind: 'cloze' as const, textWithBlank,
  explanationMd: explanation,
  answers: answers.map((text, i) => ({ text, isPrimary: i === 0 })),
});

const flash = (
  topicId: string, lessonId: string, prompt: string, model: string,
  keywords: { required: boolean; phrase: string; synonyms?: string[] }[], minPoints = 2, explanation = ''
) => ({
  id: uuid(), topicId, lessonId, kind: 'flashcard' as const, prompt, explanationMd: explanation,
  answers: [{ text: model, isPrimary: true, keywords, minPoints }],
});

const mcq = (
  topicId: string, lessonId: string, question: string,
  opts: string[], correctIdx: number, explanation = ''
) => ({
  id: uuid(), topicId, lessonId, kind: 'mcq' as const, question,
  options: opts.map((text, i) => ({ id: `o${i}`, text })),
  correctOptionId: `o${correctIdx}`,
  explanationMd: explanation,
  answers: [] as { text: string; isPrimary?: boolean }[],
});

const cardSpecs = [
  // Cell Biology
  cloze('top-cell', 'les-euk', 'Cells that contain a nucleus enclosed by a membrane are called ____.', ['eukaryotes', 'eukaryotic cells', 'eukaryote'],
    'Prokaryotes have no true nucleus.'),
  cloze('top-cell', 'les-euk', 'In prokaryotes, genetic material is a single loop of ____, plus smaller rings called plasmids.', ['DNA', 'dna']),
  cloze('top-cell', 'les-mitosis', 'The stage of the cell cycle where DNA is replicated is called ____.', ['interphase']),
  cloze('top-cell', 'les-mitosis', 'Mitosis produces two genetically ____ daughter cells.', ['identical']),
  flash('top-cell', 'les-euk', 'Compare eukaryotic and prokaryotic cells.',
    'Eukaryotes have a nucleus and membrane-bound organelles (mitochondria, ribosomes); prokaryotes are much smaller, have a single loop of DNA plus plasmids, and no nucleus.',
    [
      { required: true, phrase: 'nucleus', synonyms: ['nuclei'] },
      { required: false, phrase: 'plasmids' },
      { required: false, phrase: 'smaller' },
      { required: false, phrase: 'organelles' },
    ], 2,
    'Marks: nucleus (required) + any 2 of plasmids / size / organelles.'),
  flash('top-cell', 'les-mitosis', 'Describe what happens during mitosis.',
    'Chromosomes line up at the equator, spindle fibres pull them to opposite poles, the nucleus divides and the cytoplasm splits to form two identical daughter cells.',
    [
      { required: true, phrase: 'chromosomes', synonyms: ['chromosome'] },
      { required: true, phrase: 'identical', synonyms: ['same'] },
      { required: false, phrase: 'spindle' },
      { required: false, phrase: 'poles', synonyms: ['opposite ends'] },
    ], 2),
  mcq('top-cell', 'les-euk', 'Which organelle is the site of aerobic respiration?', [
    'Ribosome', 'Mitochondrion', 'Nucleus', 'Chloroplast',
  ], 1, 'Mitochondria release energy via aerobic respiration.'),
  mcq('top-cell', 'les-mitosis', 'How many daughter cells result from one mitotic division?', [
    'One', 'Two', 'Four', 'Eight',
  ], 1, 'Mitosis produces two genetically identical diploid cells.'),
  // Transport
  cloze('top-transport', 'les-diffusion', 'Net movement of particles from high to low concentration is ____.', ['diffusion']),
  cloze('top-transport', 'les-diffusion', 'Osmosis is the movement of ____ through a partially permeable membrane.', ['water', 'water molecules']),
  cloze('top-transport', 'les-diffusion', 'Active transport requires energy from ____.', ['ATP', 'respiration', 'atp']),
  flash('top-transport', 'les-diffusion', 'Explain the difference between osmosis and active transport.',
    'Osmosis is passive movement of water from dilute to concentrated through a partially permeable membrane; active transport moves substances against the gradient using ATP energy.',
    [
      { required: true, phrase: 'water', synonyms: ['h2o'] },
      { required: true, phrase: 'against the gradient', synonyms: ['against gradient', 'low to high', 'up the gradient'] },
      { required: false, phrase: 'passive' },
      { required: false, phrase: 'ATP', synonyms: ['energy', 'atp'] },
    ], 2),
  mcq('top-transport', 'les-diffusion', 'Root hair cells take up mineral ions against their concentration gradient. This is:', [
    'Diffusion', 'Osmosis', 'Active transport', 'Evaporation',
  ], 2),
  // Infection & Response
  cloze('top-infection', 'les-immune', 'White blood cells that engulf pathogens are called ____.', ['phagocytes', 'phagocyte']),
  cloze('top-infection', 'les-immune', 'Lymphocytes produce ____ that bind to antigens on pathogens.', ['antibodies', 'antibody']),
  flash('top-infection', 'les-immune', 'Explain how vaccination protects against disease.',
    'A dead or weakened pathogen is introduced, lymphocytes produce antibodies against its antigens, and memory cells remain so a fast secondary response fights future infection.',
    [
      { required: true, phrase: 'antibodies', synonyms: ['antibody'] },
      { required: true, phrase: 'memory', synonyms: ['memory cells'] },
      { required: false, phrase: 'antigen', synonyms: ['antigens'] },
      { required: false, phrase: 'weakened', synonyms: ['dead', 'attenuated', 'inactive'] },
    ], 2),
  mcq('top-infection', 'les-immune', 'Which cells provide long-term immunity after infection?', [
    'Memory lymphocytes', 'Red blood cells', 'Platelets', 'Phagocytes',
  ], 0),
];

for (const spec of cardSpecs) {
  const specAny = spec as Record<string, unknown> & { answers?: unknown[] };
  const { answers: rawAnswers } = specAny;
  const card = Object.fromEntries(Object.entries(specAny).filter(([k]) => k !== 'answers'));
  const answerRows = (rawAnswers ?? []) as { text: string; isPrimary?: boolean; keywords?: unknown; minPoints?: number }[];
  const [row] = await db.insert(schema.cards).values(card as never).returning();
  const insertRows = answerRows.map((a) => ({
    id: uuid(), cardId: row.id, text: a.text, isPrimary: a.isPrimary ?? false,
    keywords: (a.keywords ?? null) as never,
    minPoints: a.minPoints ?? null,
  }));
  if (insertRows.length > 0) {
    await db.insert(schema.cardAnswers).values(insertRows);
  }
  console.log('inserted card', row.id.slice(0, 8), row.kind, 'answers:', insertRows.length);
}

// ── Exam questions ──────────────────────────────────────────────────────────
await db.insert(schema.examQuestions).values([
  {
    id: uuid(), topicId: 'top-cell',
    questionMd: 'Compare the structure of eukaryotic and prokaryotic cells. (4 marks)',
    markSchemeMd: '- Nucleus present in eukaryotes only (1)\n- Prokaryotes have single loop DNA + plasmids (1)\n- Eukaryotes have membrane-bound organelles e.g. mitochondria (1)\n- Prokaryotes much smaller (1)',
    kind: 'free_response', marks: 4, board: 'AQA', sourceYear: 2023,
    keywords: [
      { required: true, phrase: 'nucleus', synonyms: ['nuclei'] },
      { required: false, phrase: 'plasmid', synonyms: ['plasmids'] },
      { required: false, phrase: 'mitochondria', synonyms: ['mitochondrion'] },
      { required: false, phrase: 'smaller', synonyms: ['small'] },
    ], minPoints: 3,
  },
  {
    id: uuid(), topicId: 'top-transport',
    questionMd: 'A student places potato chips in solutions of different sugar concentration. Explain how osmosis causes changes in mass. (3 marks)',
    markSchemeMd: '- Water moves from dilute solution to concentrated (1)\n- Through partially permeable membrane (1)\n- Chip in concentrated solution loses mass / vice versa (1)',
    kind: 'free_response', marks: 3, board: 'AQA', sourceYear: 2022,
    keywords: [
      { required: true, phrase: 'water' },
      { required: false, phrase: 'partially permeable', synonyms: ['semi-permeable'] },
      { required: false, phrase: 'concentration', synonyms: ['concentrated', 'dilute'] },
    ], minPoints: 2,
  },
  {
    id: uuid(), topicId: 'top-infection',
    questionMd: 'Which type of white blood cell produces antibodies? (1 mark)',
    markSchemeMd: 'Lymphocyte',
    kind: 'mcq', marks: 1, board: 'AQA', sourceYear: 2021,
    options: [{ id: 'o0', text: 'Phagocyte' }, { id: 'o1', text: 'Lymphocyte' }, { id: 'o2', text: 'Platelet' }, { id: 'o3', text: 'Red blood cell' }],
    correctOptionId: 'o1',
  },
]);

// ── Class ───────────────────────────────────────────────────────────────────
await db.insert(schema.classes).values({
  id: 'cls-10b', teacherId: teacher.id, subjectId: 'subj-bio', name: '10B Biology', joinCode: 'BIO10B',
});
const cls = { id: 'cls-10b' };
await db.insert(schema.classMemberships).values({ classId: cls.id, userId: student.id });

// ── Gamification config ─────────────────────────────────────────────────────
await db.insert(schema.achievements).values([
  { id: 'first-review', name: 'First Steps', description: 'Complete your first review', icon: '🌱', rule: { kind: 'review_count', threshold: 1 } },
  { id: 'reviews-50', name: 'Half Century', description: 'Complete 50 reviews', icon: '⚡', rule: { kind: 'review_count', threshold: 50 } },
  { id: 'reviews-250', name: 'Grindmaster', description: 'Complete 250 reviews', icon: '🔥', rule: { kind: 'review_count', threshold: 250 } },
  { id: 'streak-7', name: 'Week Warrior', description: 'Reach a 7-day streak', icon: '📅', rule: { kind: 'streak', threshold: 7 } },
  { id: 'streak-30', name: 'Month Monk', description: 'Reach a 30-day streak', icon: '🗓️', rule: { kind: 'streak', threshold: 30 } },
  { id: 'xp-1000', name: 'Kilo-XP', description: 'Earn 1,000 XP total', icon: '💎', rule: { kind: 'xp_total', threshold: 1000 } },
  { id: 'perfect-session', name: 'Flawless', description: 'Finish a session with 100% accuracy (10+ reviews)', icon: '🎯', rule: { kind: 'perfect_session', threshold: 10 } },
]);

await db.insert(schema.featureFlags).values([
  { key: 'exam_simulator', description: 'Past-paper exam simulator', enabled: true },
  { key: 'leaderboards', description: 'Daily/weekly/monthly leaderboards + leagues', enabled: true },
  { key: 'cram_mode', description: 'Cram sessions (bypass SRS scheduling)', enabled: true },
  { key: 'streak_freeze', description: 'Streak freeze tokens', enabled: false },
  { key: 'experimental_mcq_shuffle', description: 'Shuffle MCQ options per attempt', enabled: false },
]);

// ── Demo activity: classmates, XP history, league week, streaks ─────────────
// Makes leaderboards, leagues and streaks meaningful on a fresh install.
const mondayOf = (d: Date) => {
  const diff = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
};
const utcDateKey = (d: Date = new Date()) => d.toISOString().slice(0, 10);
const weekStart = mondayOf(new Date()).toISOString().slice(0, 10);

const classmates = ['Priya Shah', 'Dan Whitfield', 'Maya Chen', 'Ollie Grant', 'Sofia Rossi'];
const buddies: { id: string; name: string }[] = [];
for (const [i, name] of classmates.entries()) {
  const [row] = await db
    .insert(schema.users)
    .values({
      id: uuid(), email: `student${i + 1}@srs.dev`, name,
      passwordHash: hash('Password123!'), role: 'student', status: 'active',
      emailVerifiedAt: now(),
    })
    .returning();
  await db.insert(schema.classMemberships).values({ classId: cls.id, userId: row.id });
  buddies.push({ id: row.id, name });
}

// XP: three events this week (daily/weekly boards) + one last week (monthly only).
const everyone = [{ id: student.id, name: 'Alex Rivera' }, ...buddies];
const weekXps: number[] = [];
for (const [i, person] of everyone.entries()) {
  const events = [
    { amount: 60 + i * 15, occurredAt: daysAgo(0) },
    { amount: 40 + i * 20, occurredAt: daysAgo(1) },
    { amount: 55, occurredAt: daysAgo(2) },
    { amount: 80, occurredAt: daysAgo(9) }, // last week → monthly only
  ];
  await db.insert(schema.xpEvents).values(
    events.map((e) => ({ id: uuid(), userId: person.id, amount: e.amount, source: 'review' as const, occurredAt: e.occurredAt })),
  );
  const weekXp = events.slice(0, 3).reduce((s, e) => s + e.amount, 0);
  weekXps.push(weekXp);
  await db.insert(schema.streaks).values({ userId: person.id, current: 3 + i, best: 6 + i * 2, lastActiveDate: utcDateKey() });
}

// League tiers from weekly rank: gold / silver / bronze...
const ranked = [...everyone.keys()].sort((a, b) => weekXps[b] - weekXps[a]);
for (const idx of ranked) {
  const league = idx === ranked[0] ? 'gold' : idx === ranked[1] ? 'silver' : 'bronze';
  await db.insert(schema.leagueMemberships).values({ userId: everyone[idx].id, weekStart, xpWeek: weekXps[idx], league });
}

// A couple of unlocked achievements for the demo student
await db.insert(schema.userAchievements).values([
  { userId: student.id, achievementId: 'first-review', unlockedAt: daysAgo(2) },
]);

console.log('Seeded:');
console.log('  student@srs.dev / Password123!  (student, in class 10B Biology)');
console.log('  teacher@srs.dev / Password123!  (teacher of 10B Biology)');
console.log('  dev@srs.dev / Password123!      (developer)');
console.log('  newteacher@srs.dev / Password123! (pending approval request)');
console.log('  class join code: BIO10B');

await pool.end();
