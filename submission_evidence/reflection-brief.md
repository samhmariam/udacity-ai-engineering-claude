# Reflection Brief

## Evidence Index

- Claims intake tests: `submission_evidence/claims_intake/test_results.txt`
- Claims intake run summary: `submission_evidence/claims_intake/summary.md`
- Claims intake trace sample: `submission_evidence/claims_intake/claim_01_kitchen_fire_trace.jsonl`
- Retail context tests: `submission_evidence/retail_context/test_results.txt`
- Retail context budget: `submission_evidence/retail_context/budget.json`
- Retail context evals: `submission_evidence/retail_context/eval.jsonl` and `submission_evidence/retail_context/eval_control.jsonl`
- Claude Code config evidence: `submission_evidence/ecommerce_config/CLAUDE.md`, `submission_evidence/ecommerce_config/config_output.txt`, `submission_evidence/ecommerce_config/claude_structure.txt`, `submission_evidence/ecommerce_config/claude_rules_frontmatter.txt`, `submission_evidence/ecommerce_config/review_command.txt`, `submission_evidence/ecommerce_config/skill_config.txt`
- Shift monitor evidence: `submission_evidence/shift_monitor/test_results.txt`, `submission_evidence/shift_monitor/shift_output.txt`, `submission_evidence/shift_monitor/hot_state_size.txt`, `submission_evidence/shift_monitor/defect_counts.txt`

## 1. Environment Verification

I verified all four solution environments and saved the output in the evidence folder.

- Claims intake passed all tests: `29 passed in 0.26s`.
  Evidence: `submission_evidence/claims_intake/test_results.txt`
- Retail context collected 30 tests, with `28 passed, 2 skipped in 5.93s`.
  Evidence: `submission_evidence/retail_context/test_results.txt`
- Claude Code config passed all tests: `35 passed in 2.01s`.
  Evidence: `submission_evidence/ecommerce_config/test_results.txt`
- Shift monitor passed all tests: `33 passed in 2.89s`.
  Evidence: `submission_evidence/shift_monitor/test_results.txt`

I also hit two environment issues while running the work. First, Windows long paths caused a `uv sync` install failure for the claims exercise until I used a short virtual environment path. Second, the claims project needed an `httpx<0.28` compatibility pin because `anthropic==0.39.0` is incompatible with `httpx==0.28.1`.
Evidence: `submission_evidence/claims_intake/test_results.txt`

The automated suites guarantee behavior that a single manual run cannot prove. For example, the shift monitor tests cover tiered state, invocation shape, crash recovery, and fork scratchpad behavior across 33 cases; a single shift-C run only proves that one recorded response completed. Likewise, the Claude Code config tests exercise hierarchy, path-scoped rules, command behavior, skill configuration, and plan-mode documentation, while manual inspection would only show that the files exist.
Evidence: `submission_evidence/shift_monitor/test_results.txt`, `submission_evidence/ecommerce_config/test_results.txt`

## 2. Claims Intake Agentic Loop

The claims intake run used model `claude-haiku-4-5-20251001`, processed 8 fixtures, and estimated total cost at `$0.1347` USD.
Evidence: `submission_evidence/claims_intake/summary.md`

The stop-reason loop behavior is visible in the trace sample. Turn 1 stopped on `tool_use` and produced tool calls including `lookup_policy` and `record_claim_fact`; turn 2 stopped on `end_turn` with no tool calls. This confirms the loop continued when the model requested tools and stopped when the model ended the turn.
Evidence: `submission_evidence/claims_intake/claim_01_kitchen_fire_trace.jsonl`

Loop termination is decided in `claims_intake/loop.py`, function `run()`. That function returns a `FinalState` when `response.stop_reason == "end_turn"`, continues after executing tools when `response.stop_reason == "tool_use"`, and raises `UnexpectedStopReason` for any other value. The anti-pattern it avoids is parsing assistant text to infer whether the model is done; control flow is based on the structured `stop_reason` field instead.
Evidence: `projects/01_harness_engineering/Build a Claims Intake Agent with a stop_reason-Driven Loop/exercises/03-dynamic-decomposition/solution/claims_intake/loop.py`, `submission_evidence/claims_intake/claim_01_kitchen_fire_trace.jsonl`

The run did not fully meet the "each claim routes or escalates" standard. Five claims routed successfully: `claim_02_stolen_bike`, `claim_03_water_damage`, `claim_04_neighbor_injury`, `claim_05_auto_collision`, and `claim_08_minor_porch_damage`. Three claims were marked `incomplete`: `claim_01_kitchen_fire`, `claim_06_low_confidence_escalation`, and `claim_07_tree_falls_on_car`.
Evidence: `submission_evidence/claims_intake/summary.md`

Because of that, I would submit this as evidence of the loop mechanics and partial fixture completion, but I would not claim the claims run fully satisfied Task 2 until those incomplete cases are rerun or fixed.
Evidence: `submission_evidence/claims_intake/summary.md`

## 3. Retail Context Strategy

The context strategy reduced the prompt from `38,708` baseline tokens to `16,834` assembled tokens, a `56.51%` reduction. That clears the required threshold of at least 50%.
Evidence: `submission_evidence/retail_context/budget.json`

The assembled evaluation answered all six questions correctly. The passing file contains `passed: true` for Q1 through Q6, including refund amount `$22.14`, duplicate-charge cancellation reason, `AVS_MISMATCH`, card last four `7782`, the prorated refund, and exact status token `in_progress`.
Evidence: `submission_evidence/retail_context/eval.jsonl`

The control regressed on Q6. It answered with "Active issue: Payment-method update" instead of the expected exact status token `in_progress`, and the record has `passed: false`.
Evidence: `submission_evidence/retail_context/eval_control.jsonl`

The result shows why the structured case facts matter: compression reduced the token budget while preserving exact operational fields that a long raw conversation can cause the model to paraphrase incorrectly.
Evidence: `submission_evidence/retail_context/budget.json`, `submission_evidence/retail_context/eval.jsonl`, `submission_evidence/retail_context/eval_control.jsonl`

The summarized information was the resolved refund inquiry and resolved subscription cancellation. Those are the compressible middle sections, represented in `budget.json` as `resolved_refund: 394` tokens and `resolved_subscription: 465` tokens after compression. The preserved verbatim information was the active payment-method update, represented as `active: 15789` tokens, because it contains the current unresolved issue, exact error code, card last-four, and status details the next assistant turn must reason over. The top case-facts block was also preserved as structured facts in `204` tokens so exact values such as `$22.14`, `duplicate_charge`, `7782`, and `in_progress` survive compression.
Evidence: `submission_evidence/retail_context/budget.json`, `projects/01_harness_engineering/Engineer a Long-Conversation Context Strategy for a Retail Support Copilot/04-assemble-and-locate/solution/retail_context/assemble.py`, `projects/01_harness_engineering/Engineer a Long-Conversation Context Strategy for a Retail Support Copilot/04-assemble-and-locate/solution/retail_context/compressor.py`

## 4. Claude Code Configuration

The config validator returned `OK`.
Evidence: `submission_evidence/ecommerce_config/config_output.txt`

The project-level `CLAUDE.md` uses `@` imports to pull in modular standards for frontend, API, database, and testing guidance.
Evidence: `submission_evidence/ecommerce_config/CLAUDE.md`

The `.claude/` structure was captured in `claude_structure.txt`, and the supporting files show the required configuration pieces.
Evidence: `submission_evidence/ecommerce_config/claude_structure.txt`

The path-scoped rules include YAML frontmatter with `description` and `paths` fields for API handlers, React components/pages, and test files.
Evidence: `submission_evidence/ecommerce_config/claude_rules_frontmatter.txt`

The `/review` command exists and defines a project-scoped PR review flow with an `allowed-tools` allowlist restricted to read-oriented tools and git/gh inspection commands.
Evidence: `submission_evidence/ecommerce_config/review_command.txt`

The deploy-check skill uses `context: fork`, which keeps verbose deployment inspection out of the main session, and includes `allowed-tools` lines for read-only file, grep, glob, git, and GitHub PR checks.
Evidence: `submission_evidence/ecommerce_config/skill_config.txt`

A path-scoped rule is preferable to a directory-level `CLAUDE.md` when conventions span the codebase because glob frontmatter can apply the same rule to matching files wherever they live. This matters for tests: `**/*.test.ts` and `**/*.test.tsx` can be covered across API, UI, and shared modules without duplicating instructions in many directories. The deploy-check skill runs in a forked context because its file enumeration, diff inspection, and CI checks can produce noisy intermediate output; `context: fork` keeps that exploration isolated and returns only the final pass/fail summary.
Evidence: `submission_evidence/ecommerce_config/CLAUDE.md`, `submission_evidence/ecommerce_config/claude_rules_frontmatter.txt`, `submission_evidence/ecommerce_config/skill_config.txt`

## 5. Shift Monitor Orchestrator

The shift monitor test suite passed with `33 passed in 2.89s`.
Evidence: `submission_evidence/shift_monitor/test_results.txt`

The orchestrator run processed shift C and produced the recorded response summary: `shift C: 0 new defects`, followed by the summary for shift C on `2026-04-30`, including `3 high + 2 medium defects on capacitor-bank-C-7` and one low VP-4 vent squeal.
Evidence: `submission_evidence/shift_monitor/shift_output.txt`

The generated hot state file size was `658` bytes.
Evidence: `submission_evidence/shift_monitor/hot_state_size.txt`

The warm-tier database held `40` total defects, while the shift output returned `0` new defects for the current run. This demonstrates the orchestrator using the warm tier as history while keeping only the current hot state small.
Evidence: `submission_evidence/shift_monitor/defect_counts.txt`, `submission_evidence/shift_monitor/shift_output.txt`, `submission_evidence/shift_monitor/hot_state_size.txt`

The SQL-filtered slice is implemented in `shift_monitor/warm.py`, function `WarmStore.defects_since()`, which queries `SELECT * FROM defects WHERE ts > ? ORDER BY ts DESC LIMIT ?`. The shift pipeline calls that through `shift_monitor/pipeline.py`, function `gather_new_defects()`, instead of loading the full warm history into the prompt.
Evidence: `projects/01_harness_engineering/Build a Multi-Shift Quality Monitoring System with Claude Orchestration/04-fork-scratchpad/solution/shift_monitor/warm.py`, `projects/01_harness_engineering/Build a Multi-Shift Quality Monitoring System with Claude Orchestration/04-fork-scratchpad/solution/shift_monitor/pipeline.py`, `submission_evidence/shift_monitor/defect_counts.txt`

Crash recovery is decided in `shift_monitor/recovery.py`, function `decide()`. It returns `fresh` when there are no manifest steps or the manifest is already complete; otherwise it returns `resume` only when the last step is no older than `STALE_RESUME_THRESHOLD_MINUTES`, which is set to `30`. Older partial work is treated as stale and restarted fresh. Fork isolation is implemented in `shift_monitor/fork.py`, function `fork_for_hypothesis()`, which copies the base `hot_state.json` into a hypothesis-specific directory so investigation state stays separate from the main state; `merge_findings()` later appends only selected scratchpad findings back to the main scratchpad.
Evidence: `projects/01_harness_engineering/Build a Multi-Shift Quality Monitoring System with Claude Orchestration/04-fork-scratchpad/solution/shift_monitor/recovery.py`, `projects/01_harness_engineering/Build a Multi-Shift Quality Monitoring System with Claude Orchestration/04-fork-scratchpad/solution/shift_monitor/fork.py`

## 6. Evidence Organization

I organized the evidence into one folder per system under `submission_evidence/`:

- `claims_intake/`
- `retail_context/`
- `ecommerce_config/`
- `shift_monitor/`

Each folder contains the test log plus the key artifacts needed to explain the run result.
Evidence: `submission_evidence/`

## 7. Cross-Project Synthesis

The Model layer appears where natural-language instructions shape model behavior. In the claims system, `claims_intake/system_prompt.py` tells the model to gather facts, choose exactly one terminal action, then stop after a brief confirmation. In the retail context system, `retail_context/prompts/compression_prompt.md` tells the model how to summarize resolved segments while preserving IDs, numeric values, and status codes.
Evidence: `projects/01_harness_engineering/Build a Claims Intake Agent with a stop_reason-Driven Loop/exercises/03-dynamic-decomposition/solution/claims_intake/system_prompt.py`, `projects/01_harness_engineering/Engineer a Long-Conversation Context Strategy for a Retail Support Copilot/04-assemble-and-locate/solution/retail_context/prompts/compression_prompt.md`

The Harness layer appears where code wraps model calls with control flow, tools, budgets, tracing, and validation. In the claims system, `claims_intake/loop.py::run()` enforces `stop_reason` control flow and writes turn traces; the submitted trace shows `tool_use` on turn 1 and `end_turn` on turn 2. In the retail context system, `retail_context/run.py` records `budget.json`, `eval.jsonl`, and `eval_control.jsonl` for the run.
Evidence: `projects/01_harness_engineering/Build a Claims Intake Agent with a stop_reason-Driven Loop/exercises/03-dynamic-decomposition/solution/claims_intake/loop.py`, `submission_evidence/claims_intake/claim_01_kitchen_fire_trace.jsonl`, `submission_evidence/retail_context/budget.json`

The Orchestration layer appears where the system manages state across invocations and isolates work. In the shift monitor, `shift_monitor/pipeline.py` coordinates SQL-filtered warm state, hot state, scratchpad writes, and the model response; `shift_monitor/recovery.py` handles resume-vs-fresh decisions; and `shift_monitor/fork.py` isolates hypothesis work by copying `hot_state.json` into fork-specific directories.
Evidence: `projects/01_harness_engineering/Build a Multi-Shift Quality Monitoring System with Claude Orchestration/04-fork-scratchpad/solution/shift_monitor/pipeline.py`, `projects/01_harness_engineering/Build a Multi-Shift Quality Monitoring System with Claude Orchestration/04-fork-scratchpad/solution/shift_monitor/recovery.py`, `projects/01_harness_engineering/Build a Multi-Shift Quality Monitoring System with Claude Orchestration/04-fork-scratchpad/solution/shift_monitor/fork.py`

Deterministic enforcement belongs in code when a violation would break correctness. One example is `claims_intake/loop.py::run()`: it only continues on `tool_use`, returns on `end_turn`, and raises `UnexpectedStopReason` otherwise. Prompt-based guidance belongs where the model must exercise judgment. One example is `claims_intake/system_prompt.py`, which tells the model how to classify, clarify, route, or escalate a claim, but the actual terminal state is only counted when the harness sees a route or escalation in `summary.md`.
Evidence: `projects/01_harness_engineering/Build a Claims Intake Agent with a stop_reason-Driven Loop/exercises/03-dynamic-decomposition/solution/claims_intake/loop.py`, `projects/01_harness_engineering/Build a Claims Intake Agent with a stop_reason-Driven Loop/exercises/03-dynamic-decomposition/solution/claims_intake/system_prompt.py`, `submission_evidence/claims_intake/summary.md`

Context management differs between the retail context system and the shift orchestration system. Retail context compresses one long conversation into a prompt: `budget.json` shows `38,708` baseline tokens reduced to `16,834` assembled tokens, a `56.51%` reduction, while preserving a `204` token case-facts block and a `15,789` token active issue verbatim. Shift orchestration manages context as state tiers: `hot_state.json` stayed at `658` bytes, the warm SQLite tier held `40` defects, and the shift run returned `0` new defects from the SQL-filtered slice for that invocation. Retail is token-budget compression inside one prompt; shift monitor is state selection across runs.
Evidence: `submission_evidence/retail_context/budget.json`, `submission_evidence/shift_monitor/hot_state_size.txt`, `submission_evidence/shift_monitor/defect_counts.txt`, `submission_evidence/shift_monitor/shift_output.txt`

## 8. Final Assessment

The strongest completed systems are the retail context strategy, Claude Code configuration, and shift monitor orchestrator. Their tests passed, and their run artifacts directly satisfy the required evidence checks.
Evidence: `submission_evidence/retail_context/test_results.txt`, `submission_evidence/ecommerce_config/config_output.txt`, `submission_evidence/shift_monitor/shift_output.txt`

The claims intake system has passing tests and trace evidence for the `stop_reason` loop, but the live run summary shows three incomplete claims. I would flag that as the remaining submission risk and either rerun the claims agent or investigate why those three cases ended without a terminal route/escalation tool call before claiming full completion of Task 2.
Evidence: `submission_evidence/claims_intake/summary.md`, `submission_evidence/claims_intake/claim_01_kitchen_fire_trace.jsonl`
