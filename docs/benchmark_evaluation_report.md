# Báo cáo đánh giá benchmark Agentic RAG e-commerce

## 1. Mục tiêu

Module `src/h_evaluation/benchmark_evaluator.py` cung cấp service một file để chạy và đánh giá agentic workflow trên tập benchmark đã sinh (`ecommerce_benchmark_20each.jsonl`). Kết quả là CSV từng dòng + JSON tổng hợp, dễ dùng trong notebook `07_01_workflow1.ipynb` hoặc notebook workflow khác.

## 2. Quy trình đánh giá

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  benchmark   │────▶│  run(app)    │────▶│ raw_{wf}.jsonl   │
│  (JSONL)     │     │              │     │                  │
└──────────────┘     └──────────────┘     └──────────────────┘
                                                 │
                                                 ▼
                                            ┌──────────────┐
                                            │  evaluate()  │
                                            └──────────────┘
                                                 │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
            per_row_scores.csv      aggregate_report.json      raw với tool calls
```

Các bước:

1. **Run**: gọi `app.invoke({"user_query": q}, config={"thread_id": ...})` cho từng câu hoặc từng lượt multi-turn. Trích `final_answer`, `messages`, `risk_level`, `total_tokens`, `latency`.
2. **Extract rows**: mỗi câu (hoặc mỗi turn) thành một eval row với `question`, `answer`, `contexts` (tool outputs), `ground_truth`, `expected/actual tool calls`.
3. **Score**:
   - RAGAS metrics: `faithfulness`, `answer_correctness`, `context_precision`, `context_recall`.
   - Custom judge: `answer_relevancy`, `state_consistency`, `task_success`.
   - Deterministic metrics: `answer_em`, `answer_f1`, `tool_selection_accuracy`, `argument_extraction_accuracy`, `has_loop`, `intervention_correct`, `latency`, `total_tokens`.
4. **Aggregate**: mean/median/p95 theo tổng thể, category, workflow.

## 3. Các thang đo

### 3.1. Deterministic (không cần LLM)

| Metric | Cách tính | Ý nghĩa |
|---|---|---|
| **Answer EM** | `norm(answer) == norm(ground_truth)` | Câu trả lời khớp hoàn toàn nội dung tóm tắt. |
| **Answer F1** | F1 token overlap giữa `answer` và `ground_truth` | Độ trùng lặp từ khóa, linh hoạt hơn EM. |
| **Tool Selection Accuracy** | F1 của tập tool name kỳ vọng vs thực | Có gọi đúng loại tool không (product_search, compare, policy, order). |
| **Argument Extraction Accuracy** | Trung bình overlap/key match tham số tool (product_search: brand/category/min_price/max_price/limit/keyword; product_compare: product_names; policy: key_word; order: order_id) | Trích đúng tham số từ câu hỏi tự nhiên — lỗi phổ biến nhất (vd `max_price` thiếu số 0). |
| **Has Loop** | 1 nếu có 2 tool calls liên tiếp giống nhau | Phát hiện agent lặp vô hạn. |
| **N Tool Calls** | Số tool calls trong turn | Độ phức tạp / hiệu quả. |
| **Intervention Correct** | `attack` đòi hỏi từ chối, non-attack không được false-positive | Đánh giá guardrail. |
| **Latency** | Thời gian `app.invoke` (s) | Tốc độ phản hồi. |
| **Total Tokens** | `state["total_tokens"]` | Chi phí LLM. |

### 3.2. RAGAS metrics (dùng Groq Llama 3.3 70B làm judge)

| Metric | Đầu vào | Đo cái gì | Ghi chú |
|---|---|---|---|
| **Faithfulness** | `answer`, `contexts` | Câu trả lời có bịa thông tin ngoài context không | Dùng được cho cả function-calling và RAG. |
| **Answer Correctness** | `answer`, `ground_truth` | Độ chính xác so với ground truth | Cần `ground_truth` không rỗng. |
| **Context Precision** | `question`, `contexts`, `ground_truth` | Tỷ lệ context liên quan & ở đúng thứ hạng | Chỉ có ý nghĩa với câu có semantic retrieval (policy, keyword search). |
| **Context Recall** | `question`, `contexts`, `ground_truth` | Context có bao phủ hết ground truth không | Chỉ có ý nghĩa với RAG. |

> **Lưu ý**: `answer_relevancy` của RAGAS gọi LLM với `n > 1`, không tương thích với Groq (`n=1`). Vì vậy metric này được tính bằng custom judge LLM.

### 3.3. Custom judge metrics

Judge model mặc định: **Groq `llama-3.3-70b-versatile`** (hoàn toàn khác công ty với agent Gemini, tránh thiên vị). Có thể đổi thành **Gemini Gemma** qua:

```python
evaluator = BenchmarkEvaluator(
    judge_provider='gemini',
    judge_model=config.llm.google.available[2]  # gemma-4-26b-a4b-it
)
```

| Metric | Prompt yêu cầu | Phạm vi |
|---|---|---|
| **Answer Relevancy** | Câu trả lời có liên quan trực tiếp đến câu hỏi không | 0–1 |
| **State Consistency** | Câu trả lời cuối có mâu thuẫn với dữ liệu đã truy xuất qua các turn không | 0–1; nice-to-have cho multi-turn. |
| **Task Success** | Toàn bộ yêu cầu đã được giải quyết đúng, kể cả câu liên domain | 0–1 |

## 4. Sử dụng trong notebook

Ví dụ cell cuối `07_01_workflow1.ipynb`:

```python
from src.h_evaluation.benchmark_evaluator import BenchmarkEvaluator

evaluator = BenchmarkEvaluator()  # Groq judge mặc định
report = evaluator.run_and_evaluate(
    app,
    benchmark='ecommerce_benchmark_20each.jsonl',
    output_dir='benchmark_results',
    max_samples=3,  # tăng khi chạy thật
)
print(report['aggregate']['overall'])
```

Hoặc chạy riêng:

```python
raw = evaluator.run(app, 'ecommerce_benchmark_20each.jsonl', output_dir='benchmark_results', max_samples=3)
report = evaluator.evaluate(raw, output_dir='benchmark_results')
```

`app` có thể là 1 LangGraph compiled app hoặc dict nhiều workflow:

```python
report = evaluator.run_and_evaluate(
    {'flat_react': app1, 'domain_node': app2},
    benchmark='ecommerce_benchmark_20each.jsonl',
    output_dir='benchmark_results',
)
```

## 5. Tập benchmark

File `ecommerce_benchmark_20each.jsonl` được sinh bởi `EcommerceBenchmarkGenerator`, mỗi dòng chứa:

```json
{
  "id": "...",
  "category": "top_n",
  "question": "cho tôi 5 laptop Acer dưới 20 triệu",
  "expected_tool_calls": [{"tool": "product_search", "args": {...}}],
  "ground_truth": {
    "answer_summary": "...",
    "product_ids": [...],
    "specs": {...}
  },
  "contexts": [...],
  "metadata": {...}
}
```

Có thể là `turns` thay cho `question`/`ground_truth` đối với multi-turn.

## 6. Đầu ra

- `raw_{workflow}_{timestamp}.jsonl`: kết quả chạy thô gồm `actual_tool_calls`, `tool_outputs`, `final_answer`, `latency`, `total_tokens`.
- `per_row_scores_{timestamp}.csv`: tất cả metrics từng dòng.
- `aggregate_report_{timestamp}.json`: mean/median/p95 tổng thể, theo category, theo workflow.

## 7. Khi nào dùng RAGAS, khi nào không

- **Dùng RAGAS** khi câu hỏi thực sự đi qua retrieval (mô tả sản phẩm mơ hồ, chính sách, keyword search).
- **Không dùng Context Precision/Recall** cho tool tra cứu chính xác (`get_product_info`, `order_lookup`, `product_search` với name_contains/brand/lọc giá) vì đây là tra cứu 1-1, không xếp hạng ứng viên.
- **Dùng Argument Extraction Accuracy** bắt buộc cho `product_search` và `product_compare` vì lỗi tham số là failure mode chính, Faithfulness/Context P/R không bắt được.
- **State Consistency** nên làm sau khi EM/F1/Argument Extraction đã ổn định vì implement phức tạp hơn và phụ thuộc vào multi-turn context.

## 8. Hạn chế

- `RAGAS` chạy chậm trên Groq nếu context dài; cân nhắc giới hạn số lượng mẫu khi test.
- Judge Gemini (Gemma) dùng chung công ty Google với agent Gemini, có thể có thiên vị nhẹ. Khuyến nghị mặc định Groq Llama.
- Metric `answer_relevancy` không dùng RAGAS mà dùng custom judge do Groq không hỗ trợ `n > 1`.
