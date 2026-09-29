/**
 * Genuine revision summaries for the 19 pre-existing T-Level Cybersecurity
 * lessons whose summaryMd was a copy of their detailedMd (18) or empty (1).
 *
 * Written against the live detailed notes (read from the database), so each is
 * a real condensation — the recall view, not a truncation. This is a
 * SummaryPatchSpec: it updates only summary_md on the listed lesson ids, never
 * creates lessons, and refuses any summary that would be a copy of the notes.
 *
 * Run:  npx tsx scripts/vault/import.ts tlevel-summaries
 */
import type { SummaryPatchSpec } from '../import';

const spec: SummaryPatchSpec = {
  kind: 'summary-patch',
  lessons: [
    {
      id: '9d5bccf1-9658-4429-a9f9-ade9d1c9735d',
      title: 'What is pattern recognition?',
      summaryMd: `**In one line:** computational thinking breaks a problem down so a computer (or a person) can solve it efficiently — pattern recognition, decomposition, abstraction, algorithmic thinking.

- **Why:** large problems become smaller, ordered steps.
- **Use it when** a task splits into parts, steps can be planned in order, or a repeating pattern has a solution you can reuse.
- **Recall hook:** you already do this subconsciously — getting up: prerequisites → routine → route.`,
    },
    {
      id: '5472554a-4a5a-400f-96aa-739c101b4d0d',
      title: 'What is computational thinking?',
      summaryMd: `**In one line:** a problem-solving approach that breaks complex problems down so a computer or a person can solve them efficiently.

Know the four skills and be able to pair each with its definition:
1. **Pattern recognition** — spotting similarities and trends.
2. **Decomposition** — splitting a problem into smaller parts.
3. **Abstraction** — ignoring irrelevant detail.
4. **Algorithmic thinking** — designing step-by-step instructions.`,
    },
    {
      id: '0949f76f-46da-4926-84fd-fa1701821152',
      title: 'What are they?',
      summaryMd: `**Benefits:** manageable steps; systematic tackling; reusable solutions; efficient, well-structured output a computer can follow.

**Drawbacks — know one example of each:**
- **Cost** of implementing (hardware, software, testing).
- Still needs extensive **testing and debugging** across scenarios.
- **Human intervention** when edge cases appear (a robot getting stuck).
- Algorithms can **overlook context** — the "best" technical answer may not be the best practical one.
- **Ethical risk** from biased data/algorithms (hiring tools, facial recognition).

Evaluation questions want a balanced answer: pair a benefit with a drawback, don't argue one side.`,
    },
    {
      id: 'baa451c5-b54c-4625-b134-fef87e21203b',
      title: 'What are they?',
      summaryMd: `Four components — recognise, interpret, predict, apply — with the three datasets as your examples:

- **Social media engagement:** peaks at weekends, dips during 9–5 work; post Sat/Sun.
- **Cafeteria sales:** weekdays high (term-time), Friday peak (events); use to predict stock.
- **Video game sales:** seasonal — colder months up, December peak; announce spring, release autumn.

The pattern-recognition approach in four steps: **identify** the pattern → **interpret** why it exists → **predict** the next data → **state the practical application** (saving time or money).`,
    },
    {
      id: '470242fe-9851-4626-84ad-7832b79a5b63',
      title: 'Decomposition, abstraction and algorithmic thinking.',
      summaryMd: `Three ideas, one line each — and do not mix them up:

- **Decomposition:** split a problem into sub-problems you can solve and test independently (divide and conquer), then combine the sub-solutions. *Tea: boil → teabag → pour → brew → milk.*
- **Abstraction:** keep only the detail the problem needs. *Login check compares username + password — not your favourite colour.*
- **Algorithmic thinking:** write the precise ordered steps (INPUT → IF match → welcome / ELSE denied → STOP).

**Exam tip:** "decompose" means list the sub-problems, not retell the process. **Common mistake:** decomposition = splitting into parts; abstraction = removing irrelevant detail.`,
    },
    {
      id: 'b45dbd04-8a25-431e-9a8d-07183838fcdb',
      title: 'Notes:',
      summaryMd: `**Algorithm** — finite, well-defined, step-by-step instructions (a recipe; a program is one in a runnable language).

Six characteristics — all required: **clear and precise, finite, input, output, effective, well-ordered**.

**Flowcharts** visually represent an algorithm. Symbols and their shapes:
- **Terminator** (rounded rectangle) — start/end.
- **Input/Output** (parallelogram).
- **Process** (rectangle); **Decision** (diamond, labelled Yes/No); **Sub-program** (double-struck rectangle); arrows show flow.
- A good chart has decisions with labelled branches, a loop, and terminators.

**Benefits:** easy to follow, whole process at a glance, great for communication and debugging. **Drawbacks:** messy at scale, slow to draw and redraw, shows structure not detail, poor for recursion.

Notation: \`>\` \`<\` \`!=\`, \`*\` \`/\`, \`x = x - 2\` is assignment, **MOD** keeps only the remainder (7 MOD 3 = 1).`,
    },
    {
      id: '45135816-37da-4dfb-ad7a-dd5d5ae11219',
      title: 'What is it?',
      summaryMd: `Kolb — a continuous loop of **four** stages:

1. **Concrete experience** — the real incident (fixing a live PC).
2. **Reflective observation** — what went well/wrong and why.
3. **Abstract conceptualisation** — the principle for next time ("RAM faults beep — check that first").
4. **Active experimentation** — apply it, which starts the next experience.

**For:** real incidents, structured self-improvement, placements. **Against:** slow, stages get skipped (especially reflection), needs honest motivation.

**Exam tip:** the cycle is a loop — experimentation feeds the next experience; it is not a line that ends.`,
    },
    {
      id: 'f4e73fad-6485-4674-b63c-7ead7bbe1383',
      title: 'What is it?',
      summaryMd: `Gibbs (1988) — **six** stages for reflecting on **one specific event**, ending in an action plan:

1. **Description** (facts) → 2. **Feelings** (yours and others') → 3. **Evaluation** (good/bad) → 4. **Analysis** (the *why* — the core stage) → 5. **Conclusion** (what you learned) → 6. **Action plan** (what you'll change).

Group them: description + evaluation = *the event*; feelings = *you*; analysis + conclusion + action plan = *the learning*. Jumping to a conclusion skips the analysis that makes it transferable.

**Gibbs vs Kolb:** 6 stages vs 4; one event in depth vs the general learning process; ends in an action plan vs active experimentation.`,
    },
    {
      id: 'fbd67fea-b862-4185-ad63-33ab5070620e',
      title: 'Health & Safety',
      summaryMd: `**Risks at a computer:** spills, trailing cables, dust build-up; eye strain (CVS), RSI, back/neck/shoulder pain, headaches, stress. Countermeasures: chair and posture, no glare, peripheral setup, stretch breaks, monitor position — remember **DSE** (Display Screen Equipment).

**Law:** Health and Safety at Work Act 1974; DSE Regulations 1992; GDPR for data. **HSE** = Health & Safety Executive (ventilation, temperature, lighting, space; safe, maintained premises).

**Duties:** employers provide safe equipment + training; employees follow guidance and report issues. A company health & safety policy has three parts: **statement of intent, responsibilities, arrangements**.

**Digital safety:** secure personal data, phishing/malware awareness, strong authentication, follow IT policy.`,
    },
    {
      id: '00d12b96-5189-4b4b-8940-ac82daaf1ed0',
      title: 'What are they?',
      summaryMd: `**Timeline:** DPA 1998 → GDPR + DPA 2018 (25 May 2018) → **UK GDPR** retained post-Brexit. **ICO** regulates and fines. **Data subject** = the person the data is about.

**Consent:** opt-in must be active, specific, informed, unambiguous — silence or pre-ticked boxes are not consent. Withdrawing (opt-out) must be as easy as opting in.

**Six principles + accountability:** lawfulness/fairness/transparency · purpose limitation · data minimisation · accuracy · storage limitation · integrity and confidentiality. (The "eight principles" in the spec are the old DPA 1998 list.)

**Eight data-subject rights:** be informed, access (SAR), rectification, erasure, restrict, portability, object, automated decisions.

**Penalties:** up to £17.5m **or** 4% of worldwide turnover (lower tier £8.7m / 2%). Organisations: ICO fee, lawful basis, privacy notices, records, DPO where required, **breach reporting within 72 hours**.`,
    },
    {
      id: '21d45c9d-cf3a-4fa0-8352-43ec57c549c8',
      title: 'What is it?',
      summaryMd: `**CMA 1990 — five offences and their penalties:**
1. Unauthorised access — fine up to £5,000 and/or 6 months.
2. + intent to commit further crime — unlimited fine and/or 5 years.
3. Unauthorised modification — unlimited fine and/or 5 years.
3A. Supplying/obtaining malware "articles" — unlimited fine and/or 5 years.
3ZA. Acts causing serious damage — up to 14 years, **life** if harm to welfare/national security.

Born from **Gold & Schifreen (1987)**: hacked BT Prestel, convicted under forgery law, conviction quashed — the gap that produced the Act.

**Hackers:** white (permission), grey (no permission, no malice), black (malicious). **Malware:** virus needs a host + human action; worm self-replicates alone — that distinction is a classic exam line. Know DoS vs DDoS (botnet + C2), ransomware (WannaCry), rootkit (admin control, persistence), spyware/RATs, adware.

**Social engineering:** phishing (+spear/smishing/vishing/whaling), pharming (DNS, no click needed), baiting, pretexting, quid pro quo, scareware, shoulder surfing, tailgating (victim **unaware**) vs piggybacking (victim **aware**).`,
    },
    {
      id: 'ab438122-75e2-4001-bda1-a71cf5f8c338',
      title: 'What is it?',
      summaryMd: `Equality Act 2010 consolidated earlier anti-discrimination law (Race Relations 1976, Sex Discrimination 1975, Disability Discrimination 1995).

**9 protected characteristics:** age, disability, gender reassignment, marriage and civil partnership, pregnancy and maternity, race, religion or belief, sex, sexual orientation.

**4 types of discrimination:** direct (unfair treatment for who they are), indirect (a neutral policy that disadvantages a group — Saturday working), harassment (unwanted behaviour), victimisation (punishing a complaint).

**In digital services:** accessible websites and software (screen readers, alt text, contrast, captions), **reasonable adjustments** for disabled users, no bias in algorithms (recruitment/loans/assessment), equal quality of support. The Act applies *positively* — think accessibility and algorithmic bias in scenario questions.`,
    },
    {
      id: '3e23e671-5bb6-4064-9669-94449879e584',
      title: 'What is it?',
      summaryMd: `**IP** = legal rights over intellectual activity. Three types to compare:

| | Protects | How | Duration |
| --- | --- | --- | --- |
| **Unregistered design** | 3D shape and configuration | automatic | 10 yrs after first sale **or** 15 from creation (shorter); licence-of-right in last 5 |
| **Registered design** | appearance — lines, contours, colours, texture, ornamentation | UK IPO, £50 | 5 yrs, renewable to **25** |
| **Patent** | technical inventions (novel, inventive, industrial) | application + examination | up to **20** |

Patents exclude pure software, maths methods and business methods in the UK. Case study: **Apple v Samsung (2011)** — registered design protecting look and feel.

Implications: don't infringe, decide whether to register (cost vs strength), users respect licensing; infringement brings injunctions, damages, recalls, reputational damage.`,
    },
    {
      id: '79a8f108-ecf9-4fb9-a436-72aae0992dbd',
      title: 'What is it?',
      summaryMd: `**Monitoring** = digital tools tracking employee activity, performance, safety or security: CCTV, biometrics, email/internet logs, key logging, GPS, badges, wearables. Never automatic — purpose + **least intrusive** method.

**Purposes:** safety (fatigue sensors), productivity (workflow dashboards), security (access control), compliance (evidence). **Benefits:** safer workplaces, security, better decisions. **Challenges:** privacy, trust/morale, GDPR duties, cost, misuse, the monitoring system itself becoming a target.

**Responsible monitoring is:** necessary, proportionate, transparent, limited, secure, time-limited, reviewed fairly. Covert monitoring is exceptional and formally authorised, never routine.

**Law:** UK GDPR/DPA 2018 is central (monitoring data identifies people); also HSWA 1974, Equality Act 2010 (indirect discrimination check), CMA 1990. Case study method: purpose → necessity/proportionality → were staff informed → data minimised, secured, deleted. Key words: **lawful basis, necessity, proportionality, transparency, data minimisation, retention, security**.`,
    },
    {
      id: '32c78f68-dac4-430e-ad00-b4ec9e754d7b',
      title: 'What is a computer, and the 4 main categories?',
      summaryMd: `A computer takes an **input**, **processes** it, produces an **output** — and may **store** it.

Four categories, each with its exam signature:
- **Personal computers** — general-purpose, expandable, full OS; office, development, gaming, media.
- **Mobile devices** — portable, touch, sensors, wireless; communication, navigation, apps.
- **Servers** — 24/7, reliability and capacity over looks; hosting, databases, cloud.
- **Embedded devices** — one dedicated function inside a larger system, low power, lightweight/real-time OS; appliances, vehicles, medical devices.`,
    },
    {
      id: '1f9bdff4-b899-49bd-b60e-dbf834909a4e',
      title: 'What are they?',
      summaryMd: `**CPU:** Control Unit coordinates via control signals; ALU does arithmetic/logic/shift into the **accumulator**; registers to know: **PC** (next instruction), **CIR** (current instruction = opcode + operand), **MAR** (address), **MDR** (data). Fetch–execute runs on clock pulses; clock speed, **cores** (each runs its own cycle) and **cache** (L1 fastest, split I/D) all raise throughput.

**Mobile chips:** RISC/ARM, **big.LITTLE** mixes performance and efficient cores, **SoC** integrates CPU+GPU+connectivity.

**Memory:** RAM volatile working storage vs ROM non-volatile firmware.

**Cooling:** air (heatsink + fans — cheap, reliable) vs liquid (better thermals, cost/leak risk). Know the air-vs-water trade-off table.

**Storage:** magnetic HDD vs solid state (NAND, no moving parts). **RAID:** 0 stripe (fast, no tolerance), 1 mirror (survives one failure, half capacity), 5 stripe + parity (3+ disks, one failure), 10 mirror + stripe (4 disks, best tolerance). **NAS** = file-level over the network; **SAN** = block-level network (DSS).

**Board and beyond:** chipset routes data; GPU = thousands of parallel cores; NIC gives the MAC address; PCIe lanes (x1→x16) and USB versions (2.0 → 480 Mbps … USB4 → 40 Gbps).`,
    },
    {
      id: '8dc881fb-d837-412d-9bb1-a6d26c77e8be',
      title: 'Features, uses, functions and types.',
      summaryMd: `**Five OS types:** batch (bulk, non-interactive, queued), multitasking (time-slicing, context switching, interrupts), real-time (deadline-driven transactions — banking), network (resource sharing, user management), mobile (low power, battery).

**Functions — from the machine's view:** security, performance control, job accounting, error detection, memory management (allocate/deallocate), processor scheduling, device management via drivers, file management.

**From the user's view:** program execution, I/O handling, file system manipulation, error handling, resource allocation, protection.

Exam pairing to know: batch ↔ payroll/high volume; real-time ↔ transaction processing; network ↔ shared resources; mobile ↔ battery life.`,
    },
    {
      id: '91335f46-2cdb-45ac-ab26-957bbe395f18',
      title: 'Features and uses of common utilities.',
      summaryMd: `**Utility software** = system software that maintains the machine. The six on spec:

- **File management** — move, create, copy, rename, folders, access permissions.
- **Defragmentation** — make file fragments contiguous on an **HDD**; useless and wear-inducing on an **SSD** (no moving parts, limited writes) — the classic trap.
- **File compression** — one smaller archive (PKZIP → "zip it up"; gz, 7z, rar); costs processing to compress/decompress.
- **Package managers** — automated install/upgrade with dependency handling (APT, SNAP — Linux).
- **Protection** — anti-virus (signatures + heuristics), anti-malware (broader), firewall (filters **network** traffic — don't confuse it with device-side AV).
- **Backup** — full clears the **archive (A) flag**; then incremental/differential pick up changed files only. Restore is the point.`,
    },
    {
      id: 'd5c6be4b-8b8a-4cf6-8065-d44e104129df',
      title: 'Features and uses of common application software.',
      summaryMd: `Application software does the user's tasks; system software runs the computer. Spec list: **word processors, spreadsheets, databases, email, project management software**.

- **Word processor** — text documents: styles, spelling, mail merge (Word, Google Docs).
- **Spreadsheet** — rows/columns, formulas, sorting, charts (Excel, Sheets).
- **Database** — structured records, queries, forms, multi-user (Access, MySQL).
- **Email** — formal, traceable, attachments, rules (Outlook, Gmail).
- **Project management** — task boards, **Gantt charts with dependencies**, ownership, workload, progress reporting (Project, Trello, Jira).

Also know: presentations, browsers, communication tools, productivity suites (bundling benefits).

**Exam line:** large structured data with relationships = database; calculations and analysis = spreadsheet — never use the two terms interchangeably, and don't forget project management is a distinct spec category.`,
    },
  ],
};

export default spec;
