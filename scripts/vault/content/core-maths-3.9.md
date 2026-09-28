# Core Maths — Expectation (3.9)

## R4 — Probability

Uncertain outcomes can be modelled as random events with estimated probabilities. The probabilities of an **exhaustive** set of outcomes — one that covers every possibility — must sum to 1. If a set is not exhaustive, the leftover probability belongs to "none of these" and must be included when totalling.

Probabilities are **estimated** in real situations — an estimate of $\frac{1}{7}$ is a judgement, not a fact. That matters in critical analysis (3.4) and risk analysis (3.10).

When outcomes are **equally likely**: $P(\text{event}) = \frac{\text{favourable outcomes}}{\text{total equally likely outcomes}}$. For non-equally likely outcomes (a biased spinner, an unreliable sensor), divide by the sum of the **weights** instead of the count — reading the weights correctly is usually the whole difficulty.

## R5 — Diagrammatic representations

Required notation:

| Symbol | Means |
| --- | --- |
| $P(A)$ | Probability of event A |
| $P(A')$ | Probability of **not** A — $1 - P(A)$ |
| $P(A \cup B)$ | A **or** B **or both** — the union |
| $P(A \cap B)$ | A **and** B — the intersection |

$\cup$ is "or" (add, but subtract the overlap if you add the two probabilities); $\cap$ is "and" (the overlap); the apostrophe in $A'$ is the complement — everything outside A.

**Venn diagrams**: two overlapping circles inside a rectangle that represents the whole sample space; probabilities of each region are written inside and must sum to 1.

$$P(A \cup B) = P(A) + P(B) - P(A \cap B)$$
$$P(A \text{ only}) = P(A) - P(A \cap B)$$
$$P(A \cap B) = P(A) \times P(B \mid A)$$

**Tree diagrams**: branch probabilities **multiply** along a path; **sum** the paths that lead to the outcome you want. For repeated independent trials the same branch repeats each time. The classic mistake is adding along a path instead of multiplying.

## R6 — Combined events

**Independent events**: $P(B \mid A) = P(B)$ — A's outcome does not change B's chance. Then $P(A \cap B) = P(A) \times P(B)$. Rolling a die and tossing a coin: $\frac{1}{6} \times \frac{1}{2} = \frac{1}{12}$.

**Dependent events**: use the conditional probability $P(A \cap B) = P(A) \times P(B \mid A)$. Two cards drawn without replacement: $P(\text{king then ace}) = \frac{4}{52} \times \frac{4}{51}$ — the denominator drops to 51 because the first card is gone. Using $\frac{4}{52}$ twice is the classic error.

| Requirement | Formula |
| --- | --- |
| Both A and B | $P(A \cap B)$ |
| Neither A nor B | $(1 - P(A))(1 - P(B))$ when independent |
| Either A or B or both | $P(A) + P(B) - P(A \cap B)$ |

If a question wants A **or** B **but not both**, that is $P(A) + P(B) - 2P(A \cap B)$ — read the wording carefully, "or both" and "but not both" are different questions.

## R7 — Expected value

$$E(X) = \sum \left( x_i \times p_i \right)$$

For each possible outcome, multiply the value by its probability, then add them all up.

Worked example — a game: stake £1; win £5 with probability 0.2, lose the stake with probability 0.8. $E = 0.2 \times 5 - 0.8 \times 1 = £0.20$ — positive, so the game is favourable in the long run.

Worked example — insurance: pay £120 for a year of cover against a £2000 theft with probability 0.008. Expected loss without insurance = $2000 \times 0.008 = £16$. Value of the policy = $16 - 120 = -£104$: you pay far more than the expected loss, which is the point — you are buying the removal of a risk you may not be able to absorb, not expected value.

**Not a prediction.** Expected value is a long-run average across many repetitions; any single occasion will usually differ. A policy with negative expected value can still be entirely rational to buy. Pick a sign convention (gains positive, losses negative), state it, and stick to it.
