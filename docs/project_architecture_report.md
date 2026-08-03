# Project Architecture Report — Agentic RAG for E-commerce

## 1. Overview

This repository implements an **Agentic RAG chatbot** for Vietnamese e-commerce customer service. It combines:

- **Next.js frontend** (`web_ui/`) — chat interface, cart, product browsing.
- **Python backend** (`rag-service/`) — ingestion, indexing, retrieval, tools, agent graph, benchmark.
- **Supabase** — Postgres relational DB with RLS for products, orders, policies; also used as auth server.
- **ChromaDB** — local vector store for product/policy chunks.
- **Gemini / Groq** — Gemini is the main agent LLM; Groq is used for the custom judge and evaluation.

## 2. High-level data flow

```
User query (Vietnamese)
       │
       ▼
┌─────────────────┐
│  GuardrailNode  │  → classify risk: safe / ticket / attack
└─────────────────┘
       │ safe
       ▼
┌─────────────────┐
│   MasterAgent   │  → ReAct loop with function calling
│  (single node)  │
└─────────────────┘
       │
       ├──► product_search  ──► Supabase SQL + Chroma semantic
       ├──► product_compare ──► compare two named products
       ├──► policy_search   ──► vector search over policy docs
       └──► order_lookup    ──► Supabase orders (auth required)
       │
       ▼
Final answer + tool context
```

Key design point: `MasterAgent` is a **flat ReAct node**, not a multi-node router graph. It receives the full conversation, calls `LLMService.call_gemini` with `tools_schema`, executes tool calls, and feeds tool outputs back to the LLM for the next turn until a final answer is produced.

## 3. Backend module map (`rag-service/src/`)

| Layer | Files | Responsibility |
|---|---|---|
| **Ingestion** | `a_ingestion/a1_loader.py` … `a4_chunker.py` | Load raw JSON/CSV, clean, format, chunk products and policies. |
| **Indexing** | `b_indexing/b0_vector_db.py`, `b1_embedding.py`, `b2_rerank.py` | `ChromaVectorDatabase`, `EmbeddingService` (sentence-transformers), `RerankService` (Cohere or cross-encoder). |
| **Retrieval** | `c_retrieval/base_retriever.py`, `product_retriever.py`, `policy_retriever.py` | Build Chroma queries with metadata filters, rerank, return `{"document", "metadata", "score"}`. |
| **Tools** | `d_tools/product/product_search.py`, `product_compare.py`, `policy/policy_search.py`, `account/order_lookup.py` | Real functions the agent can call. They return formatted text used as LLM context. |
| **Agent** | `e_agents/master_agent.py`, `guardrail_call.py`, `rejection_call.py` | `MasterAgent.invoke` runs the ReAct loop; guardrail classifies input; rejection handles attacks. |
| **Prompts** | `f_prompts/master/system.py`, `fewshot.py`, `skills/` | System prompt, few-shot examples, per-task skill markdowns. |
| **Pipelines** | `g_pipelines/workflow_1/workflow_1.py`, `workflow_2/…` | Compiled LangGraph `StateGraph` wiring nodes together. |
| **Evaluation** | `h_evaluation/ecommerce_benchmark_generator.py`, `benchmark_evaluator.py`, `ragas_helpers.py` | Generate test sets and score agent answers. |

## 4. Agent loop details (`MasterAgent`)

```python
class MasterAgent:
    def invoke(self, messages, available_tools, tools_schema, auth_context=None, skill=None):
        # optional skill injected as an extra system message
        for turn in range(max_turns):
            response = llm_service.call_gemini(model, messages, tools=tools_schema)
            # parse streaming response for text / function calls
            # execute tool calls, append results to messages
            # if no tool call, return final answer
```

- `auth_context` carries `user_id` and `user_token`; injected only into tools listed in `AUTH_TOOLS`.
- `_sanitize_tool_args` normalizes malformed LLM tool arguments (string-encoded dicts, flat keys, missing `queries` array).
- Tool outputs are accumulated in `tool_context` and returned so `master_node` can reuse them across multi-turn history.

## 5. Tool behavior

### `product_search`
- Accepts a list of query dicts with `keyword`, `brand`, `category`, `min_price`, `max_price`, `name_contains`, `mode` (`rank` or `lines`), `include_details`, `need_price_info`, `limit`.
- First filters candidates via Supabase SQL (`products` table).
- Then runs semantic search in `ChromaDB` over the candidate set.
- `mode=lines` groups by product line, returns one representative per line.
- `mode=rank` returns top-N semantic matches.

### `product_compare`
- Requires exact product names; calls `product_retriever` for each and returns a side-by-side spec/pricing summary.

### `policy_search`
- Vector search over `policies_collection`; returns policy segments with `section` and `policy_type` metadata.

### `order_lookup`
- Dynamic Supabase client using `user_token` (RLS); falls back to admin client filtered by `current_user_id` on JWT errors.
- Returns recent orders or a specific order by `order_id`.

## 6. Security & auth

- Supabase JWT verified by `verify_supabase_jwt` (returns `user_id`).
- `order_lookup` uses the dynamic user client when possible; otherwise filters by `user_id` at application level.
- `GuardrailCall` and `RejectionCall` protect against prompt injection, jailbreak, and irrelevant harmful queries.

## 7. LLM key management

`LLMService` stores multiple Gemini and Groq API keys. On `429` / `RESOURCE_EXHAUSTED` it rotates keys and waits. This allows running benchmark-scale experiments on free-tier keys.

## 8. Evaluation integration

Benchmark results are produced as JSONL files and scored by:

- **Custom judge** (`groq`) — faithfulness, answer correctness, answer relevancy, context precision, context recall, plus tool selection/argument accuracy.
- **RAGAS** (`gemini`) — same semantic metrics, but sensitive to context accumulation in multi-turn records.

## 9. Baselines

Two simplified baselines are provided for comparison:

- `07_A_basic_rag_baseline.ipynb` — vector retrieval + one LLM call.
- `07_B_single_tool_baseline.ipynb` — rule-based tool router + one tool call + one LLM call.

These isolate the value of tool use and agentic planning against the full `07_01_workflow1.ipynb` Agentic RAG pipeline.
