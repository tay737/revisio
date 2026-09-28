# Core Maths — Analysis of Data (3.1)

## D1 — Data

**Qualitative** data is non-numerical: hair colour, vehicle make, satisfaction rating, postcode.

**Quantitative** data is numerical, and splits two ways:

| Type | Meaning | Example | Can it take the value 1.5? |
| --- | --- | --- | --- |
| Discrete | Countable — distinct separate values | Number of visits, faults, employees | No |
| Continuous | Measurable — any value in a range | Height, time, temperature, mass | Yes |

**Primary** data is collected first-hand, for the purpose. **Secondary** data was collected by someone else for another purpose, then reused — usually already **processed**: grouped into classes, tabulated, averaged.

Ways to collect primary data, with trade-offs:

| Method | Strengths | Weaknesses |
| --- | --- | --- |
| Questionnaire / survey | Cheap, reaches many | Responses biased or misunderstood |
| Interview | Depth, follow-up | Expensive, small sample, interviewer bias |
| Observation | Records actual behaviour | Cannot measure attitudes; observer bias |
| Experiment | Controls variables | Impractical or ethically constrained |

The test for discrete vs continuous: ask whether a fraction of it makes sense. Half a person is not a real count — discrete. 15.4 cm is a real measurement — continuous. Money is the trap: it is a measurement, so continuous.

## D2 — Collecting and sampling data

A sample estimates properties of the wider **population**. Two things limit how far you can go:

- **Sampling error** — a consequence of measuring only part of the population; it shrinks as the sample grows.
- **Bias** — a *systematic* distortion. A larger biased sample is a more confidently wrong answer, not a better one.

The four methods the spec names:

| Method | How it works | Limitation |
| --- | --- | --- |
| Simple random | Every member has an equal chance (random numbers) | Impractical for large populations; needs a full list |
| Systematic | Every k-th item of the list | Biased if the list hides a periodic pattern |
| Cluster | Randomly pick whole groups, survey everyone in them | Sampled groups may not resemble the population |
| Stratified | Randomly sample within each group, in proportion | Needs the group proportions in advance |
| Quota | Fill fixed quotas, sampler chooses who | Not random — selection bias |

**Quota vs stratified** is the distinction most often examined: stratified picks randomly *within* each stratum so every member has a known chance; quota lets the sampler choose who fills each quota.

**Cost, time and accuracy:** increasing sample size reduces sampling error but costs more time and money. Removing bias needs a better *method*, not more data — though better method can also save money by avoiding wasted rework.

Stratified sample size: stratum share × total sample. Example: 130 of 1140 staff, sample of 80 → 130/1140 × 80 ≈ 9.

## D3 — Representing data numerically

| Measure | Definition | Sensitive to outliers? |
| --- | --- | --- |
| Mean | sum ÷ n | Very |
| Median (Q2) | Middle of the ordered data | No |
| Mode | Most frequent value | No |
| Range | max − min | Very |
| Quartiles Q1, Q3 | 25th and 75th percentiles | No |
| Interquartile range | Q3 − Q1 | No |
| Standard deviation | Typical spread about the mean | Very |

Standard deviation: $s = \sqrt{\frac{\sum (x - \bar{x})^2}{n}}$ — on average values lie about $s$ from the mean. On a normal distribution roughly 68% lie within one $s$ and 95% within two.

The spec requires every measure to be computable from four starting points: raw data, cumulative frequency diagrams, stem-and-leaf diagrams, and box plots. Box plots *are* the data — read the quartiles straight off.

**Choosing the right measure** (the D3.2 judgement): skewed data with an outlier pulls the mean and range away from the bulk — median and IQR are the honest summary. Symmetric data with no outliers: mean and standard deviation, which are more informative.

Cumulative frequency: Q2 is where the running total reaches 0.5n, Q1 at 0.25n, Q3 at 0.75n — draw guide lines across to the data axis. Stem-and-leaf: split each row at the stem boundary; back-to-back diagrams compare two distributions on one stem.

Do not just state the value — say what it means in context: which average is appropriate and why, what the spread says about consistency, whether an outlier changes the conclusion.

## D4 — Representing data diagrammatically

D4.1 names four diagram types: histograms (equal **and** unequal class intervals), cumulative frequency graphs, box and whisker plots, stem-and-leaf (including back-to-back).

| Data | Diagram |
| --- | --- |
| Grouped continuous data | Histogram |
| Discrete data, or frequency across a range | Bar chart — bars do not touch |
| Want median, quartiles, percentiles | Cumulative frequency graph |
| Compare two distributions in one diagram | Back-to-back stem-and-leaf, or two box plots |
| Full spread including extremes | Box and whisker plot |
| Retain the individual values | Stem-and-leaf |

**Frequency density** = frequency ÷ class width, and the **area** of each bar is the frequency. With equal widths, heights are proportional to frequency; with unequal widths they are not — divide by the width or the wider classes will be exaggerated. Example: frequencies 10, 40, 20 over widths 5, 10, 20 give densities 2, 4, 1 — the middle bar is tallest.

Bars **touch** in a histogram (the variable is continuous); a bar chart for discrete data has gaps.

The shape of a cumulative frequency graph shows the distribution: rising fastest through the middle means roughly symmetric; a long tail to the right means positive skew.
