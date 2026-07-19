# Perturbation Log

For each system, make one deliberate change to an input or configuration, predict the outcome, run
it, and record what actually happened. See the starters in the Instructions, or design your own (your
own experiment earns more credit).

---

### System 1 — validated, routed pipeline

- **Change I made (file + what I changed):** In the copied input file
  `perturbation-input/POL-2025-006.txt`, I removed the line stating the annual premium
  (`Annual Premium ... $612.50`). The original document in `data/policies/` was left unchanged.
- **Command I ran:**
  `policy-extractor pipeline perturbation-input/ --routing-out "../../../evidence/01-policy-pipeline/perturbed-routing-decisions.json" --seed 42`
- **What I predicted:** Removing the Annual Premium line would produce
  `premium_amount = null`, trigger a `missing_source` validation error, and immediately
  escalate the policy without retrying or inventing a value.
- **What actually happened (key output):** The API request completed successfully with
  `HTTP/1.1 200 OK`, followed by `validation_failed`. The run reported
  `"decisions_written": 0` and `"escalations": 1`. Its pattern summary recorded
  `"premium_amount_absent"` with `"count": 1`, policy `"POL-2025-006"`, and category
  `"missing_source"`. The perturbed routing-decisions file was therefore an empty list,
  because the policy escalated during validation before a routing decision was created.
- **How this differs from the unperturbed run:** In the unperturbed run, `POL-2025-006`
  reached the routing stage with `premium_amount` confidence `1.0` and received a
  `human_review` decision because the reviewer disagreed about `deductible`. After the
  premium was removed, the policy no longer reached routing: it produced one
  `missing_source` escalation for the absent premium and no routing decision. This matches
  the prediction and shows that the pipeline did not invent the missing value.

---

### System 2 — schema-enforced two-pass extraction

- **Change I made (file + what I changed):** Temporarily changed
  `mortgage_extractor/config.py` so `DEFAULT_TOLERANCE_USD` was `1250.00` rather
  than `1.00`. I restored the original `$1` tolerance immediately after the run.
- **Command I ran:**
  `mortgage-extract fixtures/documents/income_sum_mismatch.txt --mode replay`
- **What I predicted:** The extracted values and `$1,250.00` delta would be unchanged,
  but the validator would incorrectly report the document as consistent. The comparison
  is strict (`abs(delta) > tolerance`), so a delta equal to the inflated tolerance would
  not create a discrepancy.
- **What actually happened (paste the key output line):** The perturbation retained
  `stated_monthly_total: 10892.17` and the same component values, but returned
  `"consistent": true` with `"discrepancies": []` and exit code 0.
- **How this differs from the unperturbed run:** With the normal `$1` tolerance, the
  same replay returned `"consistent": false`, calculated `$9,642.17` versus stated
  `$10,892.17`, emitted `"delta": -1250.0`, and exited 1. This demonstrates that
  validator thresholds must be monitored and change-controlled: valid schema and stable
  model output do not protect against an unsafe validation configuration.

---

### System 3 — multi-source synthesis

- **Change I made (file + what I changed):** Enabled the coordinator's
  `--simulate-timeout` configuration, which deliberately makes the logistics reader
  time out while leaving the other readers unchanged.
- **Command I ran:**
  `supply-chain-investigate meridian --offline --simulate-timeout`
- **What I predicted:** The run would still finish successfully, explicitly identify
  logistics as unavailable, preserve claims from the remaining sources, and classify
  logistics-only metrics as Incomplete rather than treating them as absent facts.
- **What actually happened (paste the key output line):** The command exited 0 and the
  briefing opened with `Sources unavailable: logistics unavailable (timeout)`. Under
  Incomplete it reported `late_shipment_count [missing source: timeout reading logistics]`.
- **How this differs from the unperturbed run:** The normal run used logistics evidence
  (`11.0 shipments`) and placed `late_shipment_count` under Well-Established. It also
  placed `on_time_delivery_rate` under Contested because supplier audit reported `95.0%`
  and logistics reported `78.0%`. With logistics unavailable, late shipments became
  Incomplete and the delivery-rate conflict disappeared, leaving only the audit's `95.0%`
  as single-source evidence. The explicit timeout annotation prevents missing evidence
  from being mistaken for “nothing to report.”
