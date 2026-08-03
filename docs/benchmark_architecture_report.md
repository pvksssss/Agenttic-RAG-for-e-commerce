# Benchmark Architecture Report — Agentic RAG E-commerce

## 1. Goal

The benchmark answers: *does the agent call the right tools with the right arguments, retrieve real data, and produce answers that match ground truth?*

It is split into two main modules:

- `ecommerce_benchmark_generator.py` — generates the test set.
- `benchmark_evaluator.py` — scores agent behavior and answers.

## 2. Generator architecture (`ecommerce_benchmark_generator.py`)

### 2.1 Input

- `ProductCatalog` — loaded from Supabase `products` table (or a local limit for speed).
- `GeminiLLM` — a thin wrapper over `google.genai` with key rotation.
- `user_token` / `current_user_id` — used to validate `order_lookup` and to produce realistic order-account test cases.

### 2.2 Question categories

| Category | What it tests | Typical expected tool call |
|---|---|---|
| `single_spec` | One specific spec/price/stock of one product | `product_search` with `limit=1`, `include_details` or `need_price_info` |
| `lines` | List product lines/series | `product_search` with `mode="lines"` |
| `lines_specs` | List lines + ask specs | `product_search` with `mode="lines"`, `include_details=True` |
| `top_n` | Top-N recommendation with filters | `product_search` with `limit=N` and price/brand filters |
| `combined_or` | Two independent product conditions combined with OR | `product_search` with two items in `queries` |
| `compare` | Compare named products | `product_compare` |
| `ambiguous` | Vague request; agent should clarify | no tool call (or fallback) |
| `multi_turn` | 2-5 turn conversation reusing context | sequential `product_search` calls |
| `hard` | Out-of-stock / contradictory / noisy queries | `product_search` with fallback query |
| `order_account` | Order/status lookup | `order_lookup` |
| `risk_ticket` | Borderline / complaint / sensitive query | `policy_search` or no tool |
| `attack` | Prompt injection / jailbreak | guardrail rejection, no tool |
| `compound` | Product query + policy question | `product_search` + `policy_search` |

### 2.3 Record schema (JSONL)

```json
{
  "id": "...",
  "category": "single_spec",
  "question": "Con này dùng chip gì?",
  "expected_tool_calls": [
    {"tool": "product_search", "args": {"queries": [{"keyword": "chip", "name_contains": "...", "limit": 1, ...}]}}
  ],
  "ground_truth": {
    "answer_summary": "...",
    "product_ids": [...],
    "tool_outputs": [...]
  },
  "turns": null
}
```

For `multi_turn` records, `turns` is a list of `{question, expected_tool_calls, ground_truth}`.

### 2.4 Generation steps

1. Build a parameter skeleton (`brand`, `category`, `product_name`, `info_key`, `limit`, `mode`, etc.) by sampling the catalog.
2. Ask `GeminiLLM` to rewrite the skeleton into a natural Vietnamese user question (few-shot examples per category).
3. Determine expected tool call(s) directly from the skeleton (not from the LLM) so ground truth is deterministic.
4. Run the expected tool calls against the real tools to obtain real product/order IDs and formatted outputs.
5. Use the real tool outputs to generate `ground_truth.answer_summary`.

### 2.5 Verification script

`generate_and_verify_20each.py` (and `verify_bench_jsonl.py`) run each `expected_tool_call` through the real functions and compare returned IDs to `ground_truth.product_ids`. The latest 20-each run produced **322/322 matches**, confirming ground truth is aligned with real tool behavior.

### 2.6 Known fixes applied

- `name_contains` now uses `_clean_line_key` (strip specs/SKU) while `keyword` keeps the full product name for exact matching.
- `limit` is set explicitly per category (1 for single spec, N for top-N, 3-8 for listing).
- `lines` parsing now handles `Đại diện:` and `|` separators in product names.

## 3. Evaluator architecture (`benchmark_evaluator.py`)

### 3.1 Metrics

- `faithfulness` — is the answer supported by contexts? (custom judge)
- `answer_correctness` — does the answer match ground truth? (custom judge)
- `answer_relevancy` — is the answer relevant to the question? (custom judge)
- `context_precision` / `context_recall` — RAGAS + custom judge
- `tool_selection_accuracy` — did the agent call the right tool name?
- `tool_arg_accuracy` — fuzzy match of tool arguments (keyword, brand, category, name_contains, limit, price, mode, flags)
- `e2e_score` — weighted aggregate of the above
- `latency`, `token_usage`, `failed_invocations`

### 3.2 Row building (`_build_rows`)

- For single-turn records: one eval row per record.
- For multi-turn records: one eval row **per turn**; `contexts` uses **only the current turn's `tool_outputs`** (not the cumulative list) to avoid RAGAS penalizing previous turns.
- `cumulative_contexts` is kept for debugging.

### 3.3 Tool argument matching (`_match_query`)

Each expected-vs-actual query is compared field-by-field:

- `keyword` — normalized token overlap / F1
- `brand` / `category` — exact match with fallback if brand/category is recoverable from `name_contains` or `keyword`
- `name_contains` — overlap
- `min_price` / `max_price` — numeric proximity
- `limit` — continuous partial score (e.g., expected 5, actual 3 → 0.6)
- `include_details`, `need_price_info`, `mode` — exact bool/enum

Weighted average gives `tool_arg_accuracy` in `[0,1]`.

### 3.4 Custom judge (`JudgeLLM`)

A Groq-backed judge prompts the LLM to score each metric on a 0-1 scale with a short reason. It is faster and cheaper than RAGAS but still language-model based.

### 3.5 RAGAS runner (`RAGASRunner`)

Wraps `ragas.evaluate` with `HuggingFaceEmbeddings` and a Gemini LLM. The latest runs hit Gemini free-tier quota (`429 RESOURCE_EXHAUSTED`), so full RAGAS evaluation is currently blocked on API limits.

## 4. Benchmark execution pipeline

```
generate_all(counts)  →  JSONL test set
        │
        ▼
verify expected_tool_calls vs real tools  →  fix generator mismatches
        │
        ▼
run agent on test set (07 workflow / baseline notebooks)
        │
        ▼
raw_results.jsonl  →  BenchmarkEvaluator.evaluate
        │
        ▼
aggregate_report.json + per_row_scores.csv
```

## 5. Baselines for comparison

| Notebook | Architecture | Strength | Weakness |
|---|---|---|---|
| `07_A_basic_rag_baseline` | Vector retrieval + 1 LLM call | Simple, fast | No real-time SQL, no tool accuracy, weak on exact specs/prices |
| `07_B_single_tool_baseline` | Rule router + 1 tool + 1 LLM call | Gets real product/policy/order data | No multi-turn context reuse, no agent planning, one-shot only |
| `07_01_workflow1` | Full flat ReAct agent with skills | Tool loops, memory, skill injection, auth | Higher latency, depends on tool schema / prompt quality |

On the first 10 `single_spec` sample rows:

- `07_A` e2e ≈ **0.22** (tool arg accuracy = 0 because retriever ≠ expected `product_search` parameters, but answer correctness ≈ 0.65 because vector context still contains product info).
- `07_B` is expected to be higher on tool-arg/answer because it uses `product_search` directly; full evaluation blocked by Groq TPD rate limit.

## 6. Key take-aways

- The benchmark ground truth is now **clean and verified** against real tool outputs.
- Remaining score gaps are mostly **agent behavior**, not benchmark errors:
  - `multi_turn` (e2e ~0.51) — agent reuses context instead of re-running expected per-turn tool calls.
  - `combined_or` (tool arg ~0.44) — agent tends to merge two expected queries into one.
  - `compound` / `risk_ticket` — tool parameters deviate from ground truth while final answer is often still correct.
- RAGAS `context_precision/recall` for `multi_turn` is noisy unless contexts are isolated per turn (which the evaluator now does).
