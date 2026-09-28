# Core Maths — Cost Benefit Analysis (3.10)

## R8 — Living with uncertainty

Decisions rarely have a single knowable answer. The choice is between **risks**, not between a right and a wrong answer.

| Source of uncertainty | Example |
| --- | --- |
| Random events | Whether a machine fails during a project |
| Estimated probabilities | Failure rates quoted by a manufacturer — estimates, not facts |
| Model assumptions | A cost model assuming constant demand |
| Future change | Interest rates, inflation, exchange rates |
| Data limitations | A sample that may not represent the population |

Uncertainty is not a reason to avoid deciding. It is a reason to decide on **expected value** — the long-run average — while acknowledging the spread of possible outcomes.

## R9 — Control measures

Every risk-reducing action has a cost, and reducing a risk can introduce new costs or new risks. The decision is which cost buys the best reduction.

| Control measure | Cost | What it reduces |
| --- | --- | --- |
| Insurance premium | Regular payment whether or not a claim is made | Financial impact of a loss |
| Higher-spec equipment | Higher purchase cost | Probability and severity of failure |
| Maintenance contract | Ongoing fee | Likelihood of breakdown |
| Backup / redundancy | Duplicate hardware, extra storage | Impact of a single point of failure |
| Training | Time and money | Human error |
| Regulatory compliance | Often compulsory, so no real choice | A mandated floor of protection |

The spec singles out **the costs and benefits of insurance**: cost the premium against the expected value of the loss it covers over the period. Some measures are not optional — where a measure is legally required, the only decision left is which compliant option to take.

## R10 — Risk analysis

Set out each option with its probability-weighted costs and benefits, then compare:

$$E(\text{net}) = \sum \left( (\text{benefit}_i - \text{cost}_i) \times p_i \right)$$

Worked example — a control decision. A server has a 0.2 chance of failing in a year, causing £5000 of loss and £2000 of lost trading.

| Option | Cost | Expected loss |
| --- | --- | --- |
| A — do nothing | £0 | $0.2 \times 7000 = £1400$ |
| B — redundant backup | £1500 up front | $1500 + 0.2 \times 2000 = £1900$ |
| C — support contract | £500/yr | $500 + 0 = £500$ |

On expected value alone, C wins.

**A pure expected-value answer is not sufficient.** The spec requires you to consider at least:

- **The regulatory framework** — is a control measure legally compulsory? If a business must hold insurance or meet a safety standard, that option is not a free choice; it sets a floor on the decision. Say so explicitly.
- **Minimising the maximum possible loss** — expected value averages across repetitions. If the potential loss is catastrophic or threatens the organisation's survival, minimising the **worst case** can outweigh a better expected value. Ask: what is the largest loss this option could produce?

Also worth raising: **risk appetite** (is the organisation risk-averse or risk-seeking?); **time horizon** (a cost now against a benefit over years); and the **accuracy of the probabilities** (they are estimated — how reliable are they?).

Calculating an expected value is an **important part** of decision making — a central, necessary step, but not the whole of it. A complete response combines the arithmetic with reasoned judgement about these factors.
