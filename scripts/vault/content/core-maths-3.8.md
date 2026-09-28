# Core Maths — Critical Path Analysis (3.8)

## R1 — Compound projects

The spec is explicit: **activity-on-node** representation will be used. Each **box is a task** labelled with its duration; **arrows show dependencies** (precedence). Do not use activity-on-arrow.

- Node = one activity, labelled with its duration in days (or hours).
- Arrow = "this activity must finish before that one can start".
- Start and finish nodes are the only ones with no predecessors / no successors.
- Parallel activities are drawn side by side with no arrow between them.
- An activity with more than one predecessor cannot start until *all* of them are complete.

## R2 — Critical activities

**Early times — forwards pass**, left to right:

- Early start = max(early finishes of all predecessors)
- Early finish = early start + duration
- The project duration is the early finish of the final node.

**Late times — backwards pass**, right to left:

- Late finish = min(late starts of all successors)
- Late start = late finish − duration
- The finish node's late finish = project duration.

An activity is **critical** when early start = late start (and so early finish = late finish). The **critical path** is the chain of critical activities — equivalently the **longest** path through the network. Float on a non-critical activity: float = late start − early start = late finish − early finish.

Worked example:

| Activity | Duration | Predecessors |
| --- | --- | --- |
| A | 3 | — |
| B | 5 | — |
| C | 4 | A, B |
| D | 2 | C |
| E | 6 | B |

Early: A(0–3), B(0–5), C(max(3,5)=5–9), D(9–11), E(5–11). Duration = 11 days.
Late: D(9–11), E(5–11), C(5–9), B(0–5), A(2–5). Float: A = 2, everything else 0.
**Two critical paths:** B→C→D and B→E, both length 11. A can slip 2 days without delaying the project.

Watch out: there need not be a single critical path — several routes can tie at the same length, and a delay to any of them delays the project. The quick check on a small network: sum each path's durations; the longest sum is the duration, anything shorter carries float.

## R3 — Gantt charts

A **Gantt chart** (cascade diagram) is a bar-chart schedule: time runs left to right, each activity occupies a horizontal bar spanning the days it runs. Bar starts at the activity's early start (or scheduled start); bar length equals duration; bars are listed vertically, one per activity. A **cascade** draws each bar starting where the one above ends, so the flow of work is immediately visible.

| | Activity network | Gantt / cascade |
| --- | --- | --- |
| Shows | Dependencies and the critical path | Timing and overlap in calendar form |
| Best for | Finding the critical path | Communicating a schedule |

To draw one: list activities and durations; work out early start / early finish; draw the time axis; draw each bar at its early start with length = duration; shade the critical activities (zero float).
