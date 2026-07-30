# Phân tích Benchmark Evaluation — Nhận định & Hướng đi

## 1. Tổng quan kết quả chạy thử (3 mẫu `single_spec`)

| Metric | Mean | Nhận xét |
|---|---|---|
| **answer_correctness** | 1.0 | ⚠️ Judge cho 1.0 tuyệt đối — **đáng ngờ** |
| **faithfulness** | 1.0 | ⚠️ Tương tự |
| **context_precision** | 1.0 | ⚠️ Tương tự |
| **context_recall** | 1.0 | ⚠️ Tương tự |
| **answer_relevancy** | 1.0 | ⚠️ Tương tự |
| **state_consistency** | 1.0 | ⚠️ Tương tự |
| **task_success** | 1.0 | ⚠️ Tương tự |
| answer_em | 0.0 | ✅ Hợp lý — câu trả lời dài, không exact match |
| answer_f1 | 0.261 | ✅ Hợp lý — token overlap thấp giữa answer dài và ground_truth ngắn |
| **argument_extraction_accuracy** | 0.333 | ✅ Hợp lý — agent dùng `limit:3` thay vì `limit:1`, thiếu `brand`, `category` |
| tool_selection_accuracy | 1.0 | ✅ Hợp lý — đúng tool `product_search` |
| latency (p95) | 73.45s | ⚠️ Row 1 mất 80s, bất thường (có thể cold start/rate limit) |

> [!WARNING]
> **7/16 metric đều = 1.0 toàn bộ** → Judge LLM (Groq gpt-oss-120b) **quá dễ dãi**, gần như rubber-stamp mọi câu trả lời miễn là "đúng ý chung". Với chỉ 3 mẫu cùng category `single_spec` (câu hỏi đơn giản nhất), kết quả này không phản ánh năng lực thực sự.

---

## 2. Vấn đề với benchmark data ([ecommerce_benchmark_20each.jsonl](file:///d:/create/Agenttic-RAG-for-e-commerce/rag-service/src/h_evaluation/test_sets/ecommerce_benchmark_20each.jsonl))

### 2.1 Phân bố dữ liệu (243 records)

| Category | Count | Có `product_ids` | Có `contexts` | Có `expected_tool_calls` |
|---|---|---|---|---|
| single_spec | 20 | ✅ 20 | ✅ 20 | ✅ 20 |
| lines | 20 | 19 | 19 | ✅ 20 |
| lines_specs | 20 | ✅ 20 | ✅ 20 | ✅ 20 |
| top_n | 20 | 18 | 18 | ✅ 20 |
| combined_or | 20 | 16 | 16 | ✅ 20 |
| compare | 20 | ✅ 20 | ✅ 20 | ✅ 20 |
| **ambiguous** | 20 | ❌ 0 | ❌ 0 | ✅ 20 |
| **multi_turn** | 20 | ❌ 0 | ❌ 0 | ✅ (trong turns) |
| **order_account** | 20 | ❌ 0 | ❌ 0 | ✅ 20 |
| **risk_ticket** | 20 | ❌ 0 | ❌ 0 | ✅ 20 |
| **attack** | 20 | ❌ 0 | ❌ 0 | ✅ 20 |
| compound | 20 | ✅ 20 | ✅ 20 | ✅ 20 |
| laptop (extra) | 3 | ✅ 3 | ✅ 3 | ✅ 3 |

> [!IMPORTANT]
> **5 categories (107 records, ~44%) không có `contexts` và `product_ids`**:
> - `ambiguous`, `order_account`, `risk_ticket`, `attack` → hợp lý, đây là câu hỏi không liên quan đến sản phẩm cụ thể
> - `multi_turn` → ground truth nằm trong `turns[i].ground_truth`, không ở top-level → cấu trúc khác nhưng evaluator đã xử lý đúng
>
> **Hệ quả**: Khi chạy RAGAS thật (`use_ragas=True`), các category này sẽ bị bỏ qua hoặc cho NaN, rồi fallback về Judge LLM. Điều này **dự kiến và chấp nhận được**, nhưng cần ghi nhận trong báo cáo.

### 2.2 Vấn đề với `answer_summary` (ground truth)

Ground truth quá ngắn: VD `"Laptop ASUS Gaming V16 K3607VJ-RP106W có bộ nhớ 512GB"` — trong khi Agent trả lời đầy đủ chi tiết.

→ `answer_em = 0.0` luôn (đúng), nhưng `answer_f1 = 0.26` cũng rất thấp dù Agent trả lời **chính xác**. Đây là **hạn chế thiết kế**, không phải lỗi Agent.

---

## 3. Vấn đề với hệ thống đánh giá ([benchmark_evaluator.py](file:///d:/create/Agenttic-RAG-for-e-commerce/rag-service/src/h_evaluation/benchmark_evaluator.py))

### 3.1 Judge LLM quá dễ dãi (Root cause chính)

Hàm [JudgeLLM.score()](file:///d:/create/Agenttic-RAG-for-e-commerce/rag-service/src/h_evaluation/benchmark_evaluator.py#L365-L419) chấm 7 metric cùng lúc trong 1 prompt duy nhất. Vấn đề:

1. **Prompt quá chung chung** — chỉ nói "chấm 0.0-1.0" mà không cho rubric chi tiết cho từng mức điểm
2. **Thiên lệch "lười"** — Judge thấy câu trả lời dài, đúng ý → cho 1.0 hết thay vì phân biệt tinh vi
3. **7 metric cùng 1 lần gọi** → Judge khó tập trung vào từng metric riêng biệt
4. **Groq gpt-oss-120b** có thể thiếu khả năng phân biệt tinh vi cho task chấm điểm

### 3.2 `state_consistency` và `task_success` — Metric "ảo"

Bạn đúng khi nhận xét đây là metric **khó benchmark tự động**, đặc biệt cross-category:

- **`state_consistency`**: Chỉ thực sự có ý nghĩa với `multi_turn` (kiểm tra lượt sau có mâu thuẫn lượt trước không). Với câu hỏi đơn lẻ, nó luôn = 1.0 vì chỉ có 1 state → **không có giá trị phân biệt**.
- **`task_success`**: Judge kiểm tra "toàn bộ yêu cầu được giải quyết đúng" nhưng prompt không đủ chi tiết để Judge biết **yêu cầu cụ thể là gì** (VD: với `ambiguous`, "thành công" nghĩa là Agent hỏi lại, không phải trả lời bừa).

### 3.3 `argument_extraction_accuracy` — Metric tốt nhưng quá nghiêm

Đây là metric deterministic (không phụ thuộc Judge), nhưng quá nghiêm ngặt:
- Agent dùng `limit: 3` thay vì `limit: 1` → bị trừ điểm, dù kết quả trả về vẫn đúng sản phẩm
- Agent thiếu `brand`/`category` trong args → bị trừ, dù keyword đã chứa đủ thông tin

---

## 4. Đề xuất: Rút gọn metric — Giữ những gì thực sự có giá trị

### ✅ Nên GIỮ (Core Metrics)

| Metric | Nguồn chấm | Lý do giữ |
|---|---|---|
| **Answer Correctness** | Judge LLM (cần cải thiện prompt) | Metric quan trọng nhất — câu trả lời có đúng không |
| **Faithfulness** | Judge LLM hoặc RAGAS | Không bịa đặt — core requirement của RAG |
| **Context Precision** | Judge LLM hoặc RAGAS | Retrieval có lấy đúng document không |
| **Context Recall** | Judge LLM hoặc RAGAS | Retrieval có lấy đủ document không |
| **Answer Relevancy** | Judge LLM hoặc RAGAS | Trả lời có đúng câu hỏi không |
| **Tool Selection Accuracy** | Deterministic | Agent có chọn đúng tool không — **đơn giản, chính xác, rất hữu ích** |
| **n_tool_calls** (mean) | Deterministic | Hiệu suất agent — ít tool call hơn = tốt hơn |
| **Latency p95** | Deterministic | Trải nghiệm người dùng |
| **Total Tokens** (mean) | Deterministic | Chi phí vận hành |

### ⚠️ Nên BỎ hoặc TÁCH RIÊNG

| Metric | Lý do bỏ/tách |
|---|---|
| **answer_em** | Luôn = 0 với câu trả lời dài → vô nghĩa cho hầu hết category |
| **answer_f1** | Chỉ có ý nghĩa cho factoid ngắn, bị nhiễu bởi ground_truth quá ngắn |
| **state_consistency** | Chỉ có ý nghĩa cho `multi_turn`, luôn 1.0 cho single-turn → inflate score |
| **task_success** | Quá chung, Judge không đủ context để chấm chính xác → gần trùng answer_correctness |
| **intervention_correct** | Chỉ có ý nghĩa cho `attack` → tách thành metric riêng cho nhóm safety |
| **has_loop** | Tốt nhưng nên report riêng, không aggregate chung |
| **argument_extraction_accuracy** | Quá nghiêm, penalize agent vì khác biệt args không ảnh hưởng kết quả |

### 📊 Bộ metric đề xuất cuối cùng

```
Core (report chính):
├── Answer Correctness     ← Judge LLM (cải thiện prompt)
├── Faithfulness           ← Judge LLM hoặc RAGAS
├── Context Precision      ← Judge LLM hoặc RAGAS  
├── Context Recall         ← Judge LLM hoặc RAGAS
├── Answer Relevancy       ← Judge LLM hoặc RAGAS
├── Tool Selection Acc.    ← Deterministic
├── n_tool_calls (mean)    ← Deterministic
├── Latency p95            ← Deterministic
└── Total Tokens (mean)    ← Deterministic

Tách riêng theo category:
├── attack: Intervention Precision/Recall
├── multi_turn: State Consistency  
└── ambiguous: "Hỏi lại" rate (binary — Agent có hỏi lại không)
```

---

## 5. Hướng cải thiện cụ thể

### 5.1 Cải thiện Judge LLM Prompt

Prompt hiện tại quá chung. Đề xuất thêm **rubric chi tiết** cho từng metric:

```
faithfulness:
  1.0: Mọi claim trong answer đều có bằng chứng trong context
  0.5: Phần lớn đúng nhưng có 1-2 chi tiết không có trong context
  0.0: Bịa đặt thông tin hoàn toàn

answer_correctness:
  1.0: Trả lời chính xác ground truth, đầy đủ
  0.7: Đúng ý chính nhưng thiếu chi tiết
  0.3: Có liên quan nhưng thiếu/sai thông tin quan trọng
  0.0: Sai hoàn toàn
```

### 5.2 Chạy đủ category, đủ mẫu

Chạy thử hiện tại chỉ có **3 mẫu `single_spec`** → quá ít, quá đồng nhất. Cần:
- Tối thiểu 5-10 mẫu **mỗi category** (ít nhất 6-7 categories quan trọng)
- Ưu tiên: `single_spec`, `lines`, `top_n`, `compare`, `compound`, `attack`, `ambiguous`

### 5.3 Tách report theo nhóm category

Thay vì aggregate tất cả 13 categories → tách thành:

| Nhóm | Categories | Metrics chính |
|---|---|---|
| **Sản phẩm (factoid)** | single_spec, lines, lines_specs, top_n, combined_or | Correctness, Faithfulness, Context P/R, Tool Acc |
| **Sản phẩm (complex)** | compare, compound | Correctness, Faithfulness, Tool Acc, n_tool_calls |
| **Hành vi agent** | ambiguous, multi_turn | Relevancy, "hỏi lại" rate, State Consistency |
| **An toàn** | attack, risk_ticket | Intervention Precision/Recall |
| **Tài khoản** | order_account | Tool Acc (cần auth) |

### 5.4 Ground truth cần cải thiện

`answer_summary` hiện tại quá ngắn → gây nhiễu cho F1 và cho Judge. Đề xuất:
- Giữ `answer_summary` ngắn cho EM/F1 factoid
- Thêm trường `expected_behavior` dạng text mô tả chi tiết hơn cho Judge

---

## 6. Kết luận

| Vấn đề | Mức độ | Hành động |
|---|---|---|
| Judge LLM cho 1.0 tràn lan | 🔴 Nghiêm trọng | Cải thiện prompt với rubric chi tiết |
| Chỉ chạy 3 mẫu cùng category | 🔴 Nghiêm trọng | Chạy ≥50 mẫu đa category |
| Metric thừa (EM, state_consistency single-turn) | 🟡 Trung bình | Rút gọn theo đề xuất mục 4 |
| Ground truth quá ngắn | 🟡 Trung bình | Mở rộng `answer_summary` hoặc thêm `expected_behavior` |
| Aggregate chung cross-category | 🟡 Trung bình | Tách nhóm report |
| `argument_extraction_accuracy` quá nghiêm | 🟢 Nhẹ | Giảm weight cho `limit`/`include_details`/`need_price_info` |
