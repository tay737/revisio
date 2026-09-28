# Core Maths — Maths for Personal Finance (3.2)

## F1 — Numerical calculations

Substitution into formulae, spreadsheets and financial expressions: brackets first, then powers and roots, then × ÷ left to right, then + − left to right. Keep the units attached and round only at the end.

**Limits of accuracy.** Rounding to d decimal places: look at the next digit (5 or more rounds up). Rounding to n significant figures: count from the first non-zero digit.

- Rounded to the nearest 10: $345 \pm 5$, so the true value lies in $[340, 350]$.
- Rounded to the nearest 5: $347 \pm 2.5$, so $[344.5, 349.5]$.
- Truncated to 3 s.f.: $0.4567 \to [0.456, 0.457]$ — truncation always discards, so the interval is one-sided; rounding is centred.

Rounding too early in a multi-step financial calculation accumulates error: carry full precision through and round only the final answer (money to the nearest penny).

**Approximate solutions.** Some problems have no exact algebraic answer: make a reasoned estimate, substitute, compare with the target, adjust, repeat. Example: how long does £1000 take to reach £1200 at 5%? $1000 \times 1.05^n = 1200$, so $n = \frac{\ln 1.2}{\ln 1.05} \approx 3.74$ years — check the bracket ($1.05^{3.7} \approx £1197.84$, $1.05^{3.8} \approx £1203.70$) and state the interval.

## F2 — Percentages

Percentages are **multipliers**, not additions. $x$ increased by 20% is $x \times 1.2$.

| Change | Multiplier |
| --- | --- |
| Increase by r% | $\times (1 + \frac{r}{100})$ |
| Decrease by r% | $\times (1 - \frac{r}{100})$ |

Decreasing by 20% then increasing by 20% does **not** return you to the start: $100 \to 80 \to 96$, because $0.8 \times 1.2 = 0.96$.

Percentage of: part ÷ whole × 100. Percentage change: (new − old) ÷ old × 100 — the denominator is the **original**. A as a percentage of B is $\frac{A}{B} \times 100$, which generally does not sum to 100 with B as a percentage of A.

**Percentage vs percentage point.** Moving from 3.9% to 5.9% is 2 *percentage points*, which is a percentage *increase* of $\frac{2}{3.9} \times 100 \approx 51\%$. Mixing these up is exactly the error the media makes (see 3.4).

**Percentages over 100%.** An increase of 150% is a multiplier of 2.5; a decrease of 150% is a multiplier of −0.5 — the value flips through zero into a debt. Check the result makes sense in context.

**Finding the original.** Given the new value, divide by the multiplier — do not subtract the percentage of the new value. A price rose 12% to £291.20: original = 291.20 ÷ 1.12 = £260.00. (291.20 − 12% of 291.20 = £256.26 is the classic wrong answer, because it treats the 12% as applying to the new value.)

| | Simple | Compound |
| --- | --- | --- |
| Interest on | The original amount only | The balance so far |
| Over n years | $A(1 + \frac{r}{100}n)$ | $A(1 + \frac{r}{100})^n$ |
| Growth | Linear | Exponential |

## F3 — Interest rates

**Compound interest:** $A = P(1 + \frac{r}{n})^{nt}$ where P is the principal, r the nominal annual rate as a decimal, n the compounding periods per year, t the years. £2000 at 4.5% compounded quarterly for 3 years: $2000 \times (1 + 0.045/4)^{12} = £2295.05$.

**Simple interest** is constant each year — a straight line, not a curve. £2000 at 4.5% simple for 3 years: £2270.00 — less than compound, and the gap widens with time.

**AER (Annual Equivalent Rate)** is the single annual rate that would produce the same overall growth as the nominal rate compounded n times a year. From the formulae sheet:

$$r = \left(1 + \frac{i}{n}\right)^{n} - 1$$

with i and r expressed as **decimals**. Example: 6% compounded monthly → $(1.005)^{12} - 1 \approx 6.17\%$.

The AER is **higher** than the nominal rate when compounding is more frequent than annual, because each month's interest starts earning its own interest. The more often interest compounds, the larger the gap — which is the whole reason AER exists: it lets you compare accounts with different compounding frequencies honestly.

**AER is not APR.** AER is the effective rate on an investment; APR is the true cost of borrowing with charges flattened into one annual figure.

## F4 — Repayments and the cost of credit

**Cost of credit** = total repaid − amount borrowed. Borrow £1500 over 3 years with cost of credit £105.60 → total repaid £1605.60.

**APR** is the annual rate that, applied to the outstanding balance each year, gives the same total repayment as the actual loan with its fees. The formulae sheet gives $C = \sum_{k=1}^{m} \frac{A_k}{(1+i)^{t_k}}$; in practice you find APR by trial and improvement. Advertised rates are often not APR — a loan can show a low headline rate and still carry a high APR once arrangement fees are in. Always compare like with like.

| | Student loans | Mortgages |
| --- | --- | --- |
| Typical term | Long, often past 65 | 20–30 years |
| Repayment | Income-linked — a share of earnings above a threshold | Fixed monthly amount |
| Key risk | Total interest uncertain over a long life | Rates rising; negative equity |

## F5 — Graphical representation

| Graph | Shape | Reading |
| --- | --- | --- |
| Simple interest | Straight line | Constant growth each period |
| Compound interest | Curve, steepening upward | Exponential growth |
| Loan balance | Falling, flattening | Debt falls fastest at the start |
| Exchange rate | Fluctuating | Risk and unpredictability |

Label both axes with units and label the curve — an unlabelled graph loses marks even when the shape is right. Use the graph to find an approximate time or value ("when does the balance hit £X?"), then confirm algebraically if an exact figure is wanted.

## F6 — Taxation

Three taxes: **income tax** (progressive bands on earnings), **National Insurance** (a contribution on earnings, also banded), **VAT** (a percentage added to a price).

Income tax is **progressive**: each band taxes only the slice that falls inside it. Example structure (England 2024–25 — the exam's Preliminary Material prints the year's bands, which is what you quote):

| Band | Taxable slice | Rate |
| --- | --- | --- |
| Personal allowance | first £12,570 | 0% |
| Basic rate | next £37,700 | 20% |
| Higher rate | next £37,700 | 40% |
| Additional rate | above £87,940 | 45% |

Worked example on £60,000: basic slice £37,700 × 0.20 = £7,540; higher slice only above £50,270: $(60{,}000 - 50{,}270) \times 0.40 = £3{,}892$. Total £11,432. Taxing the whole salary at 40% is the classic error — and £45,000 never reaches the higher band at all (£32,430 taxable, all at 20% = £6,486).

**VAT** is a multiplier: price incl. VAT = price excl. × $(1 + \frac{\text{VAT}}{100})$. To remove it, divide: £151.68 incl. at 20% was £151.68 ÷ 1.2 = £126.40 before VAT. Subtracting 20% of the inclusive total (£121.34) is wrong — the same "subtract the percentage of the new value" error as F2.

## F7 — Solution to financial problems

**Inflation.** An index measures prices against a base of 100; inflation is the percentage change in the index. RPI includes housing costs; CPI excludes them. They are different measures of the same thing — a question may give both and ask you to compare. Inflation reduces the *real* value of money: savings below inflation are shrinking in purchasing power.

**Compound interest by iteration.** When periods are untidy, iterate in a spreadsheet: A1 = 1000, A2 = `=A1*1.05`, A3 = `=A2*1.05`, fill down — each row is one period. `=SUM(A1:A10)` and `=2*B3` are the other required spreadsheet forms. Where the exponent is unknown, use trial and improvement.

**Currency exchange.** Value in target currency = value in source × rate. **Commission** is deducted, usually as a percentage: amount received = (amount × rate) × $(1 - \frac{\text{commission}}{100})$. Order matters — deducting commission before converting gives a different answer; be explicit about the order you used.

**Budgeting.** Compare income with outgoings over a period. Take-home pay is *after* income tax and NI; regular outgoings include rent, utilities, insurance and loan repayments; savings are outgoings too, not a leftover. A budget that balances exactly has no margin for the unexpected.
