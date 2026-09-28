# Core Maths — summarised revision cards (Paper 1 + 2B)

## Paper 1 facts
1h30 · 60 marks · formulae sheet + Preliminary Material provided · calculator allowed. AO1 ~25–30%, AO2 ~31–40%, AO3 ~31–40% — over half the marks reward selecting techniques and communicating reasoning.

## 3.1 Analysis of data
- **D1**: qualitative = categories; quantitative = discrete (countable) or continuous (measurable). Primary = first-hand; secondary = someone else's, usually already grouped.
- **D2**: sampling error shrinks with sample size; **bias does not** — it needs a better method. Stratified = random within proportional strata; quota = sampler chooses → bias. Stratified n = stratum share × sample size.
- **D3**: mean & range & SD are outlier-sensitive; median & IQR are not. Skewed + outliers → median/IQR. Q1/Q2/Q3 sit at 0.25n/0.5n/0.75n of a cumulative frequency graph.
- **D4**: histogram = continuous, bars touch, **area** = frequency, so unequal widths need frequency density = frequency ÷ width. Cumulative frequency reads quartiles; box plots show the five-number summary; back-to-back stem-and-leaf compares two distributions.

## 3.2 Personal finance
- **F2 multipliers**: increase ×(1+r/100), decrease ×(1−r/100); multipliers compound (0.8 × 1.2 = 0.96, not 1). Reverse percentage: **divide by the multiplier**, never subtract a % of the new value. Percentage points ≠ percentage change.
- **F3 interest**: simple $A(1+rn/100)$ linear; compound $A(1+r)^n$ exponential. **AER** = $(1+i/n)^n - 1$ — higher than the nominal rate when n > 1; it exists so accounts with different compounding compare honestly.
- **F4 credit**: cost of credit = total repaid − borrowed; APR flattens fees into one comparable annual rate; student loans repay income above a threshold.
- **F6 tax**: progressive — only the slice in each band pays that band's rate. VAT removal: **divide by 1.2**, don't subtract 20%.
- **F7**: index base 100; inflation = % change in index; RPI includes housing, CPI doesn't. Iteration in a spreadsheet for untidy compounding; exchange then commission in the stated order; budgets need slack.

## 3.3 Estimation
- **E1 modelling cycle**: identify → assume → represent → solve → **interpret** → **evaluate**. The interpretation and the assumptions carry the marks; open problems have several defensible answers.
- **E2 Fermi**: break the unknown into estimateable parts, multiply, sanity-check the order of magnitude. 1 s.f. is fine; wildly disproportionate results are a mistake signal.

## 3.4 Critical analysis
- **C1**: does the conclusion follow from *that* data? sample bias? % vs %-point? accuracy? assumptions?
- **C2**: reports state context, select relevant figures, use units and notation, round sensibly, interpret, and admit limitations.
- **C3 media traps**: truncated axes, cherry-picked periods, percentage-point confusion, missing baselines, survivorship bias, correlation-as-causation.

## 3.8 Critical path
- Activity-**on-node**. Forwards pass: early start = max(predecessors' early finishes). Backwards: late finish = min(successors' late starts).
- Critical ⇔ early start = late start ⇔ float 0. Critical path = **longest** path; ties are possible. Float = late − early.
- Gantt/cascade: bar from early start, length = duration, shade the critical activities.

## 3.9 Expectation
- Exhaustive outcomes sum to 1. Tree diagrams: multiply along a path, add across paths. Independent: P(A∩B) = P(A)P(B); dependent: use the conditional — denominators shrink without replacement.
- $P(A\cup B) = P(A)+P(B)-P(A\cap B)$; "or but not both" subtracts the overlap twice.
- $E(X) = \sum x_i p_i$ — a long-run average, not a prediction; negative-EV insurance can still be rational.

## 3.10 Cost benefit
- Compare options on expected net value, then go beyond it: **regulatory framework** (compulsory measures set a floor) and **minimising the maximum possible loss** (catastrophe beats the average).
- Control measures cost money and can create new risks; insurance trades a certain premium for removing an unabsorbable risk.
