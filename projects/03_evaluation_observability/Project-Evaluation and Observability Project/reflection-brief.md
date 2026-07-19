# Reflection Brief — Evaluation and Observability Capstone

**Name:** Samuel H.Mariam
**Date:** 2026-07-17

> Ground every answer in your own run. When a question asks for a number, file name, or line, paste
> it from your artifacts — a reviewer should be able to find it. Answers that are correct in the
> abstract but cite nothing do not meet the bar. Keep it short and specific.

---

## 0. Environment

| Field | Value |
|---|---|
| OS & version | Microsoft Windows 11 Home, version 10.0.26200, 64-bit |
| Python version | Python 3.12.11 |
| Date run | 2026-07-17 |
| Ran any system live? (which) | System 1 policy pipeline (live API); Systems 2 and 3 in replay/offline mode |

---

## 1. Validated, routed pipeline

| Evidence | Value |
|---|---|
| Passing test count | 45 passed, 3 skipped (`evidence/01-policy-pipeline/tests.txt`) |
| Routing output file | `evidence/01-policy-pipeline/routing_decisions.json` |
| auto_approve / human_review / spot_check counts | 0 / 8 / 1 |

**1a. Retry boundary.** From your perturbation run (a required field removed), paste the escalation
record. How many API calls did the system make, and why is retrying a futile case worse than
escalating it?

> `evidence/01-policy-pipeline/perturbation-run.txt` records one `HTTP/1.1 200 OK`,
> then `validation_failed`, `"escalations": 1`, and the escalation pattern
> `"premium_amount_absent"` for `POL-2025-006` with category `"missing_source"`.
> The system made one API call. Because the premium was genuinely removed from the source,
> another model call cannot recover it; retrying would add cost and another opportunity to
> fabricate a value, while escalation preserves the missing-evidence fact.

**1b. Reading the router.** Pick one `human_review` record from your routing output. Which of the
three signals (confidence, reviewer, integration) sent it to a human? If you had trusted the model's
confidence alone, what would have happened?

> In `evidence/01-policy-pipeline/routing_decisions.json`, `POL-2025-002` is
> `human_review` even though every confidence is at least `0.95`, there are no
> `fields_below_threshold`, and there are no `integration_failures`. The independent
> reviewer signal drove the decision by disagreeing on `coverage_limit`, `deductible`, and
> `endorsements`. Trusting model confidence alone would have auto-approved this record and
> shipped the disputed fields.

**1c. Where the aggregate lies.** Run the calibration snippet. Quote the one cell whose accuracy lags
its confidence, plus the overall figure. What does slicing by `policy_type × field` catch that a
single number hides?

> `evidence/01-policy-pipeline/calibration-report.txt` shows
> `umbrella exclusions n=2 conf=0.93 acc=0.00 brier=0.865`, while the overall Brier
> score is `0.291`. The aggregate blends this systematically overconfident, always-wrong
> cell with accurate auto-premium and home-deductible cells; slicing by
> `policy_type × field` exposes exactly where confidence is unreliable.

---

## 2. Schema-enforced two-pass extraction

| Evidence | Value |
|---|---|
| Passing test count | 25 (`evidence/02-mortgage/tests.txt`) |
| Document run | `evidence/02-mortgage/extract-run.txt` |
| Classified type | `appraisal` |

**2a. Two guarantees.** Paste your discrepancy-run output. Tool use already forces valid JSON, yet the
validator still catches a bad sum. Why are these two different guarantees? Name one error each cannot
catch.

> In `evidence/02-mortgage/discrepancy-run.txt`, the schema-valid extraction still
> produces `calculated: 9642.17`, `stated: 10892.17`, and `delta: -1250.0`, so the
> validator reports `consistent: false`. Tool use guarantees that the response has the
> required JSON shape and types, but it cannot guarantee that values copied from a source
> are mutually consistent. Conversely, the arithmetic validator catches this bad sum but
> cannot detect a correctly summed fabricated value or a wrong borrower name.

**2b. Refusing to fabricate.** Run on a document missing a field. Paste that field's output. Why null
instead of an invented value? Point to the schema choice that allows it.

> `evidence/02-mortgage/missing-field-run.txt` contains `"bonus_monthly": null` (and
> `"bonus_ytd": null`). Null preserves the distinction between “not stated” and a stated
> zero; inventing zero would turn missing evidence into a false fact. The extraction schema
> permits this because these fields are nullable (`number` or `null`).

**2c. Normalization.** Quote one field where the source text and extracted value differ in format
("about 2,400 sq ft" → `2400`). Why normalize at extraction time rather than downstream?

> The source in `fixtures/documents/appraisal_informal_sqft.txt` says `Gross Living Area:
> approximately 2,400 sq ft`, while `evidence/02-mortgage/extract-run.txt` records
> `"gross_living_area_sqft": 2400`. Normalizing at the extraction boundary gives every
> downstream consumer one typed, comparable representation and avoids duplicated parsing
> rules that could disagree.

---

## 3. Multi-source synthesis

| Evidence | Value |
|---|---|
| Passing test count | 34 (`evidence/03-supply-chain/tests.txt`) |
| Briefing file | `evidence/03-supply-chain/briefing.txt` |
| Section the conflict landed in | `Contested` |

**3a. Annotate, don't arbitrate.** Quote one conflicting-metric pair from your briefing — both values,
sources, dates. Give one way a reader is better served by the preserved conflict than by a single
reconciled number.

> In `evidence/03-supply-chain/investigation-run.txt`, `on_time_delivery_rate`
> is preserved as `95.0 percent — supplier_audit (as of 2026-04-10)` and
> `78.0 percent — logistics (as of 2026-04-05)`. Keeping both lets a reader see
> that the disagreement may reflect source method or timing and investigate it; a single
> reconciled number would conceal the operational risk and its provenance.

**3b. Source goes dark.** Run with `--simulate-timeout`. Paste the part of the briefing showing the
failed source. How is "unreachable" handled differently from "nothing to report," and why does the run
still finish?

> `evidence/03-supply-chain/timeout-run.txt` begins `Sources unavailable: logistics
> unavailable (timeout)` and reports `late_shipment_count [missing source: timeout
> reading logistics]` under Incomplete. “Unreachable” is recorded as a coverage failure,
> not converted into a claim that there were no late shipments. The coordinator isolates
> the failed reader and continues synthesizing audit, quality, and news evidence, so the
> command still exits 0 with a useful but explicitly incomplete briefing.

**3c. Dates as a guardrail.** Quote two claims about the same supplier with different dates. How does
requiring a date stop a time difference from reading as a contradiction?

> In `evidence/03-supply-chain/investigation-run.txt`, Meridian's
> `on_time_delivery_rate` is `95.0 percent` from supplier audit as of `2026-04-10`
> and `78.0 percent` from logistics as of `2026-04-05`. Required dates
> expose that the observations are from different snapshots. That prevents a genuine
> change over five days from automatically being read as a same-time contradiction,
> while still preserving the pair for review.

---

## 4. Synthesis

**4a. One principle.** Name the single moment in your runs (system + artifact) where *evaluate the
output, don't trust the model's word* most clearly caught something a trusting design would have
shipped.

> System 2 is the clearest example. In `evidence/02-mortgage/discrepancy-run.txt`, the
> model produced a schema-valid extraction with `stated: 10892.17`, but the deterministic
> validator recomputed `calculated: 9642.17` and surfaced `delta: -1250.0`. A design that
> accepted valid structured output as proof of correctness would have shipped a materially
> inconsistent monthly-income total.

**4b. Confidence ≠ correctness.** Pick the system where this mattered most, and explain why using
something you observed.

> It mattered most in System 1. `evidence/01-policy-pipeline/routing_decisions.json`
> shows `POL-2025-002` with every confidence at or above `0.95`, yet the independent
> reviewer disagreed on three fields and forced `human_review`. The calibration evidence
> reinforces the same lesson: `evidence/01-policy-pipeline/calibration-report.txt` has an
> `umbrella × exclusions` cell with confidence `0.93` but accuracy `0.00`. Confidence is
> useful telemetry, not a correctness guarantee or a sufficient approval gate.

**4c. Apply it.** Describe a real workflow where an LLM pulls structured results from messy input.
Which pattern — validated retry with escalation, independent review with deterministic routing, or
provenance-preserving conflict annotation — would you reach for first, and what would you instrument
to know when it broke?

> For extracting invoice headers and line items from emailed PDFs, I would start with
> validated retry with escalation: validate required supplier/invoice fields, recompute line-item
> totals and tax, retry only repairable format failures with validation feedback, and escalate
> genuinely absent or inconsistent source data. System 2's
> `evidence/02-mortgage/discrepancy-run.txt` shows why arithmetic checks belong outside the
> model, while System 1's `evidence/01-policy-pipeline/perturbation-run.txt` shows why a
> missing-source case should escalate after one call rather than invite fabrication. I would
> instrument validation failures by category, retries and calls per document, escalation rate,
> field-level null rate, calculated-versus-stated deltas, latency, and cost. I would also retain
> source provenance so an upstream outage is distinguishable from zero results, as demonstrated
> by `evidence/03-supply-chain/timeout-run.txt` marking `logistics unavailable (timeout)`.
