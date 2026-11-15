/**
 * T-Level DSS gap import — adds every spec sub-unit that exists in the vault
 * but is missing from the app: taught units whose notes were never imported
 * (1.1.11–1.3.9, 2.9, 3.1, 4.1.9, 4.2.4–4.2.6, all of 5, 7.3.8–7.6) plus the
 * untaught "prepared in advance" stub sub-units in sections 2 and 3 so the
 * spec structure is complete. Stub lessons carry the sub-unit intro and its
 * specification coverage — an honest skeleton until real notes exist.
 *
 * Content = the vault note cleaned by cleanPaperMd (frontmatter, callouts,
 * wikilinks stripped). Cards are generated from the notes by the same
 * generateQuizCardsFromNotes the app's content route uses.
 *
 * Run:  npx tsx scripts/vault/import-tlevel-gaps.ts
 * Idempotent: deterministic ids (tl:<spec>), upsert by id, cards skipped when
 * an identical cloze/flashcard/mcq already exists on the topic.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db, closeDb } from '../../src/db/client';
import { cards, cardAnswers, lessons, topics } from '../../src/db/schema';
import { cleanPaperMd } from './papers';
import { generateQuizCardsFromNotes } from '../../src/domain/quiz-gen-from-notes';

const SUBJECT_ID = 'cb8050d4-13bc-4d40-b926-633c1b0282e6'; // "T-Level Cybersecurity"
const VAULT = '/Users/tayyabmahmood/Documents/College/2026-2027/T Level Digital Support and Security';
const P1 = 'Core Paper 1';
const P2 = 'Core Paper 2';

type LessonFile = { file: string; specRefs: string; stub?: boolean };
type TopicSpec = {
  id: string; // deterministic, e.g. "tl:5.4"
  name: string;
  description: string;
  lessons: LessonFile[];
};

const D = {
  '1.1.11': 'Using pattern recognition on real data sets to solve problems — identify, interpret, predict, apply.',
  '1.2.5': 'The control structures — sequence, selection, iteration — that decide the order steps run in an algorithm.',
  '1.2.10': 'Designing algorithms and solutions end to end — from problem to tested, ordered steps.',
  '1.3.3': 'Root cause analysis — five whys, FMEA and event trees — to find why a problem really happened.',
  '1.3.5': 'The six-stage high-level problem-solving strategy: define, gather, analyse, plan, implement, review.',
  '1.3.6': 'Incident management — detection, response and intelligence — for digital service disruptions.',
  '1.3.9': 'The problem-solving strategies toolkit and when each one applies.',
  '2.9': 'Project management methodologies and diagrammatic techniques — waterfall, lean, PERT, Gantt, Kanban.',
  '3.1': 'The DIKW hierarchy, sources of data, ethical practice, and how organisations turn data into decisions.',
  '4.1.9': 'International law in cyberspace — jurisdiction, the Budapest Convention, and surveillance safeguards.',
  '4.2.4': 'Acceptable use policies — what they cover and how to audit one.',
  '4.2.5': 'Whistleblowing procedures — channels, categories, protections and remedies.',
  '4.2.6': 'How digital support, security and guidelines interrelate, and judging their impacts.',
  '5.1': 'The business environment — purpose, sectors, ownership models and stakeholders.',
  '5.2': 'The digital value organisations get — systems in key areas and matching them to user needs.',
  '5.3': 'Risks of using digital systems and the impact they have on organisations.',
  '5.4': 'Technical change management — triggers, responses, the change process and project feasibility.',
  '5.5': 'How digital support roles enable business operations — infrastructure, cabling, support and careers.',
  '7.3.8': 'The TCP/IP model — the four-layer counterpart to the seven-layer OSI model.',
  '7.3.9': 'Data packets, network protocols and bandwidth/latency — how data actually moves.',
  '7.4': 'Virtual environments — VM components, key features, benefits and drawbacks.',
  '7.5': 'Cloud environments — deployment types, benefits and the IaaS/PaaS/SaaS delivery models.',
  '7.6': 'Resilient digital environments — RPO/RTO, single points of failure and improving resilience.',
};

const f = (p: string) => join(VAULT, p);
const cp1 = (p: string) => f(join(P1, p));
const cp2 = (p: string) => f(join(P2, p));

const TOPICS: TopicSpec[] = [
  // ── Core Paper 1 — Problem Solving (taught, notes in vault) ──
  { id: 'tl:1.1.11', name: '1.1.11–1.1.12 Pattern Recognition for Problem Solving', description: D['1.1.11'], lessons: [
    { file: cp1('01 - Problem Solving/01.01 Computational Thinking/1.1.11-1.1.12 Pattern Recognition for Problem Solving.md'), specRefs: '1.1.11; 1.1.12' },
  ]},
  { id: 'tl:1.2.5', name: '1.2.5 Actions to Control Ordering of Steps in Algorithms', description: D['1.2.5'], lessons: [
    { file: cp1('01 - Problem Solving/01.02 Algorithmic Design/1.2.5 Actions to Control Ordering of Steps in Algorithms.md'), specRefs: '1.2.5' },
  ]},
  { id: 'tl:1.2.10', name: '1.2.10 Designing Algorithms and Solutions', description: D['1.2.10'], lessons: [
    { file: cp1('01 - Problem Solving/01.02 Algorithmic Design/1.2.10 Designing Algorithms and Solutions.md'), specRefs: '1.2.10' },
  ]},
  { id: 'tl:1.3.3', name: '1.3.3–1.3.4 Root Cause Analysis', description: D['1.3.3'], lessons: [
    { file: cp1('01 - Problem Solving/01.03 Problem-Solving Strategies/1.3.3-1.3.4 Root Cause Analysis.md'), specRefs: '1.3.3; 1.3.4' },
  ]},
  { id: 'tl:1.3.5', name: '1.3.5 High-Level Problem-Solving Strategy', description: D['1.3.5'], lessons: [
    { file: cp1('01 - Problem Solving/01.03 Problem-Solving Strategies/1.3.5 High-Level Problem-Solving Strategy.md'), specRefs: '1.3.5' },
  ]},
  { id: 'tl:1.3.6', name: '1.3.6–1.3.8 Incident Management', description: D['1.3.6'], lessons: [
    { file: cp1('01 - Problem Solving/01.03 Problem-Solving Strategies/1.3.6-1.3.8 Incident Management.md'), specRefs: '1.3.6; 1.3.7; 1.3.8' },
  ]},
  { id: 'tl:1.3.9', name: '1.3.9 Problem-Solving Strategies', description: D['1.3.9'], lessons: [
    { file: cp1('01 - Problem Solving/01.03 Problem-Solving Strategies/1.3.9 Problem-Solving Strategies.md'), specRefs: '1.3.9' },
  ]},

  // ── Core Paper 1 — Introduction to Digital Support ──
  { id: 'tl:2.9', name: '2.9 Project Management Methodologies and Tools', description: D['2.9'], lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.09 Project Management Methodologies and Tools/2.9.2 Diagrammatic Techniques for Project Management.md'), specRefs: '2.9.1; 2.9.2' },
  ]},
  // untaught stubs — spec skeletons
  { id: 'tl:2.1', name: '2.1 Infrastructure', description: 'Digital infrastructure — the hardware, software and networks an organisation runs on.', lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.01 Infrastructure/02.01 Infrastructure.md'), specRefs: '2.1', stub: true },
  ]},
  { id: 'tl:2.2', name: '2.2 Cabling', description: 'Network cabling — types, installation and testing.', lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.02 Cabling/02.02 Cabling.md'), specRefs: '2.2', stub: true },
  ]},
  { id: 'tl:2.3', name: '2.3 Unified Communications', description: 'Unified communications — integrating voice, video, messaging and data.', lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.03 Unified Communications/02.03 Unified Communications.md'), specRefs: '2.3', stub: true },
  ]},
  { id: 'tl:2.4', name: '2.4 Support', description: 'Providing digital support — helpdesk models, ticketing and user assistance.', lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.04 Support/02.04 Support.md'), specRefs: '2.4', stub: true },
  ]},
  { id: 'tl:2.5', name: '2.5 Testing', description: 'Testing digital systems — types, environments and when to test.', lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.05 Testing/02.05 Testing.md'), specRefs: '2.5', stub: true },
  ]},
  { id: 'tl:2.6', name: '2.6 Using Data in Digital Support', description: 'Using data in digital support — monitoring, logs and evidence-based support.', lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.06 Using Data in Digital Support/02.06 Using Data in Digital Support.md'), specRefs: '2.6', stub: true },
  ]},
  { id: 'tl:2.7', name: '2.7 Using Diagrams in Digital Support', description: 'Using diagrams — flowcharts, network diagrams and visual documentation.', lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.07 Using Diagrams in Digital Support/02.07 Using Diagrams in Digital Support.md'), specRefs: '2.7', stub: true },
  ]},
  { id: 'tl:2.8', name: '2.8 Risk and Risk Assessment', description: 'Risk and risk assessment — identifying, scoring and mitigating digital risk.', lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.08 Risk and Risk Assessment/02.08 Risk and Risk Assessment.md'), specRefs: '2.8', stub: true },
  ]},
  { id: 'tl:2.11', name: '2.11 Sources of Knowledge', description: 'Sources of knowledge — literature, professionals, websites, media — and judging reliability and validity.', lessons: [
    { file: cp1('02 - Introduction to Digital Support/02.11 Sources of Knowledge/02.11 Sources of Knowledge.md'), specRefs: '2.11', stub: true },
  ]},

  // ── Core Paper 1 — Data ──
  { id: 'tl:3.1', name: '3.1 Data, Information and Knowledge', description: D['3.1'], lessons: [
    { file: cp1('03 - Data/03.01 Data, Information and Knowledge/3.1.1 Data, Information and Knowledge.md'), specRefs: '3.1.1' },
    { file: cp1('03 - Data/03.01 Data, Information and Knowledge/3.1.2 Sources for Generating Data.md'), specRefs: '3.1.2' },
    { file: cp1('03 - Data/03.01 Data, Information and Knowledge/3.1.3 Ethical Data Practices and the Value of Data.md'), specRefs: '3.1.3' },
    { file: cp1('03 - Data/03.01 Data, Information and Knowledge/3.1.4 How Organisations Use Data and Information.md'), specRefs: '3.1.4' },
  ]},
  { id: 'tl:3.2', name: '3.2 Methods of Transforming Data', description: 'Manipulating, analysing and processing — the three methods of transforming data.', lessons: [
    { file: cp1('03 - Data/03.02 Methods of Transforming Data/03.02 Methods of Transforming Data.md'), specRefs: '3.2', stub: true },
  ]},
  { id: 'tl:3.3', name: '3.3 Data Taxonomy', description: 'Data taxonomy — classifying and organising types of data.', lessons: [
    { file: cp1('03 - Data/03.03 Data Taxonomy/03.03 Data Taxonomy.md'), specRefs: '3.3', stub: true },
  ]},
  { id: 'tl:3.4', name: '3.4 Data Types', description: 'Data types — numeric, alphanumeric, date/time, Boolean and more.', lessons: [
    { file: cp1('03 - Data/03.04 Data Types/03.04 Data Types.md'), specRefs: '3.4', stub: true },
  ]},
  { id: 'tl:3.5', name: '3.5 Data Formats', description: 'Data formats — how data is encoded for storage and exchange.', lessons: [
    { file: cp1('03 - Data/03.05 Data Formats/03.05 Data Formats.md'), specRefs: '3.5', stub: true },
  ]},
  { id: 'tl:3.6', name: '3.6 Structures for Storing Data', description: 'Structures for storing data — files, tables, databases and warehouses.', lessons: [
    { file: cp1('03 - Data/03.06 Structures for Storing Data/03.06 Structures for Storing Data.md'), specRefs: '3.6', stub: true },
  ]},
  { id: 'tl:3.7', name: '3.7 Data Dimensions and Maintenance', description: 'Data dimensions and maintenance — volume, velocity, variety and keeping data fit for purpose.', lessons: [
    { file: cp1('03 - Data/03.07 Data Dimensions and Maintenance/03.07 Data Dimensions and Maintenance.md'), specRefs: '3.7', stub: true },
  ]},
  { id: 'tl:3.8', name: '3.8 Data Systems', description: 'Data systems — components, functions and how they fit together.', lessons: [
    { file: cp1('03 - Data/03.08 Data Systems/03.08 Data Systems.md'), specRefs: '3.8', stub: true },
  ]},
  { id: 'tl:3.9', name: '3.9 Data Visualisation', description: 'Data visualisation — charts, dashboards and presenting data clearly.', lessons: [
    { file: cp1('03 - Data/03.09 Data Visualisation/03.09 Data Visualisation.md'), specRefs: '3.9', stub: true },
  ]},
  { id: 'tl:3.10', name: '3.10 Data Models', description: 'Data models — entities, attributes, relationships and normalisation.', lessons: [
    { file: cp1('03 - Data/03.10 Data Models/03.10 Data Models.md'), specRefs: '3.10', stub: true },
  ]},
  { id: 'tl:3.11', name: '3.11 Data Access Across Platforms', description: 'Data access across platforms — APIs, interoperability and portability.', lessons: [
    { file: cp1('03 - Data/03.11 Data Access Across Platforms/03.11 Data Access Across Platforms.md'), specRefs: '3.11', stub: true },
  ]},
  { id: 'tl:3.12', name: '3.12 Data Analysis Tools', description: 'Data analysis tools — spreadsheets, BI tools and statistical software.', lessons: [
    { file: cp1('03 - Data/03.12 Data Analysis Tools/03.12 Data Analysis Tools.md'), specRefs: '3.12', stub: true },
  ]},

  // ── Core Paper 2 — Legislation & Guidelines ──
  { id: 'tl:4.1.9', name: '4.1.9 International Law in Cyberspace & Surveillance', description: D['4.1.9'], lessons: [
    { file: cp2('04 - Legislation & Guidelines/04.01 Legislation/4.1.9 International Law in Cyberspace & Surveillance.md'), specRefs: '4.1.9' },
  ]},
  { id: 'tl:4.2.4', name: '4.2.4 Acceptable Use Policies (AUP)', description: D['4.2.4'], lessons: [
    { file: cp2('04 - Legislation & Guidelines/04.02 Guidelines/4.2.4 Acceptable Use Policies (AUP).md'), specRefs: '4.2.4' },
  ]},
  { id: 'tl:4.2.5', name: '4.2.5 Whistleblowing Procedures', description: D['4.2.5'], lessons: [
    { file: cp2('04 - Legislation & Guidelines/04.02 Guidelines/4.2.5 Whistleblowing Procedures.md'), specRefs: '4.2.5' },
  ]},
  { id: 'tl:4.2.6', name: '4.2.6 Digital Support, Security and Guidelines', description: D['4.2.6'], lessons: [
    { file: cp2('04 - Legislation & Guidelines/04.02 Guidelines/4.2.6 Digital Support, Security and Guidelines.md'), specRefs: '4.2.6' },
  ]},

  // ── Core Paper 2 — Business Context ──
  { id: 'tl:5.1', name: '5.1 Business Environment', description: D['5.1'], lessons: [
    { file: cp2('05 - Business Context/05.01 Business Environment/5.1.1 Purpose and Sectors of Organisations.md'), specRefs: '5.1.1' },
    { file: cp2('05 - Business Context/05.01 Business Environment/5.1.2 Business Models.md'), specRefs: '5.1.2' },
    { file: cp2('05 - Business Context/05.01 Business Environment/5.1.3 Stakeholders.md'), specRefs: '5.1.3' },
  ]},
  { id: 'tl:5.2', name: '5.2 Digital Value to Organisations', description: D['5.2'], lessons: [
    { file: cp2('05 - Business Context/05.02 Digital Value to Organisations/5.2.1 Digital Systems in Key Organisation Areas.md'), specRefs: '5.2.1' },
    { file: cp2('05 - Business Context/05.02 Digital Value to Organisations/5.2.2 Digital Systems and User Needs.md'), specRefs: '5.2.2' },
  ]},
  { id: 'tl:5.3', name: '5.3 Risks to Organisations of Using Digital Systems', description: D['5.3'], lessons: [
    { file: cp2('05 - Business Context/05.03 Risks to Organisations of Using Digital Systems/5.3.1 Risks of Using Digital Systems.md'), specRefs: '5.3.1' },
    { file: cp2('05 - Business Context/05.03 Risks to Organisations of Using Digital Systems/5.3.2 Impact of Risks.md'), specRefs: '5.3.2' },
  ]},
  { id: 'tl:5.4', name: '5.4 Technical Change Management', description: D['5.4'], lessons: [
    { file: cp2('05 - Business Context/05.04 Technical Change Management/5.4.1 Internal Factors That Trigger Change.md'), specRefs: '5.4.1' },
    { file: cp2('05 - Business Context/05.04 Technical Change Management/5.4.2 External Factors That Trigger Change.md'), specRefs: '5.4.2' },
    { file: cp2('05 - Business Context/05.04 Technical Change Management/5.4.3 Organisational Responses to Change.md'), specRefs: '5.4.3' },
    { file: cp2('05 - Business Context/05.04 Technical Change Management/5.4.4 Change Management Process.md'), specRefs: '5.4.4' },
    { file: cp2('05 - Business Context/05.04 Technical Change Management/5.4.5 Digital Project Feasibility.md'), specRefs: '5.4.5' },
  ]},
  { id: 'tl:5.5', name: '5.5 How Digital Support Roles Enable Business Operations', description: D['5.5'], lessons: [
    { file: cp2('05 - Business Context/05.05 How Digital Support Roles Enable Business Operations/5.5.1 Supporting Digital Infrastructure.md'), specRefs: '5.5.1' },
    { file: cp2('05 - Business Context/05.05 How Digital Support Roles Enable Business Operations/5.5.2 Installing Network Cabling.md'), specRefs: '5.5.2' },
    { file: cp2('05 - Business Context/05.05 How Digital Support Roles Enable Business Operations/5.5.3 Providing Digital Support.md'), specRefs: '5.5.3' },
    { file: cp2('05 - Business Context/05.05 How Digital Support Roles Enable Business Operations/5.5.4 Digital Communications Responsibilities.md'), specRefs: '5.5.4' },
    { file: cp2('05 - Business Context/05.05 How Digital Support Roles Enable Business Operations/5.5.5 Routes into Digital Support and Security.md'), specRefs: '5.5.5' },
    { file: cp2('05 - Business Context/05.05 How Digital Support Roles Enable Business Operations/5.5.6 Communication Techniques.md'), specRefs: '5.5.6' },
    { file: cp2('05 - Business Context/05.05 How Digital Support Roles Enable Business Operations/5.5.7 Interaction Needs of End-Users.md'), specRefs: '5.5.7' },
  ]},

  // ── Core Paper 2 — Digital Environments ──
  { id: 'tl:7.3.8', name: '7.3.8 TCP-IP Model', description: D['7.3.8'], lessons: [
    { file: cp2('07 - Digital Environments/07.03 Networks/7.3.8 TCP-IP Model.md'), specRefs: '7.3.8' },
  ]},
  { id: 'tl:7.3.9', name: '7.3.9–7.3.11 Data Packets, Protocols and Bandwidth', description: D['7.3.9'], lessons: [
    { file: cp2('07 - Digital Environments/07.03 Networks/7.3.9 Data Packets.md'), specRefs: '7.3.9' },
    { file: cp2('07 - Digital Environments/07.03 Networks/7.3.10 Common Network Protocols.md'), specRefs: '7.3.10' },
    { file: cp2('07 - Digital Environments/07.03 Networks/7.3.11 Bandwidth and Latency.md'), specRefs: '7.3.11' },
  ]},
  { id: 'tl:7.4', name: '7.4 Virtual Environments', description: D['7.4'], lessons: [
    { file: cp2('07 - Digital Environments/07.04 Virtual Environments/7.4.1 VM Components.md'), specRefs: '7.4.1' },
    { file: cp2('07 - Digital Environments/07.04 Virtual Environments/7.4.2 Key Features of VMs.md'), specRefs: '7.4.2' },
    { file: cp2('07 - Digital Environments/07.04 Virtual Environments/7.4.3 Benefits of VMs.md'), specRefs: '7.4.3' },
    { file: cp2('07 - Digital Environments/07.04 Virtual Environments/7.4.4 Drawbacks of VMs.md'), specRefs: '7.4.4' },
  ]},
  { id: 'tl:7.5', name: '7.5 Cloud Environments', description: D['7.5'], lessons: [
    { file: cp2('07 - Digital Environments/07.05 Cloud Environments/7.5.1 Different Types of Cloud.md'), specRefs: '7.5.1' },
    { file: cp2('07 - Digital Environments/07.05 Cloud Environments/7.5.2 Benefits of the Use of Cloud.md'), specRefs: '7.5.2' },
    { file: cp2('07 - Digital Environments/07.05 Cloud Environments/7.5.3 Cloud Delivery Models.md'), specRefs: '7.5.3' },
  ]},
  { id: 'tl:7.6', name: '7.6 Resilient Digital Environments', description: D['7.6'], lessons: [
    { file: cp2('07 - Digital Environments/07.06 Resilient Digital Environments/7.6.1 Benefits and Impacts of Resilient Environments.md'), specRefs: '7.6.1' },
    { file: cp2('07 - Digital Environments/07.06 Resilient Digital Environments/7.6.2 Methods to Improve Resilience.md'), specRefs: '7.6.2' },
  ]},
];

// ── cleaning ────────────────────────────────────────────────────────────────

/** Vault note → app markdown. Strips nav-link-only lines and Obsidian noise. */
function cleanNote(raw: string, stub: boolean): string {
  // drop lines that are only [[wikilinks]] (nav junk), then the standard clean
  const noNav = raw
    .split('\n')
    .filter((l) => !/^\s*(\[\[[^\]]+\]\]\s*)+$/.test(l))
    .join('\n');
  let md = cleanPaperMd(noNav);
  md = md
    .replace(/^\s*\*Add your own notes here\.\*\s*$/gm, '')
    .replace(/\*\*KPI notes:\*\*[^\n]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (stub) {
    // stub pages carry a "prepared in advance — not yet taught" callout (now a
    // blockquote after cleanPaperMd), asset links and empty sections — keep the
    // intro + specification coverage only.
    md = md
      .split('\n')
      .filter((l) => !l.startsWith('>'))
      .join('\n');
    const cut = md.search(/##\s*Slides\s*&\s*Resources/i);
    if (cut > 0) md = md.slice(0, cut);
    md = md.replace(/\n{3,}/g, '\n\n').trim();
  }
  return md;
}

/** Opening prose blocks → concise summary_md (~700 chars max). */
function makeSummary(md: string, specRefs: string, title: string): string {
  const blocks = md
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith('#') && !b.startsWith('|') && !b.startsWith('>') && !b.startsWith('-') && !b.startsWith('*') && !b.startsWith('```'));
  let s = '';
  for (const b of blocks) {
    const clean = b.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    s = s ? `${s} ${clean}` : clean;
    if (s.length >= 500) break;
  }
  if (s.length > 800) {
    const cut = s.slice(0, 800);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    s = (stop > 200 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(' '))) + '…';
  }
  if (s.length < 80) s = `**Spec:** ${specRefs} — ${title}. Detailed notes below.`;
  return s;
}

function lessonTitleFromFile(file: string): string {
  const base = file.split('/').pop()!.replace(/\.md$/, '');
  // "3.1.1 Data, Information and Knowledge" → "3.1.1 Data, Information and Knowledge"
  // "03.02 Methods of Transforming Data" → "3.2 Methods of Transforming Data"
  return base.replace(/^(\d{2})\.(\d{2})/, (_m, a, b) => `${Number(a)}.${Number(b)}`);
}

// ── upserts ────────────────────────────────────────────────────────────────

async function main() {
  let topicsWritten = 0, lessonsWritten = 0, cardsWritten = 0;

  for (const [ti, t] of TOPICS.entries()) {
    // topic
    const [existingTopic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, t.id)).limit(1);
    if (existingTopic) {
      await db.update(topics).set({ name: t.name, description: t.description, position: ti }).where(eq(topics.id, t.id));
    } else {
      await db.insert(topics).values({
        id: t.id, subjectId: SUBJECT_ID, name: t.name, slug: t.id,
        description: t.description, visibility: 'public', ownerId: null, position: ti,
      });
    }
    topicsWritten++;

    // lessons
    const lessonRows: { title: string; detailedMd: string; summaryMd: string; specRefs: string }[] = [];
    for (const [li, lf] of t.lessons.entries()) {
      const raw = readFileSync(lf.file, 'utf8');
      const detailedMd = cleanNote(raw, !!lf.stub);
      if (!detailedMd) { console.log(`  ! empty after clean: ${lf.file}`); continue; }
      const title = lessonTitleFromFile(lf.file);
      const summaryMd = makeSummary(detailedMd, lf.specRefs, title);
      const lessonId = `${t.id}:${lf.specRefs.split(';')[0].trim().replace(/\./g, '.')}`;
      const [existingLesson] = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
      if (existingLesson) {
        await db.update(lessons).set({ title, detailedMd, summaryMd, specRefs: lf.specRefs, position: li }).where(eq(lessons.id, lessonId));
      } else {
        await db.insert(lessons).values({
          id: lessonId, topicId: t.id, title, detailedMd, summaryMd,
          specRefs: lf.specRefs, visibility: 'public', ownerId: null, position: li,
        });
      }
      lessonsWritten++;
      lessonRows.push({ title, detailedMd, summaryMd, specRefs: lf.specRefs });
    }

    // cards — same generator + insert shape as POST /api/v1/content generate_from_notes
    const [existingCloze, existingFlashcard, existingMcq] = await Promise.all([
      db.select({ textWithBlank: cards.textWithBlank }).from(cards).where(and(eq(cards.topicId, t.id), eq(cards.kind, 'cloze'))),
      db.select({ prompt: cards.prompt }).from(cards).where(and(eq(cards.topicId, t.id), eq(cards.kind, 'flashcard'))),
      db.select({ question: cards.question }).from(cards).where(and(eq(cards.topicId, t.id), eq(cards.kind, 'mcq'))),
    ]);
    const incoming = generateQuizCardsFromNotes(
      lessonRows.map((l) => ({ title: l.title, detailedMd: l.detailedMd, summaryMd: l.summaryMd, specRefs: l.specRefs })),
      {
        cloze: existingCloze.map((c) => c.textWithBlank ?? '').filter(Boolean),
        flashcard: existingFlashcard.map((c) => c.prompt ?? '').filter(Boolean),
        mcq: existingMcq.map((c) => c.question ?? '').filter(Boolean),
      },
      { maxCloze: 12, maxFlashcards: 6, maxMcq: 6 },
    );
    const seenCloze = new Set(existingCloze.map((c) => c.textWithBlank ?? ''));
    const seenFc = new Set(existingFlashcard.map((c) => c.prompt ?? ''));
    const seenMcq = new Set(existingMcq.map((c) => c.question ?? ''));

    for (const card of incoming) {
      const cardId = crypto.randomUUID();
      if (card.kind === 'cloze') {
        if (seenCloze.has(card.textWithBlank ?? '')) continue;
        seenCloze.add(card.textWithBlank ?? '');
        await db.insert(cards).values({
          id: cardId, topicId: t.id, lessonId: null, kind: 'cloze',
          textWithBlank: card.textWithBlank ?? '', explanationMd: card.explanationMd ?? '',
          visibility: 'public', ownerId: null, generated: true,
        });
        await db.insert(cardAnswers).values({ id: crypto.randomUUID(), cardId, text: card.answer ?? '', isPrimary: true });
      } else if (card.kind === 'flashcard') {
        if (seenFc.has(card.prompt ?? '')) continue;
        seenFc.add(card.prompt ?? '');
        await db.insert(cards).values({
          id: cardId, topicId: t.id, lessonId: null, kind: 'flashcard',
          prompt: card.prompt ?? '', explanationMd: card.explanationMd ?? '',
          visibility: 'public', ownerId: null, generated: true,
        });
        await db.insert(cardAnswers).values({
          id: crypto.randomUUID(), cardId, text: card.answer ?? '', isPrimary: true,
          keywords: [{ required: true, phrase: card.answer ?? '', synonyms: [] }], minPoints: 1,
        });
      } else {
        if (seenMcq.has(card.question ?? '')) continue;
        seenMcq.add(card.question ?? '');
        const correctId = `o${card.options?.indexOf(card.correctOptionText ?? '') ?? 0}`;
        await db.insert(cards).values({
          id: cardId, topicId: t.id, lessonId: null, kind: 'mcq',
          question: card.question ?? '',
          options: (card.options ?? []).map((text, i) => ({ id: `o${i}`, text })),
          correctOptionId: correctId, explanationMd: card.explanationMd ?? '',
          visibility: 'public', ownerId: null, generated: true,
        });
      }
      cardsWritten++;
    }
    console.log(`✓ ${t.id} ${t.name} — ${t.lessons.length} lesson(s), +${incoming.length} card proposals`);
  }

  console.log(`\nDone: ${topicsWritten} topics, ${lessonsWritten} lessons, ${cardsWritten} cards written.`);
}

main().then(() => closeDb()).catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
