/**
 * T-Level Digital Support & Security — Core Exam Papers A + B (Pearson
 * specimen 2020) import manifest.
 *
 * Targets the EXISTING production subject (id below) — the importer's
 * upsertSubject updates by id, so no second subject is created. Adds:
 *
 *  - two exam-workshop topics (one per paper) that host the questions;
 *  - the four specimen documents (QP + MS for each paper) for the stored-paper
 *    reader under "Real papers & mark schemes";
 *  - all 55 questions (Paper A 1–22, Paper B 1–33) as exam-style questions
 *    carrying the per-question AO split exactly as published in the mark
 *    scheme's AO grid, the examiner's award instructions (markSchemeMd), a
 *    model answer built from the indicative content, marking notes that
 *    explain HOW the marks are earned and why, QWC marks (3) on the two
 *    extended-response questions per paper, and keyword rules for
 *    auto-markable point-recall questions (minPoints = required points).
 *
 * Extended 12-mark questions are levels-marked (bands 0–4 × 3 AOs); the app
 * displays the band scheme in the result view but cannot award them —
 * markingNotesMd says to self-assess against the bands.
 *
 * Specimen caveat is preserved from the vault: these predate the 2025
 * specification (610/5799/X); the live blueprint is Core Paper 1 (2h15, 90
 * marks, AO1a 8 / AO1b 22 / AO2 39 / AO3a 12 / AO3b 9) and Core Paper 2
 * (AO1a 10 / AO1b 21 / AO2 38 / AO3a 12 / AO3b 9).
 */
import type { QuestionSpec, SubjectSpec, TopicSpec } from '../import';
import { cleanPaperMd, readVault, TL_PAPERS } from '../papers';

const SUBJECT_ID = 'cb8050d4-13bc-4d40-b926-633c1b0282e6'; // "T-Level Cybersecurity" — existing production subject
const BOARD = 'Pearson (NCFE)';
const YEAR = 2020;

const q = (spec: QuestionSpec): QuestionSpec => ({ board: BOARD, sourceYear: YEAR, ...spec });

// ── Paper A — Section A: Business context and culture ──────────────────────

const paperAQuestions: QuestionSpec[] = [
  q({
    id: 'tlq:tl-paperA:q1', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q1',
    questionMd: 'Unsafe or inappropriate use of digital technology can affect a person\u2019s health. Describe **one** action that could reduce this risk.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO1 = 2 marks**\n\nAward up to two marks for a description of one action that could reduce the risk of effects upon a person\u2019s health. For example:\n\n- regulate an individual\u2019s use of digital technology **(1)** by taking breaks or setting time limits **(1)**\n- undertake a workstation assessment or display screen equipment (DSE) assessment (the abbreviation DSE should be awarded) that checks the set-up of all elements of the workstation, including back support and footrest **(1)**, and implement/action any recommendations for safe set up **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: 'Carry out a **DSE (display screen equipment) workstation assessment**: check that the chair, screen height, keyboard and footrest are set up correctly, then **implement any recommendations** — for example raising the monitor to eye level and adjusting back support. Combined with regular screen breaks, this removes the postural and eye-strain risks of prolonged computer use.',
    markingNotesMd: 'AO1 tests knowledge and understanding of the sector. Both marks need the *action* **and** the detail of how it reduces risk — "take breaks" alone is one mark; naming the mechanism (what the break/assessment does to the risk) earns the second.',
    aoSplit: [{ ao: 'AO1', marks: 2 }], specRefs: 'Unit 4.1.1 (Health & Safety — DSE workstation assessments)',
    keywords: [
      { required: true, phrase: 'break', synonyms: ['breaks', 'time limit', 'limit time'] },
      { required: true, phrase: 'workstation', synonyms: ['dse', 'display screen equipment', 'posture', 'set up', 'setup'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q2', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q2',
    questionMd: 'Businesses have a range of different internal stakeholders.\n\nName **three** different internal stakeholders and briefly describe how each stakeholder you have named could influence the way a digital business operates.\n\n**[3 marks]**',
    marks: 3,
    markSchemeMd: '**AO1 = 3 marks**\n\nTo achieve each mark, students must correctly name both an internal stakeholder **and** include a brief description of their potential influence, up to a maximum of three marks. For example:\n\n- owners — influence by setting objectives for a business **(1)**\n- board of directors — influence by allocating funding to different projects **(1)**\n- employees — influence by their particular experiences and expertise relating to job requirements **(1)**\n- departments — influence a business by their specific requirements needed to complete work allocated **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '- **Owners** — set the overall objectives of the business, so decide what the digital strategy must achieve.\n- **Board of directors** — allocate funding between projects, so they choose which digital initiatives go ahead and at what scale.\n- **Employees** — bring specific experience and expertise to their roles, shaping how systems are actually used and improved day to day.',
    markingNotesMd: 'AO1. Each mark = a correctly named *internal* stakeholder + their influence. Naming without the influence scores zero for that stakeholder. "Internal" is the discriminator — customers/suppliers are external and score nothing.',
    aoSplit: [{ ao: 'AO1', marks: 3 }], specRefs: 'Unit 1 (business context)',
    keywords: [
      { required: true, phrase: 'owner', synonyms: ['owners'] },
      { required: true, phrase: 'director', synonyms: ['board of directors', 'board'] },
      { required: true, phrase: 'employee', synonyms: ['employees', 'staff', 'workers'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q3', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q3',
    questionMd: 'A company has recently moved to working in 3 locations, each of which has limited space. Staff must regularly travel between them for meetings.\n\nTheir IT equipment is old and needs to be updated.\n\nThe company wants to reduce operating costs and increase productivity.\n\nThey are considering whether remote working would support this.\n\nDescribe **four** possible impacts on the company of moving to remote working.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO2 = 4 marks**\n\nAward one mark for each different description of an impact on the company that is applied to the scenario, up to a maximum of four marks. For example:\n\n- introduction of remote working will reduce travel between the different sites as the company\u2019s staff can hold remote meetings **(1)**\n- introduction of remote working would require an update to the company\u2019s IT equipment to support digital communication methods **(1)**\n- introduction of remote working will resolve the issue of space in the company\u2019s offices as staff can work from home and won\u2019t require desks or meeting areas in the office **(1)**\n- introduction of remote working will reduce costs to the company from travel **(1)**\n- reduced travel time will mean that the company could plan for an expected increase in productivity **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. Less travel between the three sites — meetings can be held remotely, cutting the inter-site journeying.\n2. The old IT equipment would need updating to support digital communication methods (video conferencing, collaboration tools).\n3. Office space pressure resolves — staff working from home need fewer desks and meeting areas.\n4. Travel costs fall, and the travel time saved can be planned into an expected productivity increase.',
    markingNotesMd: 'AO2 is *application*: the impact must be tied to THIS scenario (3 sites, old equipment, cost/productivity aims). A generic benefit of remote working that could apply to any company is not awarded.',
    aoSplit: [{ ao: 'AO2', marks: 4 }], specRefs: 'Unit 1 (business context)',
    keywords: [
      { required: true, phrase: 'travel', synonyms: ['commut', 'journey'] },
      { required: true, phrase: 'equipment', synonyms: ['it equipment', 'hardware', 'update', 'upgrade'] },
      { required: true, phrase: 'space', synonyms: ['office space', 'desks', 'desks or meeting'] },
      { required: true, phrase: 'cost', synonyms: ['costs', 'cheaper', 'reduce operating'] },
    ], minPoints: 3,
  }),
  q({
    id: 'tlq:tl-paperA:q4', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q4',
    questionMd: 'A local florist is developing a website to start selling their products online instead of from their high street shop. They have a target to increase their profits by 50%.\n\nDiscuss **four** ways in which a digital approach could help them to meet their target.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO3 = 4 marks**\n\nAward one mark for each discussion point about the way in which digitalisation could help the business meet their targets, up to a maximum of four marks, for example:\n\n- the business could use multiple digital approaches to promote products and services to specific target markets; this would increase sales, and promoting products where there is excess stock would reduce waste **(1)**\n- the use of a website to take sales could reduce operating costs such as overheads, as there is no cost for the physical store or staff to work in the store **(1)**\n- the website will enable them to sell and advertise to a larger geographical target market, which could include new potential customers from a wider area who may not have been aware of the shop **(1)**\n- customer online surveys could be used to monitor customer satisfaction scores; this could result in information leading to the business producing a superior product and therefore improve competitiveness **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Targeted promotion** — digital marketing reaches specific customer segments, raising sales; promoting excess stock lines also cuts waste, both feeding profit.\n2. **Lower overheads** — online orders need less physical retail space and fewer shop staff, so operating costs drop while revenue grows.\n3. **Wider market** — a website sells beyond the high street\u2019s footfall, reaching new customers in a larger geographical area who never knew the shop existed.\n4. **Customer feedback loops** — online surveys track satisfaction, and acting on that data improves the product, competitiveness and repeat custom.',
    markingNotesMd: 'AO3 is analysis/evaluation: *discuss* means develop the point to its business consequence (profit!). A bare list of digital tools scores poorly — each point must be reasoned through to the 50% profit target.',
    aoSplit: [{ ao: 'AO3', marks: 4 }], specRefs: 'Unit 1 (business context)',
    keywords: [
      { required: true, phrase: 'target market', synonyms: ['targeted', 'specific target', 'advert', 'promot'] },
      { required: true, phrase: 'overhead', synonyms: ['operating cost', 'costs', 'overheads'] },
      { required: true, phrase: 'geographical', synonyms: ['wider area', 'larger market', 'wider market', 'wider geographical'] },
      { required: true, phrase: 'survey', synonyms: ['feedback', 'customer satisfaction', 'satisfaction'] },
    ], minPoints: 3,
  }),
  q({
    id: 'tlq:tl-paperA:q5', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q5',
    questionMd: 'A digital marketing agency is completing a major update of its customer content management system.\n\nDescribe **both** of the following processes:\n\n- roll back planning\n- documenting.\n\nExplain why each process could be important to the business when they integrate new systems.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO1 = 2 marks** · **AO2 = 2 marks**\n\nAO1 — one mark for each description of the processes (roll back planning and documentation), up to two marks:\n\n- roll back planning is a way of planning for a business to go back to a previous version of a system when making system changes **(1 AO1)**\n- documenting is recording up-to-date information of the change **(1 AO1)**; recording all decisions **(1 AO1)**; updating training manuals to accurately record any process changes required as a result of the system change **(1 AO1)**.\n\nAO2 — one mark for each explanation of the importance of the process to the business in the integration of new systems:\n\n- roll back planning allows the business to go back to the previous system and restore any marketing collateral or other content if the change is not successful or the system update fails **(1 AO2)**\n- documenting is important so the agency can continue to deliver client marketing campaigns as agreed following the update **(1 AO2)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**Roll back planning** — a plan for reverting to the previous version of the system if an update fails **(AO1)**. Importance: if the new CMS integration breaks, the agency restores the old system and client content instead of losing campaign capability while a fix is found **(AO2)**.\n\n**Documenting** — recording up-to-date information of the change and all decisions taken, and updating manuals/processes to match **(AO1)**. Importance: staff and clients can keep working to correct processes, so agreed marketing campaigns continue to be delivered without interruption after the update **(AO2)**.',
    markingNotesMd: 'Split structure: 2 marks for *what each process is* (AO1), 2 for *why it matters here* (AO2). Answer both halves for both processes — describing only is 2/4.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO2', marks: 2 }], specRefs: 'Unit 2 (digital support context)',
    keywords: [
      { required: true, phrase: 'previous version', synonyms: ['go back', 'revert', 'restore', 'rollback'] },
      { required: true, phrase: 'recording', synonyms: ['record', 'document', 'recording up-to-date', 'decisions'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q6', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q6',
    questionMd: 'A business is considering changes to their digital systems to reduce their carbon footprint, become more eco-friendly and reduce operational costs. These changes require them to install a range of power efficient components into their digital infrastructure. These new components will have to operate effectively with the existing components, to avoid disruption to the services used by staff.\n\na) Describe **three** preparation and planning tasks that would facilitate these changes.\n\nb) Describe **three** operational tasks that would facilitate these changes.\n\n**[6 marks]**',
    marks: 6,
    markSchemeMd: '**AO2 = 6 marks**\n\nAward one mark for each preparation and planning task described in relation to the scenario, up to a maximum of three marks. For example:\n\n- effectively communicate to staff the planned changes to create awareness or buy-in **(1)**\n- workforce planning to support the installation and ensure adequate staff are available **(1)**\n- disposal of the old equipment **(1)**\n- planning for the interface of new products **(1)**\n- planning of timescales to limit any impact on staff **(1)**.\n\nAward one mark for each operational task described in relation to the scenario, up to a maximum of three marks. For example:\n\n- implement testing to ensure that the new eco-friendly components work efficiently with existing components so that there is no disruption to the operations of the business **(1)**\n- any faults that arise from the integration of the new components should be fixed in a timely manner to ensure negative impacts to staff are reduced **(1)**\n- training staff on the new systems to ensure the most efficient use of energy and resource usage; this will ensure best practice for the new tracking tools and processes **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**a) Preparation and planning**\n1. Communicate the planned changes to staff to create awareness and buy-in.\n2. Workforce planning so adequate staff are available for the installation; plan timescales to limit impact on staff.\n3. Plan for the interface between new and existing components, and arrange disposal of the old equipment.\n\n**b) Operational**\n1. Test that the new power-efficient components work efficiently with the existing ones before go-live, so staff services are not disrupted.\n2. Fix any faults arising from the integration promptly to limit negative impact on staff.\n3. Train staff on the new systems so energy and resource usage is efficient and best practice is followed.',
    markingNotesMd: 'AO2 applied to the scenario. a) = *before* the change (planning verbs), b) = *during/after* (doing verbs). Answering both halves with the same kind of task caps at 3.',
    aoSplit: [{ ao: 'AO2', marks: 6 }], specRefs: 'Unit 2 (digital support context)',
    keywords: [
      { required: true, phrase: 'communicate', synonyms: ['communicate to staff', 'awareness', 'buy-in'] },
      { required: true, phrase: 'test', synonyms: ['testing'] },
      { required: true, phrase: 'train', synonyms: ['training', 'training staff'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q7', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q7',
    questionMd: 'A UK organisation is looking for new markets outside the UK to increase their sales. The organisation specialises in high-end technological devices such as the latest smartphones and tablets.\n\nDiscuss **three** economic factors which could impact the business entering markets outside of the UK and how they could be mitigated.\n\n**[6 marks]**',
    marks: 6,
    markSchemeMd: '**AO3 = 6 marks**\n\nAward one mark for a relevant discussion point for each economic factor, up to a maximum of three marks; award one mark for each mitigation of the economic factors, up to a maximum of three marks.\n\n**Indicative content:**\n\n- The cost of doing business could be high as some markets may have additional tariffs on overseas organisations, which may impact the ability for the organisation to be profitable — the tariff is an additional cost deducted from revenue **(economic factor, 1)**. However, the cost of these tariffs could be offset by the potential additional market size, so the balance of cost against revenue would have to be considered **(mitigation, 1)**.\n- In the case of recession in the potential market, a lower price should be charged or the product launch delayed, particularly as the products are \u2018high-end\u2019 **(economic factor, 1)**. In recession the economy shrinks, customer confidence is low and spending reduces; this could be short term, and the business would benefit in the long term by already being established and recognised in the market **(mitigation, 1)**.\n- The consumer trends of the region must be taken into account to ensure a market exists for high-end devices; without this market there would be no demand and revenue would be low, potentially making a loss **(economic factor, 1)**. This would require research into the new market, which is likely to be financially expensive, but the knowledge gained would potentially avoid a costly release of a product that has little or no demand **(mitigation, 1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Tariffs and cost of doing business** — overseas markets may impose tariffs, an extra cost deducted from revenue that squeezes profitability. *Mitigation:* weigh tariff cost against the larger market size before committing; price and supply-chain decisions can absorb part of it.\n2. **Recession in the target economy** — in a downturn, demand for high-end devices falls first, so revenue may not cover costs. *Mitigation:* enter at a lower price point or delay the launch; being established early positions the brand for the recovery.\n3. **Consumer trends** — if the region\u2019s tastes don\u2019t match premium devices, there is no market and loss follows. *Mitigation:* fund market research first — expensive, but far cheaper than a failed product launch.',
    markingNotesMd: 'AO3. Each factor earns one mark, its mitigation another — the pairing is the skill: every risk must be answered with a business response. Three bare factors with no mitigation = 3/6.',
    aoSplit: [{ ao: 'AO3', marks: 6 }], specRefs: 'Unit 1 (business context)',
    keywords: [
      { required: true, phrase: 'tariff', synonyms: ['tariffs'] },
      { required: true, phrase: 'recession', synonyms: ['recession', 'downturn', 'economy'] },
      { required: true, phrase: 'consumer trends', synonyms: ['consumer', 'demand', 'trends of the region', 'market research'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q8', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q8 (extended)',
    questionMd: 'A local community sports club has set up a website for customers to book sessions and make payments. Customers must book through an **unsecured** area of the website.\n\nTo make a booking, customers must enter their personal details. This information is then stored in a **spreadsheet that is accessible by all sports club staff**. There is no option for customers to make bookings in person.\n\nDiscuss the risks of the booking process and evaluate the possible impacts of these risks on the sports club and their customers.\n\n**[12 marks, plus 3 for QWC]**',
    marks: 12, qwcMarks: 3,
    markSchemeMd: '**AO1 = 4 marks · AO2 = 4 marks · AO3 = 4 marks** — levels-marked (bands 0–4); award holistically using the band descriptors, then split across the AOs.\n\n**Band 4 (10–12):** discussion of risk impact is comprehensive, effective and relevant, showing detailed understanding and logical, coherent chains of reasoning throughout; informed conclusions fully supported with rational and balanced judgements. *AO2:* applied all relevant knowledge of risk to the context (impact on the sports club) with detailed functional understanding of risks and impacts. *AO1:* a wide range of relevant knowledge and understanding of risk and impacts of risk, accurate and detailed.\n\n**Band 3 (7–9):** discussion mostly effective and relevant, mostly logical chains of reasoning; conclusions supported by judgements considering most relevant arguments.\n\n**Band 2 (4–6):** discussion of some relevance with generic statements and some development; brief conclusions considering only the most basic arguments.\n\n**Band 1 (1–3):** minimal, very limited effectiveness/relevance; tenuous, unsupported conclusions.\n\n**Band 0:** no relevant material.\n\n**QWC = 3 marks:** 3 = clearly expressed, well structured, effective control of grammar, wide range of technical terms used effectively; 2 = generally clear, general control, good range of terms; 1 = lacks some clarity, poorly structured, limited terms; 0 = no creditworthy material or severely hindered meaning.\n\n**Indicative content — AO1 risks:** privacy (loss of control over personal/business information); security (compromise of confidentiality, integrity and availability of business data); non-compliance (policies, procedures, legislation); audience exclusion (bias towards a particular demographic); technical (system not fit for business purpose, does not meet user requirements).\n\n**Potential impacts of risks:** lawsuits from failing to address a risk that breaks the law; fines from legal proceedings or breaching professional standards; reputational/brand damage spreading to potential customers; withdrawal of licence/certification; loss of business as competitors make a better impression and in-person booking is excluded; stolen data used by fraudsters.\n\n**AO2 application:** the unsecured website means data transferred by customers can be intercepted or stolen by malicious actors; personal information and bank details are stored insecurely on a spreadsheet accessible by all staff — sensitive information with no access control; no password or access control appears to be required for bookings; with no in-person or telephone booking option, a significant proportion of the population either cannot access the club or will not book on an unsecure site.\n\n**AO3 evaluation:** leaked staff-accessible data leads to reputational damage in the local community; the club might struggle to continue operating as customers go elsewhere. Security practices breach GDPR — open to legal action and fines, which for a small club could mean closure. Without passwords, anyone can book even if not a member; non-members bypass annual fees and the club loses revenue.',
    modelAnswerMd: '**Risks (AO1).** The booking page is unsecured, so personal and payment details are transmitted without protection (confidentiality failure). They are then stored in a spreadsheet every staff member can open — no access control, no audit trail. The process is also non-compliant with data-protection legislation, and excluding in-person booking creates audience exclusion. Finally, the system is arguably not fit for business purpose.\n\n**Applied to the club (AO2).** Because bookings travel over an unsecured area, customer personal and bank details can be intercepted and stolen. Staff-wide access means any staff member — or anyone who gets their credentials — can read or exfiltrate the data. No password gate means anyone, member or not, can make bookings. And customers without internet confidence, or who prefer paying in person, simply cannot use the club at all.\n\n**Impacts and evaluation (AO3).** A breach would become public knowledge locally, damaging the club\u2019s reputation; customers would move to competitors, and for a small club that can be terminal. The practices breach UK GDPR: the ICO could fine the club and individuals could sue, costs a community club cannot absorb. Uncontrolled bookings let non-members bypass annual fees, losing revenue. On balance, the club should treat this as an existential risk: secure the booking flow (TLS, hashed storage, role-limited access), add non-digital booking options, and review compliance before a breach forces the issue.',
    markingNotesMd: 'Levels-marked: the examiner judges the WHOLE response against the band descriptors first, then distributes across AO1/AO2/AO3. Structure that earns band 4: name distinct risks (AO1 knowledge) → apply each to THIS club\u2019s set-up (AO2) → reason each through to impacts on club *and* customers, with a supported conclusion (AO3). QWC is marked separately: technical vocabulary (GDPR, CIA triad, access control), clear structure, accurate grammar.',
    aoSplit: [{ ao: 'AO1', marks: 4 }, { ao: 'AO2', marks: 4 }, { ao: 'AO3', marks: 4 }], specRefs: 'Units 4.1.2 (DPA/UK GDPR), 4.1.3 (CMA/security), 8 (security) — extended-response synthesis',
    keywords: undefined, minPoints: undefined,
  }),
  q({
    id: 'tlq:tl-paperA:q9', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q9',
    questionMd: 'Jane runs a marketing consultancy business from home. She regularly uses a range of online tools to facilitate online banking, video conferencing and online collaborative working.\n\nJane has a poor internet connection because of where she lives.\n\nExplain **two** ways poor internet connection could have an adverse effect on Jane\u2019s business.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO2 = 2 marks**\n\nAward one mark for each explanatory point, up to a maximum of two marks. For example:\n\n- a poor internet connection would impact on video conferencing and collaborative working, reducing its effectiveness **(1)** and professional appearance **(1)**\n- Jane could lose business to competitors as she could be unproductive and therefore more costly to operate **(1)**\n- Jane\u2019s business may involve use of large image/graphic files, and poor internet will slow down working with these files **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. Video conferencing and collaborative working with clients will stutter or drop, making Jane appear unprofessional and reducing the effectiveness of client-facing sessions.\n2. Large image and graphic files — the raw material of a marketing consultancy — will transfer slowly, cutting productivity; if she is unproductive her costs rise and clients may defect to competitors.',
    markingNotesMd: 'AO2 — the effect must be tied to *her* business (client calls, design files). One mark per developed point; two undeveloped effects still earn one each only if distinct.',
    aoSplit: [{ ao: 'AO2', marks: 2 }], specRefs: 'Unit 3 (digital environments)',
    keywords: [
      { required: true, phrase: 'video conferencing', synonyms: ['video', 'calls', 'collaborative working', 'meetings'] },
      { required: true, phrase: 'professional', synonyms: ['appearance', 'unprofessional', 'productiv'] },
    ], minPoints: 1,
  }),
  q({
    id: 'tlq:tl-paperA:q10', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q10',
    questionMd: 'The table below shows a list of descriptions. Select the number of the correct description for each of the below:\n\n- **router**\n- **switch**\n\n| # | Description |\n| --- | --- |\n| 1 | A device that broadcasts network packets to all connected devices |\n| 2 | A device that sends network packets directly to intended device using MAC address |\n| 3 | A device that interconnects different networks and subnets |\n| 4 | A device that provides network access to wireless clients |\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO1 = 2 marks**\n\nAward one mark for matching each device to the correct description, up to a maximum of two marks:\n\n- **router** — a device that interconnects different networks and subnets, **option 3**\n- **switch** — a device that sends network packets directly to the intended device using MAC address, **option 2**.',
    modelAnswerMd: '- **Router → 3** — routers sit between networks/subnets and route traffic between them.\n- **Switch → 2** — switches forward frames to the specific device identified by its MAC address.',
    markingNotesMd: 'AO1 recall. Distractor trap: option 1 (broadcast to all) describes a hub; option 4 (wireless clients) describes a wireless access point.',
    aoSplit: [{ ao: 'AO1', marks: 2 }], specRefs: 'Unit 7.1.2 (connectivity hardware)',
    kind: 'mcq',
    options: ['Router → option 3 (interconnects networks and subnets); Switch → option 2 (forwards using MAC address)', 'Router → option 1 (broadcasts to all devices); Switch → option 3 (interconnects networks)', 'Router → option 4 (provides wireless access); Switch → option 1 (broadcasts to all)', 'Router → option 2 (forwards using MAC address); Switch → option 3 (interconnects networks)'],
    correctIdx: 0,
  }),
  q({
    id: 'tlq:tl-paperA:q11', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q11',
    questionMd: 'An algorithm design analyses people\u2019s race, employment status and credit rating to determine whether they should be approved for a loan.\n\nState which piece of UK legislation this algorithm could be in breach of, and briefly describe why it might breach that legislation.\n\n**[3 marks]**',
    marks: 3,
    markSchemeMd: '**AO1 = 3 marks**\n\nAward one mark for stating the Equality Act 2010, and two marks for describing that the algorithm design discriminates against race. For example:\n\n- the algorithm would breach the Equality Act (2010) **(1)** because when deciding on whether to approve a loan it discriminates **(1)** against race **(1)**.',
    modelAnswerMd: 'The algorithm could breach the **Equality Act 2010**. Using race as an input to a loan-approval decision is **direct discrimination** — applicants are treated less favourably because of a protected characteristic, which the Act prohibits.',
    markingNotesMd: 'AO1. 1 mark for the Act (exact name), 2 for the why: discrimination + race as the protected characteristic. Data Protection Act answers do not score — the protected-characteristic angle is the discriminator.',
    aoSplit: [{ ao: 'AO1', marks: 3 }], specRefs: 'Unit 4.1.4 (Equality Act 2010 — protected characteristics)',
    keywords: [
      { required: true, phrase: 'equality act', synonyms: ['equality act 2010'] },
      { required: true, phrase: 'discriminat', synonyms: ['discrimination', 'discriminates'] },
      { required: true, phrase: 'race', synonyms: ['racial'] },
    ], minPoints: 3,
  }),
  q({
    id: 'tlq:tl-paperA:q12', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q12',
    questionMd: 'A local shop has donated two PCs and a printer to a local library. The library would like to use this equipment to create a network. The network will support those in the community that do not have access to the internet or computers at home.\n\nAims of the project include:\n\n- help with job search and job applications\n- educational activities\n- ensuring the online safety of community members using the computers.\n\nThe library wants to keep the computers safe from cyber attacks and misuse.\n\na) Explain **two** ways in which the library could use **hardware** components to establish the network between the PCs and printer and allow internet access and printing in a secure way.\n\nb) Explain **two** ways in which the library could use **software** to achieve the aims of the project.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO2 = 4 marks**\n\na) One mark for each explanation of a hardware component establishing the network securely, up to two marks:\n\n- cabling could be used to connect the devices to the library network **(1)**\n- a switch could be used to switch traffic to allow the devices to communicate with each other and with other devices on the library network **(1)**\n- a router can be used to switch traffic, but in addition allow connection to the library\u2019s internet **(1)**.\n\nb) One mark for each explanation of software achieving the project\u2019s aims, up to two marks:\n\n- system software — an operating system would provide a visual interface for users to use **(1)**\n- application software for productivity such as word processor and spreadsheet software would allow users to create CVs and applications **(1)**\n- application software for accessing the internet, to conduct job searches **(1)**\n- application software for protection such as internet security to block certain websites or applications **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**a) Hardware.** Connect the PCs and printer to a **switch** with cabling so the devices communicate on one secure library network. Add a **router** to give controlled internet access for job searches while keeping the network segmentable.\n\n**b) Software.** Provide **productivity applications** (word processor, spreadsheet) so community members can write CVs and job applications. Run **internet security software** (content filtering, anti-malware) so users stay safe online and the machines resist cyber attack and misuse.',
    markingNotesMd: 'AO2 — "explain" needs what it is + what it achieves for THIS project. Hardware answers in the software half (or vice versa) score nothing: the split is the test.',
    aoSplit: [{ ao: 'AO2', marks: 4 }], specRefs: 'Units 7.1.2 (hardware), 7.2.2–7.2.3 (utilities, applications)',
    keywords: [
      { required: true, phrase: 'switch', synonyms: ['router', 'cabling', 'cable'] },
      { required: true, phrase: 'security', synonyms: ['internet security', 'protection', 'filter', 'anti-virus', 'block'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q13', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q13',
    questionMd: 'Harmeet is the managing director of a local gym. He is planning to expand into new locations. He wants to learn about ways that the cloud can provide efficiencies of scale.\n\nExplain **two** ways in which cloud computing could benefit Harmeet\u2019s business.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO2 = 4 marks**\n\nAward two marks for each explanation, up to a maximum of four marks. For each explanation the breakdown is: a way in which cloud computing can benefit **(1)** and an explanation of why this way will achieve this benefit **(1)**. Each bullet gives the standard required for two marks:\n\n- The cloud would allow the gym to access advanced technology without the cost of having to own and configure equipment to run it themselves **(1)**, reduced costs and skills requirement of ongoing maintenance of technology — as IT is not the focus of the gym **(1)**.\n- This would allow the gym to utilise enterprise grade protection from attacks such as phishing and ransomware **(1)**, and therefore protect member\u2019s data which is vital for this business because they not only hold personal information, such as name and date of birth, but also information on gym sessions attended and health history **(1)**.\n- The cloud-based storage would allow the gym records to be accessed from all locations which would reduce the burden of setting up local systems at each new gym **(1)**, and would be easier to scale as the business grows **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Access to advanced technology without owning it** — the gym buys cloud services rather than purchasing and configuring servers; that removes the ongoing maintenance cost and skills requirement, sensible because IT is not the gym\u2019s core competence.\n2. **Shared records across locations** — cloud storage means member data is reachable from every new site without building local systems each time, and capacity scales smoothly as the business grows.',
    markingNotesMd: 'AO2, 2+2 structure: benefit named (1) + why it delivers for Harmeet\u2019s expanding gym (1). Two named benefits with no "why" = 2/4.',
    aoSplit: [{ ao: 'AO2', marks: 4 }], specRefs: 'Unit 7 (digital environments — cloud/virtual computing)',
    keywords: [
      { required: true, phrase: 'without', synonyms: ['no need', 'not have to own', 'avoid the cost'] },
      { required: true, phrase: 'scale', synonyms: ['scal', 'grow', 'grows', 'locations', 'all locations'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q14', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q14',
    questionMd: 'a) Describe the functionality of the routing protocols **RIP** and **OSPF**.\n\nb) A small, single-site business is planning to open new sites. The business is considering which routing protocol to use.\n\nEvaluate whether RIP or OSPF would be the most effective protocol.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO1 = 2 marks · AO3 = 2 marks**\n\na) One AO1 mark for a relevant and accurate description of RIP, and one for OSPF:\n\n- RIP is a distance vector protocol; it learns about destination networks through broadcasts from neighbouring routers **(1 AO1)**\n- OSPF is a link-state protocol; two routers communicate with one another, providing information of routes they are aware of and costs to reach that location **(1 AO1)**.\n\nb) Up to two AO3 marks for discussion of the effectiveness of each protocol in the scenario:\n\n- RIP has a hop count limited to 15; this suits small networks and single-site businesses, but means RIP would not be suitable for future growth **(1 AO3)**\n- OSPF has no hop count limitations and assesses the shortest path with the least traffic; it is therefore more suitable for multi-site businesses as there is no limitation on size **(1 AO3)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**a)** RIP is a **distance-vector** protocol: routers learn destination networks via periodic broadcasts from their neighbours. OSPF is a **link-state** protocol: routers exchange route and cost information directly, building a map of the network and choosing the cheapest path.\n\n**b)** For the single-site business today, RIP\u2019s simplicity suffices — but its 15-hop ceiling caps growth. As the business opens new sites, **OSPF is the effective choice**: no hop-count limit and shortest-path-with-least-traffic selection scales to the multi-site topology the business is heading for.',
    markingNotesMd: 'a) is pure AO1 description; b) is AO3 judgement — the evaluation must weigh BOTH protocols against the business\u2019s *stated direction* (new sites), not just describe RIP again.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO3', marks: 2 }], specRefs: 'Unit 7 (network protocols)',
    keywords: [
      { required: true, phrase: 'distance vector', synonyms: ['distance-vector'] },
      { required: true, phrase: 'link state', synonyms: ['link-state'] },
      { required: true, phrase: 'hop', synonyms: ['hop count', '15'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q15', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q15',
    questionMd: 'Identify **three** ways that a digital business can benefit from using a diverse and inclusive recruitment process and evaluate their possible impacts.\n\n**[6 marks]**',
    marks: 6,
    markSchemeMd: '**AO3 = 6 marks**\n\nAward one mark for each identified benefit of a diverse and inclusive recruitment process (up to three marks), and one mark for each impact evaluated as resulting from the identified benefit (up to three marks). Students can be awarded marks for evaluating more than one impact of a single benefit. For example:\n\n- greater appeal to potential employees **(benefit 1)**, which widens a business\u2019s potential recruitment pool **(impact 1)** and possible employee skillsets; ensuring this happens addresses the current demographic imbalance within the digital sector, so the business benefits from different opinions and ideas, resulting in better decision making **(impact 1)**\n- inclusive recruitment may help to connect authentically to under-represented groups **(benefit 1)**; this may lead to increased positive reputation of inclusivity **(impact 1)**\n- digital businesses are often impacted by gender imbalances; inclusive recruitment ensures gender balance within the business and represents the communities in which they operate **(benefit 1)**, leading to better working relationships **(impact 1)** and exchange of ideas **(impact 1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Broader appeal to candidates** — the recruitment pool and skill mix widen; a workforce reflecting the sector\u2019s full demographic brings different opinions and ideas, measurably improving decision making.\n2. **Authentic community connection** — inclusive hiring builds a genuine reputation for inclusivity, strengthening the brand with customers and candidates alike.\n3. **Correcting gender imbalance** — a balanced workforce represents the communities the business serves, producing better working relationships and a free exchange of ideas.',
    markingNotesMd: 'AO3 3+3: identify (1) + evaluate the impact (1) per benefit. The evaluation is the mark — a benefit restated as its own impact does not score the second mark.',
    aoSplit: [{ ao: 'AO3', marks: 6 }], specRefs: 'Unit 1 (diversity and inclusion)',
    keywords: [
      { required: true, phrase: 'pool', synonyms: ['recruitment pool', 'wider pool', 'talent'] },
      { required: true, phrase: 'reputation', synonyms: ['reputational', 'brand'] },
      { required: true, phrase: 'ideas', synonyms: ['exchange of ideas', 'different opinions', 'perspectives', 'decision making'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q16', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q16 (extended)',
    questionMd: 'You are a digital support specialist working within the IT department of a local college.\n\nRecently the **domain controller server went offline, causing a major network outage**.\n\nThe college requires that the network must be available 24/7 and allow for staff and students to access services such as email from home and mobile devices. Additionally, users must be able to access the full range of software that the college has available and be able to create, open, edit and save documents, along with uploading documents to the college network.\n\nAnalyse the college\u2019s requirements and make justified recommendations to the board of directors with respect to their digital infrastructure.\n\n**[12 marks, plus 3 for QWC]**',
    marks: 12, qwcMarks: 3,
    markSchemeMd: '**AO1 = 4 marks · AO2 = 4 marks · AO3 = 4 marks** — levels-marked (bands 0–4), judged holistically then split across AOs.\n\n**Band 4 (10–12):** analysis of the potential requirements with respect to digital infrastructure and the technologies involved is comprehensive, effective and relevant, with detailed understanding and logical, coherent chains of reasoning throughout; effectively informed judgements, fully supported, rational and balanced conclusions. *AO2:* applied all relevant knowledge of digital infrastructure networks to the context with detailed functional understanding of how technologies link to one another. *AO1:* wide range of relevant knowledge and understanding of digital environments and technologies, accurate and detailed.\n\n**Band 3 (7–9):** analysis mostly effective and relevant, mostly logical chains of reasoning; conclusions supported by judgements considering most relevant arguments.\n\n**Band 2 (4–6):** analysis of some relevance, generic statements with some development; brief conclusions from the most basic arguments.\n\n**Band 1 (1–3):** minimal, very limited; tenuous, unsupported conclusions.\n\n**QWC = 3 marks:** as per the standard grid (clarity, structure, grammar, technical terms).\n\n**Indicative content — AO1:** components of physical computing systems and their applications; types of networks, hardware and software, and functions of IoT; types and applications of network protocols and referencing models; components and benefits of virtual computing systems.\n\n**AO1 benefits of cloud and virtual computing:** cloud portability (move services quickly and easily); cloud sourcing (purchase services from a third party); elastic cloud (on-demand services scaled to need); storage without physical limitations; cost-effectiveness through efficiencies of scale.\n\n**AO2/AO3 application/analysis:** the board should weigh financial costs against benefits. Given specific requirements for user access and improved network reliability, the college should invest in new server hardware and provide cloud-based software and network access **(AO2)**. The network must comply with the stated requirements — available from home and mobile devices — to meet the 24/7 access stipulation **(AO2)**. A virtual computing system fulfils these requirements because it can be accessed by any online device regardless of time or location; although expensive to establish, staff and students are no longer limited to the college site and can work remotely at a time and place that suits them **(AO3)**. Moving to a cloud/virtual environment lets staff and students move work between college hardware and home devices without losing data, continuing studies around other commitments **(AO2/AO3)**. The feature would appeal to prospective students, potentially increasing student numbers and income, which offsets the initial costs **(AO3)**.',
    modelAnswerMd: '**Requirements analysis (AO1).** The outage exposed a single point of failure: one domain controller. The college\u2019s requirements are (1) 24/7 availability, (2) off-site access from home and mobile devices, (3) full software access with document create/edit/save and upload to college storage.\n\n**Applied to the college (AO2).** Redundant server hardware (a second domain controller, failover clustering) directly addresses the outage risk. Cloud-hosted productivity suites meet the remote-access requirement: email, documents and college storage reachable from any device, with elastic capacity at enrolment peaks and no physical storage ceiling.\n\n**Justified recommendations (AO3).** I recommend the board fund (a) a redundant on-premises core for authentication and (b) cloud-based applications and storage for everything else. The virtual/cloud layer is expensive to establish, but it removes the dependency on any single campus system, lets staff and students start work on site and finish it at home without data loss, and — as a feature that attracts prospective students — the resulting income growth offsets the setup cost. Conclusion: availability (the requirement the outage breached) is bought with redundancy; accessibility is bought with the cloud; both are justified by the college\u2019s 24/7 mandate.',
    markingNotesMd: 'Levels-marked. Band 4 needs: requirements decomposed from the scenario, infrastructure knowledge (redundancy, virtualisation, cloud benefits), application of each technology to the college, and a **justified** recommendation with a balanced conclusion (costs AND benefits). QWC separately marks terminology and structure.',
    aoSplit: [{ ao: 'AO1', marks: 4 }, { ao: 'AO2', marks: 4 }, { ao: 'AO3', marks: 4 }], specRefs: 'Unit 7 (networks, cloud/virtual computing) — extended-response synthesis',
    keywords: undefined, minPoints: undefined,
  }),
  q({
    id: 'tlq:tl-paperA:q17', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q17',
    questionMd: 'You are troubleshooting a problem.\n\nState **one** advantage and **one** disadvantage of using user forums as a source of information to help you.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO1 = 2 marks**\n\nAward one mark for each correct and relevant advantage and disadvantage, to a maximum of two marks. For example:\n\n- user forums are an excellent source of information when troubleshooting, as it is common that others have had and have rectified the same issue **(1)**\n- a disadvantage of user forums is that not all information can be guaranteed as accurate **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**Advantage:** others have often hit and fixed the same fault, so a tested resolution may already be posted.\n\n**Disadvantage:** accuracy is not guaranteed — anyone can post, so advice must be verified before it is applied.',
    markingNotesMd: 'AO1 recall, one mark each side. Both halves required for both marks.',
    aoSplit: [{ ao: 'AO1', marks: 2 }], specRefs: 'Unit 2 (support tools and information sources)',
    keywords: [
      { required: true, phrase: 'same issue', synonyms: ['same issue', 'others have', 'already', 'rectified', 'fixed', 'resolved'] },
      { required: true, phrase: 'accurate', synonyms: ['accuracy', 'not guaranteed', 'unreliable', 'verified'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q18', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q18',
    questionMd: 'Describe **two** ways in which ineffective project planning can lead to rising costs.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO1 = 2 marks**\n\nAward one mark for each description of how ineffective project planning can lead to rising costs, up to a maximum of two marks. For example:\n\n- a project that has ineffective planning is likely to have rising costs, as the estimates made for resources used within the project will not accurately reflect those incurred **(1)**\n- ineffective planning may lead to rising costs as the project is likely to go on longer than anticipated, therefore leading to higher costs **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. Resource estimates made during poor planning won\u2019t match the resources actually consumed, so the project overspends against its budget.\n2. Unplanned projects overrun — a longer timeline means more staff hours, and so higher total cost.',
    markingNotesMd: 'AO1 — the *mechanism* to rising cost must be present (estimate mismatch / overrun), not just "bad planning costs money".',
    aoSplit: [{ ao: 'AO1', marks: 2 }], specRefs: 'Unit 1 (project planning)',
    keywords: [
      { required: true, phrase: 'estimates', synonyms: ['estimate', 'budget', 'resources'] },
      { required: true, phrase: 'longer', synonyms: ['overrun', 'longer than anticipated', 'delay', 'time'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q19', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q19',
    questionMd: 'A bank has received a number of complaints from customers about the time it takes to get help online. The bank thinks this is mainly due to a staff shortage and is considering using artificial intelligence (AI) to solve the problem.\n\nDefine AI and describe the purpose of AI.\n\nExplain **two** ways AI could be used to improve customer experience with the bank.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO1 = 2 marks · AO2 = 2 marks**\n\nAO1 — one mark for defining AI, one for describing its purpose:\n\n- AI is the simulation of human intelligence in digital machines with the aim of mimicking their behaviours and actions **(1)**. The purpose of AI is to learn and solve problems without the intervention of humans, providing accurate decision making without the need for human involvement **(1)**.\n\nAO2 — one mark for each contextualised explanation of a use in the bank:\n\n- AI-powered systems could provide assistance that would previously have required a human; online help can be provided by AI — if a customer needs opening times or directions to the nearest branch, AI can answer immediately, reducing the time it takes to get an answer **(1)**\n- automated processes can handle follow-up appointments: AI with access to the advisor calendar can make appointments without human involvement, reducing the time a customer waits **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**Definition and purpose (AO1).** AI is the simulation of human intelligence by digital machines, mimicking human behaviours and actions. Its purpose is to learn and solve problems without human intervention, delivering accurate decisions at machine speed.\n\n**Uses in the bank (AO2).** An AI assistant can answer routine queries online instantly — opening times, branch directions — cutting the wait that generated the complaints. AI can also automate follow-up appointment booking by reading advisor calendars directly, removing the human bottleneck entirely.',
    markingNotesMd: 'Two-part structure again: AO1 definition+purpose, AO2 uses *in the bank* (contextualised). Generic "AI is used in chatbots" without the bank\u2019s complaint-context is half-developed.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO2', marks: 2 }], specRefs: 'Unit 3 (emerging issues/issues — emerging technologies)',
    keywords: [
      { required: true, phrase: 'simulation', synonyms: ['simulate', 'mimic', 'mimicking', 'imitat'] },
      { required: true, phrase: 'human', synonyms: ['without human', 'no human', 'human intervention', 'without the need of humans'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q20', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q20',
    questionMd: 'John has limited mobility.\n\nJustify how each of the following emerging technologies could be used to support John\u2019s health needs:\n\n- internet of things\n- virtual reality.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO2 = 4 marks**\n\nAward up to two marks for each justification, up to a maximum of four marks. Each justification should include how the emerging technology can be used **(1)** and reason(s) why it would support John\u2019s needs **(1)**:\n\n- internet of things can have a positive impact on health, as many smart devices now carry out household tasks for patients, such as turning on lights or central heating with voice control **(1)**; this can lead to John being able to retain some independence and live comfortably without risk of injury if his mobility is limited **(1)**\n- virtual reality could have a positive impact on John\u2019s life by allowing him to experience places he can no longer visit due to health or mobility issues **(1)**; it can also improve communication with friends and family, which can alleviate loneliness **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**IoT.** Smart-home devices respond to voice control — lights, heating, locks — so John operates his home without moving to a switch. This preserves his independence and removes the injury risk of struggling with physical controls.\n\n**VR.** A headset lets John experience places his mobility limits him from visiting, and shared virtual spaces keep him in regular contact with friends and family, easing the isolation that limited mobility often brings.',
    markingNotesMd: 'AO2 justification = use **(1)** + why it supports *John specifically* **(1)**, per technology. The word "John" (or his mobility) must appear in the reason for the second mark.',
    aoSplit: [{ ao: 'AO2', marks: 4 }], specRefs: 'Unit 3 (emerging issues — emerging technologies)',
    keywords: [
      { required: true, phrase: 'voice', synonyms: ['voice control', 'smart device', 'smart home', 'hands-free'] },
      { required: true, phrase: 'independen', synonyms: ['independence', 'independently'] },
      { required: true, phrase: 'experience', synonyms: ['experience places', 'visit', 'immersive'] },
      { required: true, phrase: 'lonely', synonyms: ['loneliness', 'isolat', 'friends and family', 'communication'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q21', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q21',
    questionMd: 'You are a project manager. You have been asked to develop a new app for mobile devices that will allow users to search for events and pay for tickets. The project owner wants the app to be ready for launch in 8 weeks. He wants customers to be able to use the app to book tickets for a nationwide series of events.\n\nExplain how each of the following factors may impact on planning the development for this project:\n\n- people and skills\n- deadlines.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO2 = 4 marks**\n\nAward two marks for each explanation of how the factor may impact planning, up to a maximum of four marks. Each explanation should include the reason(s) why the factor may have an impact **(1)** and why this is important in this context **(1)**:\n\n**People and skills:**\n\n- it is crucial that the right people with the necessary skills are available to work on the project to ensure it can be delivered on time and effectively **(1)**; this is important as the project has an 8-week deadline and is time-critical, without the time to train new staff **(1)**\n- if these people are not in place then they must be sourced quickly through hiring contractors, which is likely to increase the project\u2019s expenses **(1)**, which could be problematic for the continuation of the project because it is a new project **(1)**.\n\n**Deadlines:**\n\n- deadlines lead to issues with project quality, as the planning stage may not be as thorough as it could be with a larger deadline, leading to issues later in development **(1)**; this is important as tickets are being sold nationwide through the app, potentially affecting a large number of customers **(1)**\n- the deadline is very tight, meaning the planning of the project must be done extremely quickly **(1)** to allow as much time as possible for development of the app **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**People and skills.** The right, already-skilled people must be available from day one: with an 8-week launch there is no time to train anyone. If skills are missing, contractors fill the gap fast — but at higher cost, which is risky for a brand-new project\u2019s budget.\n\n**Deadlines.** A hard 8-week deadline squeezes the planning stage, and thin planning surfaces later as defects and rework — dangerous when the app takes nationwide ticket payments. Planning must therefore be done immediately and efficiently, so the maximum possible time remains for development.',
    markingNotesMd: 'AO2 2+2: impact **(1)** + why it matters *in this context* **(1)**. "In this context" = the 8 weeks, the nationwide payments, the new project — generic project-management answers earn the first mark only.',
    aoSplit: [{ ao: 'AO2', marks: 4 }], specRefs: 'Unit 1 (project planning)',
    keywords: [
      { required: true, phrase: '8 week', synonyms: ['8-week', 'eight week', 'deadline'] },
      { required: true, phrase: 'contractor', synonyms: ['contractors', 'hiring', 'hire'] },
      { required: true, phrase: 'quality', synonyms: ['quality', 'thorough', 'issues later'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperA:q22', topicId: 'tl:paperA', questionRef: 'Specimen Paper A Q22',
    questionMd: 'A small company has started a complex project for the first time. They will need to liaise with a wide range of stakeholders and complete a number of different tasks, which will involve a large number of their staff.\n\nA member of staff has suggested that the business use a critical path analysis tool to manage the project.\n\nEvaluate to what extent you think this approach to the project will be effective.\n\n**[6 marks]**',
    marks: 6,
    markSchemeMd: '**AO3 = 6 marks**\n\nAward up to six marks for a comprehensive and well-reasoned evaluation of critical path analysis as a management tool in project planning: one mark for each relevant and well-justified point.\n\n**Indicative content:**\n\n- CPA enables project staff to clearly see what has been completed, what is being completed and what is still to complete; it shows how tasks link, which makes it valuable to a company running a project with a number of different tasks **(1)**. CPA identifies which activities are vital for project completion, so time is not spent on activities that do not contribute to success — helping where resources are limited, as in a small company, and focusing on completion **(1)**.\n- CPA allows managers to analyse planned progress against actual progress on the critical path, identifying underperforming tasks and redirecting assets, keeping stakeholders informed **(1)**.\n- CPA does not assist with scheduling members of staff, and because the project requires a large number of human resources this could not be controlled by CPA **(1)**.\n- It is difficult for CPA to adapt to unexpected events or problems, which the company may encounter completing a project of this type for the first time **(1)**.\n- CPA should not be considered due to the time and complexity of developing the diagram plan — a huge drawback for a small company without the time and staff to allocate to the task **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**For.** CPA gives visibility of every task\u2019s status — done, running, pending — and shows how they link, exactly what a first-time complex project needs. It identifies the vital activities, so a small company\u2019s limited resources concentrate on what determines completion rather than spreading effort evenly. Managers can compare planned vs actual progress on the critical path and redirect resources, keeping the wide stakeholder group informed with evidence.\n\n**Against.** CPA says nothing about *people*: with a large staff to coordinate, separate resource scheduling is still needed. It also struggles to absorb the unexpected — and a company running this kind of project for the first time should expect surprises. Finally, building and maintaining the network diagram itself takes time and skill the small company may not have.\n\n**Judgement.** CPA is effective **to a limited extent**: adopt it as the progress-tracking backbone for task dependencies and completion focus, but pair it with resource scheduling and regular re-planning to cover its blind spots — staffing and change.',
    markingNotesMd: 'AO3 — "evaluate to what extent" demands both sides AND a supported conclusion naming the extent. All-for or all-against answers cap below full marks; the judgement sentence is where the sixth mark usually lives.',
    aoSplit: [{ ao: 'AO3', marks: 6 }], specRefs: 'Unit 1 (project planning — critical path analysis)',
    keywords: [
      { required: true, phrase: 'critical', synonyms: ['critical path', 'critical activities', 'vital'] },
      { required: true, phrase: 'staff', synonyms: ['staff', 'human resources', 'people', 'scheduling'] },
      { required: true, phrase: 'unexpected', synonyms: ['unexpected', 'adapt', 'change', 'first time'] },
    ], minPoints: 3,
  }),
];

// ── Paper B — Sections A–D ──────────────────────────────────────────────────

const paperBQuestions: QuestionSpec[] = [
  q({
    id: 'tlq:tl-paperB:q1', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q1',
    questionMd: 'Describe **one** way organisations can use instant messaging (IM) applications to improve external communication.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO1 = 2 marks**\n\nAward up to two marks for an accurate and relevant description of the use of the application **(1)** and an accurate and relevant description of application features that improve external communication **(1)**, for example:\n\n- IM provides customers with a way of directly communicating with a business **(1)** to make specific enquiries without the need to visit their location or telephone them **(1)**\n- IM provides a way that customers can complain to the business **(1)** which can then be immediately addressed and resolved **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: 'IM gives customers a direct channel to the business **(1)**: they can make specific enquiries without visiting or phoning, and complaints can be picked up and resolved immediately by the right team **(1)**.',
    markingNotesMd: 'AO1 — the use (1) + the feature/mechanism that improves the external communication (1).',
    aoSplit: [{ ao: 'AO1', marks: 2 }], specRefs: 'Unit 2 (communication tools)',
    keywords: [
      { required: true, phrase: 'customer', synonyms: ['customers', 'client'] },
      { required: true, phrase: 'direct', synonyms: ['directly', 'enquir', 'complain', 'without'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q2', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q2',
    questionMd: 'Describe **two** reasons why it is important for a digital support professional to maintain an asset register.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO1 = 2 marks**\n\nAward up to two marks for a description of why it is important to maintain an asset register, for example:\n\n- allows the professional to track the current condition of a digital asset, showing the potential remaining life span of the asset **(1)**\n- allows the professional to track maintenance of assets and plan future maintenance requirements **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. The register tracks each asset\u2019s current condition, so remaining useful life can be predicted and replacements budgeted before failure.\n2. It records maintenance history, letting the professional plan future maintenance instead of reacting to breakdowns.',
    markingNotesMd: 'AO1 — both reasons must describe the *importance* (what the register enables), not just define it.',
    aoSplit: [{ ao: 'AO1', marks: 2 }], specRefs: 'Unit 2 (asset management)',
    keywords: [
      { required: true, phrase: 'condition', synonyms: ['condition', 'life span', 'lifespan', 'state'] },
      { required: true, phrase: 'maintenance', synonyms: ['maintenance', 'servic', 'repair'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q3', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q3',
    questionMd: 'Describe **three** routes that an individual may take if they want to become a digital support worker.\n\n**[3 marks]**',
    marks: 3,
    markSchemeMd: '**AO1 = 3 marks**\n\nAward one mark for describing each route, up to a maximum of three marks, for example:\n\n- an apprenticeship allows someone to gain experience while being paid to work in a specific job role **(1)**\n- professional qualifications allow a student to show they have a level of competency within a specific product or framework **(1)**\n- higher education and degree routes may allow students to gain more in-depth knowledge of digital support topics, and perhaps specialise in specific areas **(1)**\n- professional recognition constitutes internal progression within an organisation through continued employment **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Apprenticeship** — earn while working in the role, gaining experience alongside structured training.\n2. **Professional qualifications** — vendor/framework certifications demonstrating competency with specific products.\n3. **Higher education / degrees** — deeper knowledge of digital support topics, with the option to specialise.',
    markingNotesMd: 'AO1 — one per route, each described (what it is + what it gives). Three bare names ("uni, apprenticeship, certs") score zero without the description.',
    aoSplit: [{ ao: 'AO1', marks: 3 }], specRefs: 'Unit 3 (routes into the sector)',
    keywords: [
      { required: true, phrase: 'apprenticeship', synonyms: ['apprentice'] },
      { required: true, phrase: 'qualification', synonyms: ['certification', 'certif', 'vendor'] },
      { required: true, phrase: 'degree', synonyms: ['higher education', 'university', 'degree'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q4', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q4',
    questionMd: 'Users of a networked colour printer have reported that it is not working for the third time in two weeks.\n\nA support technician has completed all routine checks and troubleshooting steps recommended by the manual. The printer is still not working.\n\nSelect an appropriate **root cause analysis** approach and describe how this could be used to solve the printer problem.\n\n**[3 marks]**',
    marks: 3,
    markSchemeMd: '**AO2 = 3 marks**\n\nAward one mark for selecting an appropriate root cause analysis approach, and up to a further two marks for the description of how this could be used, for example:\n\n- the 5 \u2018whys\u2019 **(1)** can be used to ask questions about the particular fault with the printer **(1)** in order to progress through the fault analysis to identify the root cause **(1)**\n- fishbone diagram **(1)**, group possible causes into categories such as power, or toner and ink **(1)**; once causes have been categorised, potential solutions can be applied to each category **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: 'Use the **5 Whys** **(1)**: repeatedly ask "why is this happening?" of each answer — why does it fail? (queue error) → why the queue error? (driver crash) → why the crash? (incompatible driver version) — progressing through the layers of the fault **(1)** until the underlying cause, not another symptom, is identified and fixed **(1)**. (A fishbone diagram works equally well: group candidate causes — power, toner/ink, network, driver — then test and eliminate category by category.)',
    markingNotesMd: 'AO2 — 1 for naming a *recognised* RCA approach (5 Whys, fishbone/Ishikawa), 2 for applying it to THIS printer (routine checks already done — the approach must go deeper than the manual).',
    aoSplit: [{ ao: 'AO2', marks: 3 }], specRefs: 'Unit 2 (fault diagnosis — root cause analysis)',
    keywords: [
      { required: true, phrase: '5 whys', synonyms: ['five whys', '5 why', 'fishbone', 'ishikawa'] },
      { required: true, phrase: 'root', synonyms: ['root cause', 'underlying'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q5', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q5',
    questionMd: 'A support desk manager has been reviewing customer feedback. The manager has noticed that many customers feel the agents answering their call do not listen to their problems fully.\n\nThe manager has now arranged training for the agents on active listening.\n\nDiscuss **three** ways that active listening could benefit the business.\n\n**[3 marks]**',
    marks: 3,
    markSchemeMd: '**AO3 = 3 marks**\n\nAward one mark for each benefit described/discussed that is relevant to the business, up to a maximum of three marks, for example:\n\n- this will improve resolution of customer queries, as the agents will confirm understanding by paraphrasing back the customer\u2019s request and so can be sure they are taking the correct action to resolve the request **(1)**\n- by ensuring that the support desk agents adopt active listening, the business will receive useful insight that could support resolution of queries first time, as they may find the root of the issue is different from the one the customer is communicating, and they are able to find and resolve other problems **(1)**\n- active listening will build trust and respect with the customers; it will demonstrate that the business values them and wants to provide the best possible service, which will then be communicated through word of mouth and promote the business\u2019s reputation **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Better first-time resolution** — agents paraphrase the request back, confirming understanding before acting, so the correct fix is applied first time.\n2. **Deeper insight** — listening properly can reveal the *actual* problem differs from the reported one, surfacing and resolving issues the customer never articulated.\n3. **Trust and reputation** — customers who feel heard believe the business values them, and that impression spreads by word of mouth, promoting the business.',
    markingNotesMd: 'AO3 — discussion means the benefit developed to its business consequence; three benefits named without development = 0.',
    aoSplit: [{ ao: 'AO3', marks: 3 }], specRefs: 'Unit 2 (customer service skills)',
    keywords: [
      { required: true, phrase: 'paraphras', synonyms: ['paraphrasing', 'confirm understanding', 'confirming'] },
      { required: true, phrase: 'first time', synonyms: ['first time', 'first-time'] },
      { required: true, phrase: 'trust', synonyms: ['trust', 'respect', 'reputation', 'word of mouth'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q6', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q6',
    questionMd: 'A consultant has created an infographic to be distributed to local schools.\n\n*(The infographic itself is reproduced in the specimen question paper — see "Real papers & mark schemes" → Paper B QP, Question 6.)*\n\nDiscuss why the infographic would be effective in helping children to stay safe online.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO3 = 4 marks**\n\nAward up to four marks for a reasoned discussion of why the infographic will help ensure the intended audience stay safe online, one mark for each evaluative point, for example:\n\n- the infographic is very visual, easy to read and has a clear message that can be understood by its audience — parents of children in the school **(1)**\n- the language used adopts an informal tone and structure which are both appealing and appropriate for the target audience **(1)**\n- the information provided is effective as the seven tips are good advice that mirror guidance from organisations such as the NCSC **(1)**\n- the presentation is straight to the point and provides memorable images that will ensure the information is retained by those who view the infographic **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Visual, clear, audience-sized** — the message is readable at a glance, which suits both children and the parents who mediate their safety.\n2. **Appropriate tone** — informal language and structure appeal to the target audience rather than lecturing them.\n3. **Sound content** — the seven tips mirror authoritative guidance (e.g. NCSC), so the advice is actually correct, not just memorable.\n4. **Retention** — striking images and a to-the-point layout make the advice stick, which is what changes behaviour.',
    markingNotesMd: 'AO3 — evaluation of *why the format works for THIS audience*: design, tone, content quality, memorability. Four distinct evaluative points, each developed.',
    aoSplit: [{ ao: 'AO3', marks: 4 }], specRefs: 'Unit 2 (communication; online safety)',
    keywords: [
      { required: true, phrase: 'visual', synonyms: ['visual', 'image', 'picture', 'read'] },
      { required: true, phrase: 'audience', synonyms: ['audience', 'children', 'parents', 'target'] },
      { required: true, phrase: 'remember', synonyms: ['memorable', 'retained', 'retention', 'remember'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q7', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q7',
    questionMd: 'A helpdesk has received the following message from a customer:\n\n> "A few minutes after logging into my computer, it starts running really slow. Lots of windows keep opening even though I am not opening any new programs up. Could you help me please?"\n\nThe helpdesk has decided to use screen share to resolve the situation.\n\nExplain **four** reasons why using screen share would be effective.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO2 = 4 marks**\n\nAward one mark for each reason why the screen share would be effective, up to a maximum of four marks, for example:\n\n- screen share will be effective because the helpdesk will be able to see what is actually meant by the user\u2019s statement of \u2018lots of windows\u2019 **(1)**\n- the helpdesk will be able to explore the device and try to understand what could be causing multiple \u2018windows\u2019 to open or slowness, without going backwards and forwards with written responses or explaining steps on a phone call **(1)**\n- screen share will allow the helpdesk to gauge how slow the machine is running without relying on the customer\u2019s interpretation **(1)**\n- the helpdesk could observe the user interacting with the machine to identify if user error is causing the problems **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. The vague symptom "lots of windows" becomes observable — the technician sees exactly what the customer means.\n2. Direct exploration of the device replaces the slow loop of written instructions and phone call guesswork.\n3. Actual performance can be measured first-hand rather than trusting the customer\u2019s "really slow".\n4. Watching the user work can reveal user error — the true cause — which the customer would not report as a fault.',
    markingNotesMd: 'AO2 — each reason must explain the *effectiveness* (what screen share enables that the phone/written channel cannot) in this infection-suspect scenario.',
    aoSplit: [{ ao: 'AO2', marks: 4 }], specRefs: 'Unit 2 (remote support tools)',
    keywords: [
      { required: true, phrase: 'see', synonyms: ['see', 'observe', 'witness', 'view'] },
      { required: true, phrase: 'without', synonyms: ['without', 'instead of', 'rather than', 'no need'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q8', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q8',
    questionMd: 'A technical support company noticed that some of their customers had started to use rival services. The company surveyed past customers to find out why. The most common reasons were \u2018slow response times to incidents\u2019 and \u2018poor security standards\u2019.\n\nThe company is considering the use of monitoring tools as a possible solution for this.\n\nDescribe each of the following system monitoring tools:\n\n- system alarms\n- logs.\n\nExplain how each of these tools could be used to improve the performance of the support company.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO1 = 2 marks · AO2 = 2 marks**\n\nOne AO1 mark for a correct description of each monitoring tool, up to two; one AO2 mark for a correct explanation of how each improves the support company\u2019s performance, up to two. For example:\n\n- system alarms allow thresholds to be configured that trigger an alert to the administrator when a threshold is met, making them aware of a problem instantly **(1 AO1)**; this ensures that if a system goes down or sustains an error there will be a quicker response to incidents **(1 AO2)**\n- logs allow events around a specific application, system or service to be recorded and evaluated at a later date, such as when a security issue occurs **(1 AO1)**; review the logs around prior security issues to identify past instances where security standards have not been met and identify ways to resolve these **(1 AO2)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**System alarms** — configurable thresholds that fire an alert to the administrator the moment a threshold is breached **(AO1)**. *Performance:* incidents are responded to faster — directly attacking the "slow response times" complaint **(AO2)**.\n\n**Logs** — a record of events for an application, system or service, evaluable after the fact (e.g. after a security issue) **(AO1)**. *Performance:* reviewing logs around past security failures exposes where standards lapsed, so fixes close the "poor security standards" gap **(AO2)**.',
    markingNotesMd: 'AO1 description + AO2 improvement, per tool. The improvement must answer the survey findings (slow responses, poor security) — that is the contextualisation.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO2', marks: 2 }], specRefs: 'Unit 2 (monitoring tools)',
    keywords: [
      { required: true, phrase: 'threshold', synonyms: ['threshold', 'alert', 'alarm'] },
      { required: true, phrase: 'record', synonyms: ['record', 'log', 'stored', 'history'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q9', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q9',
    questionMd: 'Identify **two** project management methods that can be used to manage digital projects.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO1 = 2 marks**\n\nAward one mark for identifying each correct project management method used in digital projects, up to a maximum of two marks, for example:\n\n- agile **(1)** · waterfall **(1)** · spiral **(1)** · rapid application development (RAD) **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**Agile** — iterative, increment-based delivery. **Waterfall** — sequential phases, each completing before the next begins. (Also accepted: spiral, RAD.)',
    markingNotesMd: 'AO1 recall — any two named methods. Identification only; no description required for the marks.',
    aoSplit: [{ ao: 'AO1', marks: 2 }], specRefs: 'Unit 1 (project management methods)',
    keywords: [
      { required: true, phrase: 'agile', synonyms: ['agile'] },
      { required: true, phrase: 'waterfall', synonyms: ['waterfall', 'spiral', 'rapid application development', 'rad'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q10', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q10',
    questionMd: 'A car manufacturer is launching a new model. They plan to brief staff on the specification, price and projected sales of the new model at a training conference.\n\nDescribe **two** digital tools or methods that could be used to support this communication.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO2 = 2 marks**\n\nAward one mark for each description of how a digital tool or method could support the communication, up to a maximum of two marks, for example:\n\n- presentation software could be used to present the new model details in a planned order **(1)**\n- digital infographics such as posters and leaflets could summarise key features and benefits of the new model in a readable form **(1)**\n- graphs could show projected sales or market comparisons **(1)**\n- dashboards could show competitor analysis and business intelligence **(1)**\n- video could be used to demonstrate the new model **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Presentation software** sequences the launch content — spec, price, projections — in a planned, followable order for the conference audience.\n2. **Graphs/charts** make the projected sales figures and market comparisons visible at a glance, so staff grasp the numbers behind the briefing.',
    markingNotesMd: 'AO2 — describe the tool *doing the supporting job*, not just name it.',
    aoSplit: [{ ao: 'AO2', marks: 2 }], specRefs: 'Unit 2 (communication tools)',
    keywords: [
      { required: true, phrase: 'presentation', synonyms: ['presentation', 'slides', 'powerpoint'] },
      { required: true, phrase: 'graph', synonyms: ['graph', 'chart', 'dashboard', 'infographic', 'video'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q11', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q11',
    questionMd: 'A haulage firm is based in the North West of England. They are looking to increase their share of the UK market and have started a nationwide marketing campaign to attract new visitors to their website.\n\nBelow are the statistics of the marketing campaign:\n\n| Region | Visitors | Bounce Rate (%) |\n| --- | ---: | ---: |\n| North East | 122 | 60% |\n| North West | 250 | 87% |\n| Midlands | 34 | 80% |\n| London | 546 | 67% |\n| South West | 120 | 84% |\n| South East | 211 | 56% |\n| Scotland | 87 | 86% |\n| Wales | 17 | 91% |\n\nExplain **one** way in which the haulage company can use the statistics to target new customers.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO2 = 2 marks**\n\nAward up to two marks for a contextualised explanation. The explanation should include what is indicated by particular statistics **(1)** and how this can be used / what action can be taken to target new customers **(1)**, for example:\n\n- the company can target the areas that attracted the most visitors to the website **(1)** such as London, the North West and South East **(1)**\n- areas that had a low bounce rate show that the interest of the visitor is likely to be genuine, as they have visited at least two pages on the website **(1)**; areas with low bounce rate such as the South East and North East should be targeted with more specific ad campaigns **(1)**.',
    modelAnswerMd: 'The **visitor counts** show where attention already exists **(1)** — London (546), the North West (250) and the South East (211) — so ad spend and campaign effort should concentrate there to convert existing interest into customers **(1)**. Equally, the **bounce rates** separate genuine interest: the South East (56%) and North East (60%) visitors browse more than one page, so campaigns in those low-bounce regions reach people actually engaging with the site.',
    markingNotesMd: 'AO2 — statistic interpreted **(1)** + targeting action taken from it **(1)**. Quoting numbers with no action is half the answer.',
    aoSplit: [{ ao: 'AO2', marks: 2 }], specRefs: 'Unit 2 (digital analysis of campaign data)',
    keywords: [
      { required: true, phrase: 'visitors', synonyms: ['visitor', 'most visitors', 'traffic'] },
      { required: true, phrase: 'bounce', synonyms: ['bounce rate', 'bouncing'] },
      { required: true, phrase: 'target', synonyms: ['target', 'campaign', 'ad', 'advert', 'focus'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q12', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q12',
    questionMd: 'Figure 1 shows an extract from a tier 1 technician\u2019s support request log. You can see that a lot of calls to the helpdesk are about a recent operating system update.\n\nDescribe the possible benefits to the helpdesk of using a root cause analysis.\n\n**[3 marks]**',
    marks: 3,
    markSchemeMd: '**AO3 = 3 marks**\n\nAward up to three marks for describing the potential benefits of doing a root cause analysis on the helpdesk; one mark for each potential benefit described that is relevant to this situation, for example:\n\n- root cause analysis allows the organisation to pinpoint the exact source of the problem, meaning that a fix can be applied **(1)**\n- in this instance there is clearly an issue with the operating system update which, if managed centrally, could be resolved before user experience issues occur **(1)**\n- this would therefore reduce the number of calls to the helpdesk on this issue **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. RCA pinpoints the exact source of the problem, so the fix addresses the cause rather than its symptoms.\n2. Here the pattern points at the OS update — if that is fixed centrally, the problem is solved before users experience it.\n3. Fewer repeat calls about the same fault, freeing the helpdesk\u2019s capacity.',
    markingNotesMd: 'AO3 — benefits *of RCA in this log-evidence situation*: cause found → centrally fixed → call volume falls. That causal chain is the full answer.',
    aoSplit: [{ ao: 'AO3', marks: 3 }], specRefs: 'Unit 2 (fault diagnosis — root cause analysis)',
    keywords: [
      { required: true, phrase: 'source', synonyms: ['source', 'exact', 'pinpoint', 'root', 'cause'] },
      { required: true, phrase: 'centrally', synonyms: ['centrally', 'central', 'before user', 'proactively', 'update'] },
      { required: true, phrase: 'fewer calls', synonyms: ['reduce the number of calls', 'fewer calls', 'less calls', 'call volume'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q13', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q13',
    questionMd: 'A new app has been designed.\n\nDescribe **three** recognised methods of testing this app that can lead to a successful launch.\n\n**[3 marks]**',
    marks: 3,
    markSchemeMd: '**AO1 = 3 marks**\n\nAward one mark for each correct type of system testing described, up to a maximum of three marks, for example:\n\n- stress testing — a method of testing whether a system can function with expected demand by replicating real-world load **(1)**\n- black box testing — a method of software testing that doesn\u2019t have an expected outcome **(1)**\n- white box testing — a method of software testing based on knowing the expected outcome **(1)**\n- usability or audience testing — testing completed by users to ensure it meets their requirements **(1)**. Either terminology is acceptable.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Stress testing** — replicate real-world load to confirm the app functions under expected demand.\n2. **Black box testing** — test without predefined outcomes, probing behaviour from the user\u2019s perspective.\n3. **White box testing** — test against known expected outcomes, verifying internal logic. (Usability/audience testing — users confirm the app meets their requirements — also earns the mark.)',
    markingNotesMd: 'AO1 — recognised method **named** + **described**. Names alone score zero.',
    aoSplit: [{ ao: 'AO1', marks: 3 }], specRefs: 'Unit 2 (software testing)',
    keywords: [
      { required: true, phrase: 'stress', synonyms: ['stress test'] },
      { required: true, phrase: 'black box', synonyms: ['black box', 'black-box'] },
      { required: true, phrase: 'white box', synonyms: ['white box', 'white-box', 'usability', 'audience testing'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q14', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q14',
    questionMd: 'A theme park has introduced a new interactive app. This app allows visitors to access additional information and educational videos as they walk around the park. The visitor numbers were extremely high in the week that the app was released.\n\nMany visitors gave feedback to say they were unhappy that at peak times the application crashed several times and performance was sluggish.\n\nExplain **two** ways in which stress testing could have improved the performance of the application when it was released.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO2 = 4 marks**\n\nAward two marks for each explanation up to a maximum of four marks. Each explanation should include what performance element is tested **(1)** and why the results could have helped improve performance before release **(1)**, for example:\n\n- using stress testing, the developers could have tested with the maximum expected concurrent users the park would expect at its busiest times **(1)**; this would have allowed the theme park to see how the app performs under the peak load expected during the busiest times, such as launch day when the park is at capacity **(1)**\n- the developers could have used stress testing to see how the app handles a large spike in active users, for example when a new ride is introduced **(1)**; this would ensure the app performs well when users begin to use it at the start of the day or just after popular lunch times **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Peak concurrent load** — simulate the park-at-capacity user count before launch **(1)**; the crashes at peak times would have been reproduced in testing and the bottlenecks fixed pre-release **(1)**.\n2. **Spike handling** — stress sudden surges (day start, post-lunch, new-ride openings) **(1)**; observing how the app degrades under spikes lets developers add capacity or queueing so performance stays smooth during the real events **(1)**.',
    markingNotesMd: 'AO2 2+2: what is tested **(1)** + how the pre-release result would have improved the launch **(1)**. "Stress testing finds bugs" without the load mechanism earns little.',
    aoSplit: [{ ao: 'AO2', marks: 4 }], specRefs: 'Unit 2 (software testing — stress testing)',
    keywords: [
      { required: true, phrase: 'concurrent', synonyms: ['concurrent', 'peak', 'maximum expected', 'spike'] },
      { required: true, phrase: 'before release', synonyms: ['before release', 'before launch', 'pre-release', 'prior to'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q15', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q15',
    questionMd: 'A business has recently completed a company-wide survey on staff efficiency and wellbeing. The business has six sites spread across the UK and several workers who are home-based.\n\nFeedback from the survey suggested that communication within the business was ineffective and that staff felt they lacked access to organisational news and updates. Home-based workers complained they sometimes felt isolated.\n\na) Discuss **three** ways that digital collaborative communication tools could tackle the staff concerns and improve their efficiency and wellbeing.\n\nb) Describe **two** possible digital collaborative communication tools or technologies that the business could use.\n\n**[5 marks]**',
    marks: 5,
    markSchemeMd: '**AO3 = 3 marks (part a) · AO2 = 2 marks (part b)**\n\na) Up to three AO3 marks for the discussion of how digital collaborative communication tools could tackle the staff concerns in context, for example:\n\n- the impact would be a possible increase in communication, as digital collaborative tools immediately remove a barrier identified in the survey **(1)**\n- improved communication ensures staff know more about the wider business and how their work links to it, giving them a sense of pride that their work is important to the overall business **(1)**\n- however, staff may feel information overload, so important information gets lost; staff may disengage from communications that are too frequent or of little relevance to them and their role **(1)**.\n\nb) One AO2 mark for each description of a possible tool/technology:\n\n- use of the chat function within online software platforms to replace communication lost through not being in the same location **(1)**\n- video conferencing software that all staff can access regardless of working location, supporting home-based workers to feel less isolated **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**a)**\n1. Digital tools remove the identified barrier directly — communication flows again across six sites and home.\n2. Staff see organisational news and how their work connects to it, building engagement and pride — a wellbeing gain, not just an efficiency one.\n3. A balanced discussion must flag the counter-effect: too many channels overload staff, burying important updates and causing disengagement — governance (what goes where) matters as much as the tooling.\n\n**b)**\n1. **Chat within online platforms** — replaces the corridor conversation that location removed.\n2. **Video conferencing** — everyone joins on equal terms regardless of site or home working, which is precisely the isolation fix the survey asked for.',
    markingNotesMd: 'Two-part structure: a) AO3 discussion (including a counterpoint — that third mark is usually the balanced one), b) AO2 descriptions. Mixing the parts loses the split marks.',
    aoSplit: [{ ao: 'AO3', marks: 3 }, { ao: 'AO2', marks: 2 }], specRefs: 'Unit 2 (collaborative communication tools)',
    keywords: [
      { required: true, phrase: 'barrier', synonyms: ['barrier', 'remove', 'isolat', 'location'] },
      { required: true, phrase: 'overload', synonyms: ['overload', 'too much', 'disengage', 'lost'] },
      { required: true, phrase: 'chat', synonyms: ['chat', 'messaging'] },
      { required: true, phrase: 'video conferencing', synonyms: ['video conferencing', 'video call'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q16', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q16',
    questionMd: 'State **one** industry standard that must be considered when processing card payments.\n\n**[1 mark]**',
    marks: 1,
    markSchemeMd: '**AO1 = 1 mark**\n\nAward one mark for a correctly identified payment industry standard, for example:\n\n- PCI DSS (Payment Card Industry Data Security Standard) **(1)**.\n\nAccept both the abbreviation and the full name of the standard.',
    modelAnswerMd: '**PCI DSS** — the Payment Card Industry Data Security Standard, which governs how cardholder data is stored, processed and transmitted.',
    markingNotesMd: 'AO1 — name the standard; abbreviation or full name accepted.',
    aoSplit: [{ ao: 'AO1', marks: 1 }], specRefs: 'Unit 8 (security — industry standards)',
    keywords: [{ required: true, phrase: 'pci dss', synonyms: ['pci', 'payment card industry'] }],
    minPoints: 1,
  }),
  q({
    id: 'tlq:tl-paperB:q17', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q17',
    questionMd: 'A small law firm has recently been the subject of a successful external cyber attack, during which sensitive information was stolen and leaked online.\n\nWhat is an \u2018intrusion detection system\u2019?\n\nExplain how this kind of system can be used to defend against further attacks.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO1 = 1 mark · AO2 = 1 mark**\n\nAO1 — one mark for a definition of an intrusion detection system, for example:\n\n- an intrusion detection system monitors a network to identify any malicious activity **(1)**.\n\nAO2 — one mark for explaining how it can defend against future attacks on the firm:\n\n- the intrusion detection system would give early warning of any unauthorised access, allowing the law firm to implement suitable mitigation **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: 'An IDS **monitors network traffic to identify malicious activity** **(AO1)**. After last week\u2019s breach, it provides early warning of unauthorised access attempts — alerts let the firm respond and mitigate before another attack succeeds **(AO2)**.',
    markingNotesMd: 'AO1 definition + AO2 forward-looking defence. One sentence each; the AO2 mark needs the warning→response mechanism.',
    aoSplit: [{ ao: 'AO1', marks: 1 }, { ao: 'AO2', marks: 1 }], specRefs: 'Unit 8 (security — intrusion detection)',
    keywords: [
      { required: true, phrase: 'monitor', synonyms: ['monitor', 'monitors', 'watch', 'inspect'] },
      { required: true, phrase: 'malicious', synonyms: ['malicious', 'unauthorised', 'attack', 'intrusion'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q18', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q18',
    questionMd: 'You have been employed as a security consultant for a firm of accountants. The firm has asked you to investigate the security of their HR system that stores all their employee data. In your investigation, you have found several vulnerabilities within the system.\n\nBelow is an example report that can be generated from the company\u2019s HR database *(reproduced in the specimen question paper)*. An attacker has gained unauthorised access to the confidential data.\n\nDescribe **three** ways in which the attacker could use this data inappropriately.\n\n**[3 marks]**',
    marks: 3,
    markSchemeMd: '**AO2 = 3 marks**\n\nAward one mark for each accurate description of how the data could be used inappropriately, relevant to the situation, up to a maximum of three marks, for example:\n\n- as the system under investigation relates to HR, the data will contain personally identifiable information such as name, date of birth and address; this could be used by an attacker to undertake fraudulent activity under a victim\u2019s identity **(1)**\n- the report provides two contact numbers which could be used to make unsolicited sales calls **(1)**\n- the database contains extremely sensitive information such as reasons for termination, which could be used to cause embarrassment to a former employee or even for the purpose of blackmail **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Identity fraud** — the PII (name, date of birth, address) is exactly the dataset needed to impersonate an employee and open accounts or credit in their name.\n2. **Unsolicited contact / phishing** — the two contact numbers enable targeted scam calls or SMS that exploit the trust of a real employer\u2019s details.\n3. **Blackmail or harassment** — sensitive HR fields such as termination reasons could be used to embarrass or extort former employees.',
    markingNotesMd: 'AO2 — the *use* must be inappropriate and specific to HR data. Generic "they could steal data" is circular and scores zero.',
    aoSplit: [{ ao: 'AO2', marks: 3 }], specRefs: 'Units 4.1.2 (data protection), 8 (security)',
    keywords: [
      { required: true, phrase: 'identity', synonyms: ['identity', 'impersonat', 'fraud'] },
      { required: true, phrase: 'blackmail', synonyms: ['blackmail', 'embarrass', 'extort', 'harass'] },
      { required: true, phrase: 'unsolicited', synonyms: ['unsolicited', 'scam', 'phish', 'sales calls', 'spam'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q19', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q19',
    questionMd: 'A company wants to check that they are complying with the Freedom of Information Act 2000.\n\nThe company has had problems with staff leaving unprofessional notes about customers on the customer management system.\n\nEvaluate how the business could be impacted if a customer requested a copy of their records under the Freedom of Information Act 2000.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO3 = 4 marks**\n\nAward one mark for each impact given as an outcome of the evaluation, up to a maximum of four marks, for example:\n\n- customers that request information held about them would see the unprofessional comments left by employees on their records, which would cause reputational damage to the business **(1)**\n- the customers would see the comments left on the management system, which would likely lead to unhappy customers who would not be willing to deal with the company anymore — a financial impact **(1)**\n- the ability for the business to compete would be impacted because other businesses may not have experienced this damaging release of information; this could lead to existing and potential customers trading with other businesses **(1)**\n- employees would need to be disciplined where instances of unprofessional comments are found to have been made, which might affect the morale of the workforce **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Reputational damage** — the requester sees the unprofessional notes verbatim; that record now exists outside the company\u2019s control.\n2. **Lost custom** — insulted customers take their business elsewhere: a direct financial impact.\n3. **Competitive disadvantage** — rivals without such a disclosure look safer by comparison, pulling both existing and potential customers away.\n4. **Internal fallout** — the authors of the notes face discipline, and morale across the workforce suffers.',
    markingNotesMd: 'AO3 — impacts as *outcomes of the disclosure*, one per mark. The question is about consequences, not about FOI compliance steps.',
    aoSplit: [{ ao: 'AO3', marks: 4 }], specRefs: 'Unit 4 (legislation — Freedom of Information Act 2000)',
    keywords: [
      { required: true, phrase: 'reputation', synonyms: ['reputational', 'reputation', 'brand'] },
      { required: true, phrase: 'customers', synonyms: ['customer', 'unhappy', 'lose', 'leave', 'elsewhere'] },
      { required: true, phrase: 'compet', synonyms: ['competitor', 'competitive', 'other businesses'] },
      { required: true, phrase: 'disciplin', synonyms: ['disciplin', 'morale', 'staff'] },
    ], minPoints: 3,
  }),
  q({
    id: 'tlq:tl-paperB:q20', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q20',
    questionMd: 'A clothing brand has expanded their sales operation. They now have a website so they can sell to customers outside of the local area. The website is heavily promoted through the social channels of their brand influencer.\n\nDescribe the following two IT security threats and explain how each threat could affect the clothing brand:\n\n- distributed denial-of-service (DDoS)\n- spear phishing.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO1 = 2 marks · AO2 = 2 marks**\n\nOne AO1 mark for each accurate description of the threats, up to two:\n\n- a distributed denial-of-service (DDoS) attack is a malicious attempt to render a server unable to provide its intended service, disrupting services a business is attempting to offer **(1)**\n- spear phishing is a targeted attempt to obtain someone\u2019s personal details, such as log-in details, by someone creating a fake communication made to appear as though it is from a company or organisation **(1)**.\n\nOne AO2 mark for explaining the likely impact on the organisation of each threat, up to two:\n\n- a DDoS attack will make the organisation\u2019s website unavailable; customers may not be able to access the service, resulting in lost revenue **(1)**\n- a successful spear phishing attempt would harm the reputation of the organisation, which may make customers shop elsewhere **(1)**; it is common for spear phishing attempts to focus on specific people within a business, such as the well-known influencer who has information about them in the public domain **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**DDoS** — a malicious flood of traffic from many sources that renders a server unable to serve its intended service **(AO1)**. *Impact:* the website goes down during campaigns, so the expanded online sales stall — lost revenue and a bad first impression for the new national audience **(AO2)**.\n\n**Spear phishing** — a *targeted* fake communication, crafted to look like it comes from a trusted company, designed to harvest personal or log-in details **(AO1)**. *Impact:* a successful attempt damages the brand\u2019s reputation and drives customers to competitors; the brand\u2019s high-profile influencer is precisely the kind of publicly documented person spear phishers target **(AO2)**.',
    markingNotesMd: 'AO1 describe + AO2 impact, per threat. "Spear" = targeted — that word (or the mechanism) is what separates it from generic phishing for full AO1 credit.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO2', marks: 2 }], specRefs: 'Units 4.1.3 (threats), 8 (security)',
    keywords: [
      { required: true, phrase: 'server', synonyms: ['server', 'service unavailable', 'unable to provide'] },
      { required: true, phrase: 'targeted', synonyms: ['targeted', 'specific people', 'specific person'] },
      { required: true, phrase: 'revenue', synonyms: ['revenue', 'lost sales', 'lost custom', 'income'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q21', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q21',
    questionMd: 'A gaming retailer specialising in PCs and consoles only sells online and has built an excellent reputation with their customers.\n\nConfidentiality and integrity are two principles of network security.\n\nDescribe each principle.\n\nExplain how each principle applies to this gaming retailer business:\n\n- confidentiality\n- integrity.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO1 = 2 marks · AO2 = 2 marks**\n\nOne AO1 mark for a description of each principle, up to two; one AO2 mark for explaining how each applies to the business in the scenario, up to two.\n\n**Confidentiality**\n\n- confidentiality is the principle of keeping communication or data private **(1 AO1)**\n- as this business only operates online, they must keep non-physical customer data transferred to them secure from unauthorised access to ensure it remains confidential **(1 AO2)**; this requires relevant security protocols such as access control and encryption, which will ensure their excellent reputation is not damaged **(1 AO2)**.\n\n**Integrity**\n\n- integrity is the principle of keeping information accurate, free from errors and without unauthorised modification **(1 AO1)**\n- the business must be able to track whether the data they store has been accessed and processed, which can be done through security logging techniques **(1 AO2)**; this gives customers peace of mind that the transfer of online data when making a purchase is secure **(1 AO2)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**Confidentiality** — keeping communication and data private, accessible only to those authorised **(AO1)**. *Here:* the retailer is online-only, so every customer record exists as transferred data; access control and encryption keep it out of unauthorised hands — and keep the reputation that online-only businesses live on **(AO2)**.\n\n**Integrity** — keeping information accurate, error-free and free of unauthorised modification **(AO1)**. *Here:* security logging lets the retailer track who touched purchase data, and customers gain peace of mind that their payment details reach the retailer exactly as sent **(AO2)**.',
    markingNotesMd: 'AO1 describe + AO2 apply, per principle. The application must be to an *online-only retailer* — access control/encryption for confidentiality, logging/tamper evidence for integrity.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO2', marks: 2 }], specRefs: 'Unit 8 (security principles — CIA)',
    keywords: [
      { required: true, phrase: 'private', synonyms: ['private', 'confidential', 'unauthorised access'] },
      { required: true, phrase: 'accurate', synonyms: ['accurate', 'accuracy', 'unauthorised modification', 'error'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q22', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q22',
    questionMd: 'A software business wants to make sure that its latest security product meets the required industry minimum security standards.\n\na) Explain why it is important to the business that their product can meet these standards.\n\nb) Evaluate the potential impact of not being able to comply with the security standards.\n\n**[5 marks]**',
    marks: 5,
    markSchemeMd: '**AO2 = 2 marks (part a) · AO3 = 3 marks (part b)**\n\na) One AO2 mark for each explanation of the importance to the business/customers of meeting the standards, up to two:\n\n- without these standards the business could suffer damage to their reputation in the eyes of potential customers, which is vital for a business that sells security products **(1)**\n- meeting the standards will protect their data and the data of their customers **(1)**.\n\nb) One AO3 mark for each evaluation of the potential impact on the company of not meeting the standard, up to three:\n\n- if security software does not meet the minimum standard, the business would not be competitive in the market **(1)**\n- this would lead to fewer customers having the confidence to purchase, which would directly impact the financial health of the company **(1)**\n- if the software did not protect a customer\u2019s assets in the way intended, they may be liable to legal action from customers that have purchased the software **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**a)** For a security vendor, the product *is* trust: failing the industry minimum signals to potential customers that the product can\u2019t do its core job, sinking reputation in a market where reputation is everything — and compliance is what actually protects the customers\u2019 (and the company\u2019s) data.\n\n**b)** Non-compliance makes the product uncompetitive — buyers compare certifications before purchasing. That collapses confidence, directly hitting the company\u2019s financial health through lost sales. Worse, if a non-compliant product fails to protect a customer\u2019s assets as promised, the company faces legal action from the very customers it sold protection to.',
    markingNotesMd: 'a) AO2 explanations (2), b) AO3 evaluated impacts (3). Part b escalates: market position → finances → legal liability.',
    aoSplit: [{ ao: 'AO2', marks: 2 }, { ao: 'AO3', marks: 3 }], specRefs: 'Unit 8 (security standards and compliance)',
    keywords: [
      { required: true, phrase: 'reputation', synonyms: ['reputational', 'reputation', 'confidence'] },
      { required: true, phrase: 'legal', synonyms: ['legal action', 'liable', 'lawsuit', 'sued'] },
    ], minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q23', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q23 (extended)',
    questionMd: 'A local school is planning an upgrade of their IT systems. Their current network OS and client OS is over 10 years old.\n\nThe school plans to migrate the classroom register from a shared spreadsheet to a system hosted on a database in the cloud. Recently, there have been several successful **unauthorised access attempts on the shared drives due to teacher passwords being guessed**.\n\nAll teacher passwords have now been reset to a random word and distributed to each teacher individually.\n\nEvaluate the school\u2019s digital security. You must comment on:\n\n- **one technical and one non-technical vulnerability**\n- **potential impacts** of these vulnerabilities\n- **potential components** that can be put in place to make unauthorised access less successful.\n\n**[12 marks, plus 3 for QWC]**',
    marks: 12, qwcMarks: 3,
    markSchemeMd: '**AO1 = 4 marks · AO2 = 4 marks · AO3 = 4 marks** — levels-marked (bands 0–4), judged holistically.\n\n**Band 4 (10–12):** evaluation of digital vulnerability mitigation is comprehensive, effective and relevant, with detailed understanding and logical, coherent chains of reasoning throughout; informed conclusions fully supported with rational, balanced judgements. *AO2:* applied all relevant knowledge of security vulnerabilities and their impacts to the context with detailed functional understanding. *AO1:* wide range of relevant knowledge and understanding of digital security and critical bugs, accurate and detailed.\n\n**Band 3 (7–9):** evaluation mostly effective and relevant, mostly coherent chains of reasoning; conclusions supported by judgements considering most relevant arguments.\n\n**Band 2 (4–6):** evaluation of some relevance, generic statements with some development; brief conclusions from basic arguments.\n\n**Band 1 (1–3):** minimal, very limited; tenuous, unsupported conclusions.\n\n**QWC = 3 marks:** standard grid (clarity, structure, grammar, technical terms).\n\n**Indicative content — AO1 technical vulnerabilities:** outdated operating systems — unsecure and no longer serviced by updates protecting against the latest threats; the software in use is likely outdated too, potentially carrying critical bugs as it is no longer vendor-supported.\n\n**AO1 non-technical vulnerabilities:** the security knowledge of teachers is not strong enough — several teachers\u2019 passwords have been guessed, allowing unauthorised access to shared drives; the new passwords are only \u2018a word\u2019, susceptible to brute force, as a word lacks the special characters or numbers that increase password strength.\n\n**AO2 potential impacts:** malware could cause serious problems — a successful ransomware attack against the school network would mean teachers and students lose access to important data such as coursework with marking deadlines; this would massively impact the school\u2019s reputation and cause issues with regulatory bodies such as the local education authority and Ofsted. Successful unauthorised access means unauthorised users see files they should not — background information about a child\u2019s home life and medical conditions — a serious data breach contravening data protection laws, requiring a report to and investigation by the data commissioner, leading to fines or even legal action against responsible individuals.\n\n**AO3 evaluation:** the school network must be brought up to date and shown to be adequately secure; cloud-hosted systems ensure data cannot be accessed by such simple methods — a cloud provider will encrypt data in use and at rest, while the school requires strong authentication policies such as multifactor authentication, though MFA takes users slightly longer to log in and could be considered less convenient. A move to newer operating systems ensures the latest threats are mitigated by patches — a much more solid security base, but costly and requiring system downtime during installation. Training for all staff must be implemented to end the bad behaviours that led to the unauthorised access: training in selecting strong, memorable passwords and refresher training on good password management. A final mitigation would be a security framework — working towards Cyber Essentials or ISO 27001 to bring every aspect of the school\u2019s IT security to the right standard to protect pupil and school data.',
    modelAnswerMd: '**Vulnerabilities (AO1).** *Technical:* a decade-old network and client OS — unpatched against current threats, with any dependent software likely unsupported and carrying critical bugs. *Non-technical:* staff security awareness is weak — passwords were guessable, and the reset policy (a single random word) remains brute-forceable because it lacks length, digits and symbols.\n\n**Impacts (AO2).** Ransomware on this estate would lock coursework at marking deadlines and drag the school before Ofsted and the local authority. More immediately, the successful shared-drive intrusions may already have exposed child safeguarding and medical data — a reportable data-protection breach carrying ICO fines and potential legal action against individuals.\n\n**Mitigations, evaluated (AO3).** MFA and cloud-hosting (encrypted at rest and in use) defeat the guessing attacks, at the cost of a slower login. Newer OS versions restore vendor patching — the solid base — but cost money and downtime. Training fixes the human vulnerability the passwords expose, but must be refreshed to stick. Best of all is a framework (Cyber Essentials / ISO 27001) that audits *everything* rather than patching single holes. Conclusion: technology buys the strongest single gains (MFA, patched OS), but only the framework plus sustained training closes the gap permanently — convenience trade-offs are the price of protecting children\u2019s data.',
    markingNotesMd: 'Levels-marked; the prompt REQUIRES all three strands (vulnerabilities, impacts, components) — missing a strand caps the band. Name the *same* vulnerabilities in all three strands (outdated OS → ransomware exposure → patching) for the coherent chains of reasoning band 4 demands. QWC separately rewards security terminology (MFA, patching, Cyber Essentials, brute force).',
    aoSplit: [{ ao: 'AO1', marks: 4 }, { ao: 'AO2', marks: 4 }, { ao: 'AO3', marks: 4 }], specRefs: 'Units 4.1.2 (data protection), 8 (security) — extended-response synthesis',
    keywords: undefined, minPoints: undefined,
  }),
  q({
    id: 'tlq:tl-paperB:q24', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q24',
    questionMd: 'State **one** possible purpose of an algorithm.\n\n**[1 mark]**',
    marks: 1,
    markSchemeMd: '**AO1 = 1 mark**\n\nAward one mark for stating a purpose of an algorithm, for example:\n\n- to automate calculations **(1)** · computational actions **(1)** · problem solving **(1)** · support machine learning **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: 'One purpose of an algorithm is to **automate a calculation or process** so it can be carried out consistently without human effort.',
    markingNotesMd: 'AO1 — any stated purpose; one line suffices.',
    aoSplit: [{ ao: 'AO1', marks: 1 }], specRefs: 'Unit 1.2 (algorithms)',
    keywords: [
      { required: true, phrase: 'automate', synonyms: ['automate', 'automation', 'problem solving', 'machine learning', 'calculat'] },
    ],
    minPoints: 1,
  }),
  q({
    id: 'tlq:tl-paperB:q25', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q25',
    questionMd: 'Describe an **iterative** algorithm.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO1 = 2 marks**\n\nAward one mark for each element of an iterative algorithm described, up to a maximum of two marks:\n\n- repeating a series of steps **(1)**\n- repeating steps until a task is accomplished **(1)**\n- count-controlled loops **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: 'An iterative algorithm **repeats a series of steps**, either a fixed number of times (count-controlled loops) or **until a terminating condition is met** — the task is accomplished and the repetition stops.',
    markingNotesMd: 'AO1 — two elements: the repetition + the stopping condition (or loop type).',
    aoSplit: [{ ao: 'AO1', marks: 2 }], specRefs: 'Unit 1.2 (algorithms — iteration)',
    keywords: [
      { required: true, phrase: 'repeat', synonyms: ['repeat', 'repeating', 'loop', 'iterat'] },
      { required: true, phrase: 'until', synonyms: ['until', 'condition', 'count-controlled', 'accomplished', 'terminat'] },
    ],
    minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q26', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q26',
    questionMd: 'The data modelling for a company is shown in the diagram *(entity relationship diagram reproduced in the specimen question paper)*.\n\nDescribe how this entity relationship diagram can improve the control and monitoring of the company\u2019s IT assets.\n\n**[2 marks]**',
    marks: 2,
    markSchemeMd: '**AO2 = 2 marks**\n\nAward one mark for each description of how the ERD can improve control and monitoring of the company\u2019s IT assets, up to a maximum of two marks, for example:\n\n- the ERD shows that employees and assets are modelled within tables in the database; assets and employees are linked by an employee-assets table that allows an entry to be made each time an asset is allocated to an employee **(1)**\n- each asset can be allocated to an employee in a \u2018many to one\u2019 relationship, allowing assets to be returned and then allocated to other employees **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. The ERD models employees and assets as linked tables, with a join table recording an entry every time an asset is allocated — so every assignment is tracked.\n2. The many-to-one relationship means assets can be returned and reallocated cleanly, giving a live, accurate inventory of who holds what.',
    markingNotesMd: 'AO2 — the answer must reference the *relationship structure* (tables, join table, cardinality) doing the monitoring work.',
    aoSplit: [{ ao: 'AO2', marks: 2 }], specRefs: 'Unit 3.1–3.7 (data — databases)',
    keywords: [
      { required: true, phrase: 'table', synonyms: ['table', 'tables', 'entity', 'database'] },
      { required: true, phrase: 'allocat', synonyms: ['allocat', 'assigned', 'join', 'link'] },
    ],
    minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q27', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q27',
    questionMd: 'A junior developer is creating a piece of software for a non-technical client. The client has asked for an overview of how the software will work.\n\nExplain **three** benefits of using pseudocode to give this overview.\n\n**[3 marks]**',
    marks: 3,
    markSchemeMd: '**AO2 = 3 marks**\n\nAward one mark for each benefit explained, up to a maximum of three marks, for example:\n\n- it allows the developer to express the logical ideas of the program to the client without using technical language **(1)**\n- writing pseudocode allows a developer to plan out the logic of a piece of software without writing all the code **(1)**\n- it can be implemented into real code relatively quickly due to its similarity to real programming languages, as opposed to a flowchart **(1)**\n- pseudocode allows the developer to express logical ideas without complete reliance on a specific technical coding language, so they can test the effectiveness of their idea before implementing it **(1)**\n- receiving guidance from a more senior colleague allows the junior developer to ensure the pseudocode correctly links to problem-solving and algorithm-design requirements **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Client-readable** — pseudocode expresses the program\u2019s logic in structured plain English, so a non-technical client can follow the overview without programming knowledge.\n2. **Fast planning** — the developer sketches the full logic without writing real code, iterating on the design cheaply.\n3. **Quick to become real** — pseudocode maps closely onto actual programming languages, so approved logic converts to code faster than from a flowchart; it is also language-independent, so the idea can be validated before any implementation is chosen.',
    markingNotesMd: 'AO2 — each benefit explained in the *client-overview context*. Two benefits well-explained = 2.',
    aoSplit: [{ ao: 'AO2', marks: 3 }], specRefs: 'Unit 1.2 (algorithms — pseudocode)',
    keywords: [
      { required: true, phrase: 'technical language', synonyms: ['without technical', 'non-technical', 'plain', 'client'] },
      { required: true, phrase: 'plan', synonyms: ['plan', 'planning', 'without writing all the code', 'logic'] },
      { required: true, phrase: 'implement', synonyms: ['implement', 'real code', 'programming language', 'quickly'] },
    ],
    minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q28', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q28',
    questionMd: 'A large organisation with 1000 users has reviewed its current access control policies. The organisation has found that many users can access files and folders on the network that they should not be able to access.\n\nThe organisation currently uses a **mandatory access control** system where administrators are responsible for assigning access rights to users. The administrator has suggested that a **role-based access control** system might be better.\n\nExplain why replacing the current access control system with a role-based access control system would be beneficial to the organisation.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO2 = 4 marks**\n\nAward one mark for each explanation given for replacing the current system with an RBAC system relevant to the context, up to a maximum of four marks, for example:\n\n- the current system of using mandatory access control is simply too ineffective to work given the large amounts of users within the organisation **(1)**\n- because access control in this organisation must be assigned manually by administrators, there is a lot of scope for human error — clearly the case given the issues the organisation is experiencing **(1)**\n- replacing the current system with role-based access control will simplify the access control process, allowing it to be managed much more effectively and ensuring the current problems stop; the 1000 users only have access to their authorised files and folders and cannot access, download or amend other files **(1)**\n- administrators will be able to manage using groups that reflect a user\u2019s job role, which will ensure users can only access objects required to perform their duties and take the pressure off administrators of an organisation of this size **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Scale** — manually assigning individual rights across 1000 users is unworkable; the current over-provisioning (users seeing files they shouldn\u2019t) is the visible symptom.\n2. **Human error** — every assignment depends on an administrator making no mistake; at this scale errors are inevitable, and they are exactly what the review found.\n3. **Simplification** — RBAC manages access in bulk, so users only reach files their role authorises, stopping unauthorised access, downloads and amendments.\n4. **Role groups** — administrators maintain groups that mirror job roles rather than 1000 individuals; least-privilege falls out naturally and administrator workload drops.',
    markingNotesMd: 'AO2 — benefits tied to THIS organisation\u2019s size and observed problem. "RBAC is better" without the why scores zero.',
    aoSplit: [{ ao: 'AO2', marks: 4 }], specRefs: 'Unit 8 (access control)',
    keywords: [
      { required: true, phrase: 'human error', synonyms: ['human error', 'manually', 'mistake'] },
      { required: true, phrase: 'role', synonyms: ['role', 'group', 'job'] },
      { required: true, phrase: '1000', synonyms: ['1000', 'large amounts of users', 'scale'] },
    ],
    minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q29', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q29',
    questionMd: 'A business has recently seen a large increase in demand for their services. The business currently operates from their original premises, which are small and cannot physically expand. The business also currently struggles to store and process their customers\u2019 data on a small on-premises server.\n\nIdentify **two** benefits of cloud storage and describe **two** reasons why cloud storage would be suitable for this business.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO1 = 2 marks · AO2 = 2 marks**\n\nOne AO1 mark for each benefit of cloud storage, up to two. Benefits include:\n\n- it allows an organisation to access an internet-based storage solution **(1)**\n- it offers high performance and scalability to grow / meet the growth demands of an organisation **(1)**.\n\nOne AO2 mark for each reason cloud storage suits this business, up to two:\n\n- cloud storage is scalable, so the business can purchase greater capacity to cope with the increase in demand **(1)**\n- as the business has no further physical capacity to expand the current data centre, cloud storage overcomes this limitation **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**Benefits (AO1).** Cloud storage is an internet-based solution reachable from anywhere; it offers high performance and scales to meet an organisation\u2019s growth.\n\n**Suitability (AO2).** Demand is surging, and rented cloud capacity grows with it — no new hardware purchase cycles. And the premises physically cannot take another server: the cloud removes the walls-as-limit problem entirely.',
    markingNotesMd: 'Split again: identify (AO1) vs apply-to-scenario (AO2). Benefits restated as suitability earn nothing in part b — the premises/demand details must appear.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO2', marks: 2 }], specRefs: 'Unit 7 (cloud storage)',
    keywords: [
      { required: true, phrase: 'scal', synonyms: ['scal', 'grow', 'capacity', 'demand'] },
      { required: true, phrase: 'physical', synonyms: ['physical', 'premises', 'premises cannot', 'no space', 'on-premises'] },
    ],
    minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q30', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q30',
    questionMd: 'A large technology solutions provider operates in the UK. The business uses call logging and statistics to monitor the performance of their sales operators. Every call that an operator makes or receives is logged. The duration of calls is also logged. Each operator is expected to log around 60 calls per day.\n\nBelow is an extract of yesterday\u2019s call log *(reproduced in the specimen question paper)*.\n\nThe business uses digital analysis to inform their decisions.\n\nDescribe **two** methods of abstraction. Explain how each method could be used with the data set provided.\n\n**[4 marks]**',
    marks: 4,
    markSchemeMd: '**AO1 = 2 marks · AO2 = 2 marks**\n\nOne AO1 mark for the description of each abstraction method, up to two; one AO2 mark for each explanation of using abstraction with the provided data set, up to two. For example:\n\n- filtering data allows for the consideration of only necessary detail **(1 AO1)**; the log can be filtered for each sales operative to review their own performance — in the data set provided, for example, the operative Frank Smith has much longer call durations than his colleagues **(1 AO2)**\n- removing unnecessary data **(1 AO1)**; a strange event occurred at 09:10 where many operatives received calls from an origin listed as \u2018unknown\u2019 — these calls were extremely short, provide no statistical value, and should be removed from the data set so as not to influence the analysis **(1 AO2)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**Filtering** — considering only the necessary detail while ignoring the rest **(AO1)**. *Here:* filter the log per operative to isolate their performance — Frank Smith\u2019s far-longer call durations than his colleagues\u2019 jump out once the rest of the log is filtered away **(AO2)**.\n\n**Removing unnecessary data** — deliberately discarding entries with no analytical value **(AO1)**. *Here:* the 09:10 cluster of near-instant \u2018unknown\u2019-origin calls carries no statistical signal and would distort averages, so it should be stripped from the data set before analysis **(AO2)**.',
    markingNotesMd: 'AO1 method + AO2 use *with this data set* — the 09:10 anomaly and Frank Smith are the concrete applications the indicative content expects.',
    aoSplit: [{ ao: 'AO1', marks: 2 }, { ao: 'AO2', marks: 2 }], specRefs: 'Unit 1.1 (computational thinking — abstraction); Unit 3 (data analysis)',
    keywords: [
      { required: true, phrase: 'filter', synonyms: ['filter', 'filtering'] },
      { required: true, phrase: 'unnecessary', synonyms: ['unnecessary', 'remove', 'removing', 'discard'] },
    ],
    minPoints: 2,
  }),
  q({
    id: 'tlq:tl-paperB:q31', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q31',
    questionMd: 'Your company is part of a movie streaming service. The company collects large amounts of data on viewing habits of customers and operational performance data. This data includes:\n\n- most-watched genre\n- most-watched actors\n- keywords associated with watched items.\n\nWhen they register, new customers select viewing preferences. The system also monitors how many people are streaming at the same time, streaming speeds and new subscriptions per month.\n\nThe movie streaming service wants to identify trends and patterns to support marketing and operational activities.\n\nDiscuss **three** ways that the service could use the collected data to do this. In each case, explain the benefit to the business of using this data.\n\n**[6 marks]**',
    marks: 6,
    markSchemeMd: '**AO3 = 6 marks**\n\nAward one mark for a relevant discussion point and one mark for an appropriate justification, up to a maximum of six marks. Possible applications of data:\n\n- **creation of customer profiles** **(1)**: viewing behaviour can be used to build customer profiles and recommend movies likely to be watched, or target customers based on their preferences **(1)**; this allows a more personalised experience and may increase engagement with the platform **(1)**\n- **the monitoring and control of operations** **(1)**: the volume of users streaming at certain times could be monitored to ensure no impact on the level of service **(1)**; extra resources could be implemented to cover the level of demand for a movie or time of day, based on the analysis of data **(1)**\n- **the setting and monitoring of key performance indicators (KPIs)** **(1)**: KPIs around new subscriptions per month could be monitored, indicating the popularity of the streaming platform **(1)**; this would inform financial business decision making **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '1. **Customer profiles and recommendations** — genre/actor/keyword data builds per-customer profiles driving personalised recommendations; engagement rises when the platform surfaces what each viewer actually wants.\n2. **Operational monitoring** — concurrent-stream counts and speeds, watched over time, reveal demand peaks; capacity can be provisioned ahead of them so service quality never dips.\n3. **KPIs** — new subscriptions per month, tracked as a KPI, measures popularity and gives finance the trend line investment decisions are made on.',
    markingNotesMd: 'AO3 3+3: application of the data **(1)** + business benefit **(1)**, three times. The benefit must be the business\u2019s (engagement, uptime, decisions), not the viewer\u2019s.',
    aoSplit: [{ ao: 'AO3', marks: 6 }], specRefs: 'Unit 3 (data analysis); Unit 1 (business context)',
    keywords: [
      { required: true, phrase: 'profile', synonyms: ['profile', 'recommend', 'personalis', 'personaliz'] },
      { required: true, phrase: 'monitor', synonyms: ['monitor', 'concurrent', 'peak', 'capacity', 'resources'] },
      { required: true, phrase: 'kpi', synonyms: ['kpi', 'key performance', 'subscription', 'decision'] },
    ],
    minPoints: 3,
  }),
  q({
    id: 'tlq:tl-paperB:q32', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q32',
    questionMd: 'Your organisation wants to automate processes to save cost, categorise customer complaints about packaging and reduce their carbon footprint. As a result, some of the packaging decisions will now be made by an algorithm. All products must be packaged based on number of items and weight and dimensions of those items.\n\nAnalyse how **pattern recognition** and **decomposition** could help design an effective algorithm to make this packaging process effective.\n\n**[6 marks]**',
    marks: 6,
    markSchemeMd: '**AO3 = 6 marks**\n\nAward one mark for each appropriate analysis of pattern recognition to support algorithm design, up to a maximum of three marks, for example:\n\n- allows identification of patterns that may make the packaging process more efficient **(1)**; for example, the algorithm identifying ways to group products together — similar products could then be packaged in the same way, which may increase the efficiency of the packaging process **(1)**\n- allows identification of products that often receive customer complaints relating to packaging **(1)**; this would allow analysis of possible reasons for these complaints, such as the quality or quantity of packaging being appropriate — more appropriate packaging could then be identified by the algorithm to reduce complaints **(1)**\n- allows identification of products which have excessive packaging for product size or weight **(1)**; reducing this may save cost and reduce the carbon footprint of the organisation — the reduction in packaging may also reduce customer complaints related to excessive packaging and have a positive impact on organisational reputation **(1)**.\n\nAward one mark for each appropriate analysis of decomposition to support algorithm design, up to a maximum of three marks, for example:\n\n- decomposition allows the packaging process to be broken down into smaller parts that are easier to understand and manage **(1)**; this allows the algorithm to analyse the cost of each step **(1)**, supporting identification of areas where packaging could be reduced and therefore costs reduced — the reduction in packaging would also reduce the carbon footprint **(1)**\n- decomposition of customer packaging complaints would allow the specific nature of the complaint to be identified by the algorithm **(1)**; complaints could then be categorised, and all packaging complaints addressed by specific packaging processes suggested by the algorithm **(1)**.\n\nAccept any other suitable response.',
    modelAnswerMd: '**Pattern recognition.** The algorithm finds grouping patterns — items of similar size/weight packaged identically — lifting throughput. It also spots *complaint* patterns: which products repeatedly draw packaging complaints, so their packaging quality/quantity is corrected; and excess-packaging patterns (boxes oversized for their contents), where shrinking the box saves cost, cuts the carbon footprint and repairs reputation.\n\n**Decomposition.** Breaking the packaging process into manageable steps lets the algorithm cost each one, pinpointing where material (and carbon) can be cut. Decomposing the complaints themselves categorises their specific nature, so each complaint type maps to the packaging process change that resolves it.',
    markingNotesMd: 'AO3 — analyse BOTH techniques (up to 3 marks each). Each point must connect the technique to the algorithm\u2019s *design*, and ideally to the stated goals (cost, complaints, carbon). One technique only caps at 3.',
    aoSplit: [{ ao: 'AO3', marks: 6 }], specRefs: 'Unit 1.1 (computational thinking — pattern recognition, decomposition)',
    keywords: [
      { required: true, phrase: 'group', synonyms: ['group', 'similar products', 'pattern'] },
      { required: true, phrase: 'complaint', synonyms: ['complaint', 'complaints'] },
      { required: true, phrase: 'broken down', synonyms: ['broken down', 'smaller parts', 'decompose', 'manageable'] },
      { required: true, phrase: 'carbon', synonyms: ['carbon', 'footprint', 'cost'] },
    ],
    minPoints: 3,
  }),
  q({
    id: 'tlq:tl-paperB:q33', topicId: 'tl:paperB', questionRef: 'Specimen Paper B Q33 (extended)',
    questionMd: 'A small local bakery has decided to digitalise their business. The bakery will offer online ordering, payment and delivery service to customers.\n\n**Recommend usable relational database systems and evaluate your decisions.**\n\nYour response must include:\n\n- two resource considerations of data entry and maintenance\n- two key functions that the relational database should perform\n- considerations of validation and verification of data entry.\n\n**[12 marks, plus 3 for QWC]**',
    marks: 12, qwcMarks: 3,
    markSchemeMd: '**AO1 = 4 marks · AO2 = 4 marks · AO3 = 4 marks** — levels-marked (bands 0–4), judged holistically.\n\n**Band 4 (10–12):** evaluation of data entry considerations relating to relational database systems is comprehensive, effective and relevant, with detailed understanding and logical, coherent chains of reasoning throughout; informed conclusions fully supported with rational, balanced judgements. *AO2:* applied all relevant knowledge of database functions to the context with detailed functional understanding of validation and verification. *AO1:* wide range of relevant knowledge and understanding of resources involved in developing a database system, accurate and detailed, with a wide range of appropriate technical terms.\n\n**Band 3 (7–9):** evaluation mostly effective and relevant, mostly coherent chains of reasoning; conclusions supported by judgements considering most relevant arguments.\n\n**Band 2 (4–6):** evaluation of some relevance, generic statements with some development; brief conclusions from basic arguments.\n\n**Band 1 (1–3):** minimal, very limited; tenuous, unsupported conclusions.\n\n**QWC = 3 marks:** standard grid.\n\n**Indicative content — business resource considerations:** *time* is a resource that must be considered when developing the new database system **(AO1)** — with the online offering launching, the database must be ready quickly while containing the correct functionality to be useful to the business and its customers **(AO2)**. *Budget* is a resource that must be decided before development commences **(AO1)** — likely modest given the type of business, which is likely to limit the functionality of the database **(AO2)**.\n\n**Key functions of the database:** a *create* function to add both products and customers **(AO1)** — allowing customer orders to be tracked from initial order to delivery while stock levels are tracked so only fulfilable orders are taken **(AO2)**. Functionality to *integrate with an online payment system* **(AO1)** — taking payment at order time means orders don\u2019t go to customers with no means to pay, and positive cash-flow impact as the bakery is paid upfront for upcoming orders, meaning supplies can be purchased ahead of the products being made **(AO2)**.\n\n**Evaluation (AO3):** the database and its data should be simple to use and maintain given the nature of the business; data-validation techniques encouraging correct data only should be employed so non-technical users input data accurately without causing functionality issues. Users should not be able to modify the back end — design or interface — since low-skill users could make the database an ineffective tool. User groups should ensure those accessing the system have only user-level rights, though these take time and resources to establish and must be maintained as people join and leave — without that maintenance the process would not succeed as intended. The developer should retain system administrative rights to make authorised changes, with remote access advised so issues can be resolved quickly.',
    modelAnswerMd: '**Recommendation.** A hosted relational database (e.g. MySQL/PostgreSQL via a managed cloud service) — free/low-cost tiers fit a bakery\u2019s budget, backups and maintenance are handled by the provider, and SQL\u2019s relational model cleanly handles products → orders → customers → payments.\n\n**Resource considerations.** *Time:* the online service launches soon, so the database must be live quickly while still carrying the needed functionality. *Budget:* modest for a small bakery, which realistically limits functionality — choose hosted over self-managed to spend the budget on features, not infrastructure.\n\n**Key functions.** *Create:* adding products and customers lets every order be tracked from placement to delivery, with stock levels checked so only fulfilable orders are accepted. *Payment integration:* taking payment at order time prevents unpayable orders going out and — crucially for a bakery — brings cash in before ingredients are bought, improving cash flow.\n\n**Validation and verification.** Validation rules (required fields, format checks, numeric ranges) keep non-technical staff entering correct data; verification (double-entry or confirmation screens) catches what validation can\u2019t. Lock down the back end: user groups restrict staff to user-level rights, with the developer retaining admin rights and remote access for fast fixes. Trade-off: user-group administration takes ongoing time — but without it, the access control fails as staff change.\n\n**Conclusion.** A hosted relational database, launched lean with create + payment functions, strong validation and strict user groups, is the fit-for-purpose choice: it matches the bakery\u2019s budget and skills while directly supporting the online ordering, payment and delivery model.',
    markingNotesMd: 'Levels-marked — the three bullet REQUIREMENTS must all be present (resources, functions, validation/verification) or the band caps. The evaluation (AO3) lives in the trade-offs: budget vs functionality, validation vs non-technical users, user groups vs maintenance effort. QWC rewards database terminology (validation, verification, relational, user groups, admin rights).',
    aoSplit: [{ ao: 'AO1', marks: 4 }, { ao: 'AO2', marks: 4 }, { ao: 'AO3', marks: 4 }], specRefs: 'Unit 3.1–3.7 (data — databases, validation, verification) — extended-response synthesis',
    keywords: undefined, minPoints: undefined,
  }),
];

// ── topics: two exam-workshop topics hosting the questions ─────────────────

const paperATopic: TopicSpec = {
  id: 'tl:paperA',
  name: 'Paper A — specimen exam workshop',
  description:
    'Pearson Core Exam Paper A (specimen 2020): business context and culture, diversity/inclusion and digital environments, learning and planning. 22 questions, 106 marks incl. 6 QWC, 2 hours. Every question carries its mark scheme, AO split and a model answer.',
  position: 19,
  lessons: [
    {
      id: 'tl:paperA:briefing',
      title: 'Paper A — how this paper is marked',
      detailedMd: [
        '# Paper A — how this specimen paper is marked',
        '',
        '**Format.** 2 hours, 106 marks total: 100 question marks + **6 QWC** (3 on each extended response, Q8 and Q16). Three sections: A Business context and culture (41), B Diversity, inclusion and digital environments (37), C Learning and planning (22).',
        '',
        '**Assessment objectives.** AO1 demonstrate knowledge and understanding of the digital support services sector (28 marks) · AO2 apply that knowledge to situations and contexts (40) · AO3 analyse and evaluate information and issues (32).',
        '',
        '## How marks are actually awarded',
        '',
        '- **Short questions** carry their AO allocation in the mark scheme and award 1 mark per developed point — a named stakeholder + their influence, a described action + its effect. Naming without developing scores nothing.',
        '- **"Explain/justify" pairs** (Q13, Q20, Q21) award 2 marks per explanation: what it is **(1)** + why it fits THIS scenario **(1)**. Generic answers earn the first mark only.',
        '- **Extended 12-mark questions (Q8, Q16)** are levels-marked: the examiner judges the whole response against band descriptors (band 4 = 10–12, band 3 = 7–9, band 2 = 4–6, band 1 = 1–3), then distributes marks across AO1/AO2/AO3. Band 4 demands distinct knowledge, application to the scenario, and a supported, balanced conclusion.',
        '- **QWC (3 marks)** on each extended question: technical vocabulary used effectively, clear structure, controlled grammar. It is marked separately from content.',
        '',
        '## Rehearsal pattern',
        '',
        'For every 2-mark "explain" question, write two sentences: *what* and *why here*. For extended questions, plan three labelled paragraphs — knowledge, application, evaluation — and end with a judgement. The AO split shown with each result tells you which paragraph earned which marks.',
      ].join('\n'),
      summaryMd: [
        'Paper A: 2h, 100 marks + 6 QWC (Q8 & Q16). Sections: Business context (41), Diversity/digital environments (37), Learning & planning (22). AO1 28 / AO2 40 / AO3 32.',
        '',
        '- Short questions: 1 mark per *developed* point — point + consequence.',
        '- Explain-pairs: what (1) + why in this scenario (1).',
        '- Q8/Q16: levels-marked bands 1–4, then split AO1/AO2/AO3; plan knowledge → application → evaluation, finish with a judgement.',
        '- QWC: 3 marks for technical terms, structure and grammar on each extended answer.',
      ].join('\n'),
      specRefs: 'Core Exam Paper A (specimen 2020)',
    },
  ],
};

const paperBTopic: TopicSpec = {
  id: 'tl:paperB',
  name: 'Paper B — specimen exam workshop',
  description:
    'Pearson Core Exam Paper B (specimen 2020): DSS pathway, tools and testing, security and legislation, data and digital analysis. 33 questions, 131 marks incl. 6 QWC, 2h30. Every question carries its mark scheme, AO split and a model answer.',
  position: 20,
  lessons: [
    {
      id: 'tl:paperB:briefing',
      title: 'Paper B — how this paper is marked',
      detailedMd: [
        '# Paper B — how this specimen paper is marked',
        '',
        '**Format.** 2 hours 30 minutes, 131 marks total: 125 question marks + **6 QWC** (3 on each extended response, Q23 and Q33). Four sections: A Digital Support Services pathway (25), B Tools and testing (21), C Security and legislation (35+3), D Data and digital analysis (44+3).',
        '',
        '**Assessment objectives.** AO1 knowledge and understanding (35 marks) · AO2 application (50) · AO3 analysis and evaluation (40). Paper B is the more applied paper — nearly half the marks are AO2.',
        '',
        '## How marks are actually awarded',
        '',
        '- **Describe/Explain pairs** (Q20, Q21, Q22) mark *description* and *application* separately: an accurate description earns AO1, and its scenario-specific effect earns AO2. Blending the two earns roughly half.',
        '- **Data-set questions** (Q11, Q30) require the statistic AND the action taken from it — one mark each.',
        '- **Discuss/Analyse six-markers** (Q15a, Q31, Q32) award a mark per developed point; a balanced counterpoint (e.g. information overload) is often the mark most candidates miss.',
        '- **Extended 12-mark questions (Q23, Q33)** are levels-marked bands 1–4 and their bullets are mandatory: Q23 requires technical + non-technical vulnerability, impacts, and mitigations; Q33 requires resource considerations, key functions, and validation/verification. Missing a bullet caps the band.',
        '- **QWC (3 marks)** on each extended question, marked separately.',
        '',
        '## Rehearsal pattern',
        '',
        'Answer the exact bullets asked. For evaluate questions, force a conclusion sentence naming the *extent* or the *recommendation* — that sentence is where the final AO3 mark usually lives.',
      ].join('\n'),
      summaryMd: [
        'Paper B: 2h30, 125 marks + 6 QWC (Q23 & Q33). Sections: DSS pathway (25), Tools & testing (21), Security & legislation (35), Data & digital analysis (44). AO1 35 / AO2 50 / AO3 40.',
        '',
        '- Description and application are marked separately — never blend them.',
        '- Data questions: statistic (1) + action from it (1).',
        '- Six-markers: a mark per developed point; include a counterpoint.',
        '- Q23/Q33: bands 1–4, mandatory bullets — miss one and the band is capped. End with an explicit judgement.',
      ].join('\n'),
      specRefs: 'Core Exam Paper B (specimen 2020)',
    },
  ],
};

// ── papers: the four specimen documents for the stored-paper reader ────────

const spec = (which: 'A' | 'B'): { qp: string; ms: string } => ({
  qp: cleanPaperMd(readVault(TL_PAPERS, 'Question Papers', `Core Exam Paper ${which} (Specimen 2020) — Question Paper.md`)),
  ms: cleanPaperMd(readVault(TL_PAPERS, 'Mark Schemes', `Core Exam Paper ${which} (Specimen 2020) — Mark Scheme.md`)),
});

const a = spec('A');
const b = spec('B');

// ── the subject spec ────────────────────────────────────────────────────────

const tlevelCyber: SubjectSpec = {
  // The EXISTING production subject — upsertSubject updates it by id and never
  // inserts a duplicate.
  id: SUBJECT_ID,
  name: 'T-Level Cybersecurity',
  slug: 't-level-cybersecurity',
  description:
    'T-Level Digital Support Services core content: business context, digital environments, security and legislation, data and analysis — with the Pearson specimen Core Exam Papers A and B as fully-marked exam-style practice.',
  mathsEnabled: false, // unchanged — the subject is not maths-enabled
  topics: [paperATopic, paperBTopic],
  papers: [
    {
      id: 'tlp:spec2020-A-qp',
      kind: 'question_paper',
      title: 'Core Exam Paper A — Question Paper (Specimen 2020)',
      board: BOARD,
      series: 'Specimen 2020',
      // Both specimen papers carry the same placeholder code P00XXXXX; the
      // -A/-B suffix disambiguates them for the storage unique index.
      paperCode: 'P00XXXXX-A',
      totalMarks: 106,
      durationMinutes: 120,
      contentMd: a.qp,
    },
    {
      id: 'tlp:spec2020-A-ms',
      kind: 'mark_scheme',
      title: 'Core Exam Paper A — Mark Scheme (Specimen 2020)',
      board: BOARD,
      series: 'Specimen 2020',
      paperCode: 'P00XXXXX-A',
      totalMarks: 106,
      contentMd: a.ms,
    },
    {
      id: 'tlp:spec2020-B-qp',
      kind: 'question_paper',
      title: 'Core Exam Paper B — Question Paper (Specimen 2020)',
      board: BOARD,
      series: 'Specimen 2020',
      paperCode: 'P00XXXXX-B',
      totalMarks: 131,
      durationMinutes: 150,
      contentMd: b.qp,
    },
    {
      id: 'tlp:spec2020-B-ms',
      kind: 'mark_scheme',
      title: 'Core Exam Paper B — Mark Scheme (Specimen 2020)',
      board: BOARD,
      series: 'Specimen 2020',
      paperCode: 'P00XXXXX-B',
      totalMarks: 131,
      contentMd: b.ms,
    },
  ],
  questions: [...paperAQuestions, ...paperBQuestions],
};

export default tlevelCyber;
