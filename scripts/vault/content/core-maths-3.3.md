# Core Maths — Estimation (3.3)

## E1 — The modelling cycle

1. **Identify** the real situation and what you actually need to find.
2. **Make assumptions** and simplify — the real world is too complicated to model exactly.
3. **Represent** the situation mathematically.
4. **Solve**, selecting techniques appropriate to the representation.
5. **Interpret** the result back in the original context.
6. **Evaluate** — how good were the assumptions, and how might they have distorted the answer?

Steps 1, 5 and 6 carry the marks: E1.1, E1.3 and E1.4 are about *reasoning about* the model, not just computing with it. A correct number that is never interpreted answers only part of the question.

An **assumption** is something you take to be true to make the problem solvable; a **simplification** is something you deliberately leave out.

| Assumption | Simplification |
| --- | --- |
| "Growth continues at 4% a year" | Ignoring that the rate may change |
| "Exchange rates stay constant" | Ignoring inflation |
| "Interest is compounded monthly" | Ignoring fees changing the effective rate |
| "The sample represents the population" | Ignoring bias |

Every assumption is a potential source of error, and stating them is what E1.4 asks for. E1.1 is explicit that this is *open* problem-solving — two different models can both be defensible if the assumptions are stated and the reasoning is sound. What is not defensible is an unstated assumption, or a result that is never interpreted.

A complete evaluation asks: does the answer make sense in context and in magnitude; what happens if an assumption fails; what level of accuracy is being claimed; would a different model give a different result, and which is more appropriate?

## E2 — Fermi estimation

A Fermi problem asks you to estimate something by **order-of-magnitude reasoning**: break the unknown into quantities you *can* estimate, then chain them together. The aim is a rough answer obtained fast, not a precise one.

1. Identify what you actually need.
2. Break it into parts you can estimate from general knowledge.
3. Estimate each part as an order of magnitude.
4. Combine, checking the arithmetic.
5. Sanity check — is the answer plausible? Within one or two orders of magnitude of what you would expect?

Worked example — water in a pool: $50 \times 20 \times 2 = 2000\text{ m}^3$; at $1000\text{ kg/m}^3$ that is $2 \times 10^6$ kg ≈ 2000 tonnes — plausible for a competition pool.

Worked example — pianos in the UK: about $2.8 \times 10^7$ households (population ≈ 6.7 × 10⁷, ~2.4 per household); roughly 1 in 100 owns a piano; institutions hold ~10⁵. Total ≈ $2.8 \times 10^5 + 10^5 \approx 4 \times 10^5$ — a few hundred thousand. The intermediates are crude; the **order of magnitude** is reliable, which is all the method claims.

Useful anchors: populations and household sizes, average incomes, $1\text{ kg} \approx 2.2$ lb, $1\text{ m} \approx 3.3$ ft, a person ~2 m tall, a door ~2 m high. Rounding aggressively to 1 significant figure is normal and expected — and a result wildly out of proportion to your inputs signals a mistake, not insight.
