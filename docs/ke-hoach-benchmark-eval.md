# KẾ HOẠCH BENCHMARK & EVALUATION — Agentic RAG TMĐT Điện tử

## 0. Nguyên tắc chống thiên vị khi dùng chung model cho nhiều vai trò

Hệ thống có 4 vai trò cần LLM, **không được dùng cùng 1 model cho vai trò Agent và vai trò Judge** (lý do: self-preference bias — xem phần trên).

| Vai trò | Model đề xuất | Tần suất gọi | Ràng buộc |
|---|---|---|---|
| **Agent (live)** | Gemini 3.5 Flash-Lite (hoặc model đang benchmark ở mục 6) | Cao (mọi traffic thật) | Cần rẻ/nhanh, ưu tiên rate-limit cao |
| **Sinh dữ liệu mô tả sản phẩm** | Bất kỳ, có thể trùng Agent | 1 lần (lúc chuẩn bị data) | Cần đa dạng hoá prompt/temperature (mục 1) |
| **Sinh test set (RAGAS)** | Nên khác model Agent nếu có thể | 1 lần (lúc chuẩn bị test set) | Không bắt buộc nhưng khuyến khích tách |
| **Judge (chấm Faithfulness/Relevancy)** | **Bắt buộc khác** mọi model đang được benchmark ở mục 6 | Chỉ lúc chạy eval, không phải traffic thật | Cố định 1 model duy nhất cho mọi lần so sánh, không đổi giữa chừng |

---

## 1. Quy trình sinh dữ liệu sản phẩm (chống lặp khuôn mẫu)

1. Lấy specs thật từ Icecat (đã có hướng dẫn riêng).
2. Sinh mô tả tiếng Việt — **luân phiên 3-4 biến thể prompt** (nhấn hiệu năng / thiết kế / giá trị-so-với-giá / đối tượng sử dụng), `temperature = 0.8-1.0`.
3. Sinh review giả lập (nếu dùng) theo cùng nguyên tắc đa dạng hoá.
4. Spot-check tay 10-15% để đảm bảo không lệch thông tin so với specs gốc.

## 2. Quy trình tạo Ground Truth theo từng loại câu hỏi

| Loại câu hỏi | Cách tạo ground truth | Cách chấm |
|---|---|---|
| Factoid (RAM/giá/tồn kho/1 thông số cụ thể) | Query trực tiếp DB (DB "biết" đáp án đúng) | **Answer EM / Answer F1** |
| So sánh sản phẩm, hướng dẫn kỹ thuật, QA chính sách mở | **RAGAS `TestsetGenerator`** trên `products.description` + `policy_chunks` (model sinh ≠ model Agent nếu khả thi) | RAGAS (Faithfulness, Answer Relevancy, Context Precision/Recall) |
| Tạo ticket, từ chối yêu cầu không phù hợp | Tự viết tay 30-50 câu — **tách biệt hoàn toàn** khỏi few-shot đã dùng trong prompt (không test lại đúng câu đã "học") | So khớp tier kỳ vọng (accuracy) |
| Hội thoại nhiều lượt | Tự viết kịch bản tay (3-4 lượt, có tham chiếu ngầm) | RAGAS + State Consistency |
| Tool routing | Tự viết tay, gán `expected_tool` | Accuracy đơn giản |

**Lưu ý bắt buộc**: spot-check 10-15% bộ test do RAGAS tự sinh trước khi dùng chính thức — vì dữ liệu nguồn đã qua nhiều lượt LLM xử lý (Icecat → tiếng Việt → RAGAS), rủi ro trôi thông tin cộng dồn.

---

## 3. Bộ thang đo (Metrics) — đã lọc trùng lặp và bổ sung

| Nhóm | Metric | Ghi chú |
|---|---|---|
| Độ chính xác nội dung (factoid) | **Answer EM**, **Answer F1** | Chỉ áp dụng câu hỏi có đáp án ngắn/khách quan |
| Độ chính xác nội dung (mở) | Answer Correctness, **Answer Relevancy** | RAGAS |
| Chất lượng retrieval | **Context Precision**, **Context Recall** | RAGAS — thay thế "Supporting Facts F1" (cùng khái niệm) |
| Độ trung thực | **Faithfulness** | RAGAS |
| Toàn vẹn luồng agent | **Task Success** (toàn bộ yêu cầu được giải quyết đúng, kể cả câu hỏi liên domain) | Mới bổ sung |
| Toàn vẹn state | **State Consistency** (câu trả lời cuối khớp dữ liệu đã ghi nhận giữa các bước, không "nhớ nhầm" khi tổng hợp) | Mới bổ sung — quan trọng với kiến trúc multi-node |
| Hành vi agent | Tool selection accuracy, **Loop Rate** (tỷ lệ vòng lặp không tạo thêm thông tin mới) | Loop Rate mới bổ sung. *(Đã chuyển "số lần gọi tool" xuống nhóm Hiệu năng)* |
| An toàn | Tỷ lệ từ chối đúng (nhóm attack), **Intervention Precision** + **Intervention Recall** (tách riêng, không gộp 1 số) | Tách theo 2 chiều lỗi khác nhau |
| Hiệu năng | **Thời gian phản hồi (Latency)**: Latency trung bình, **p95 latency**<br>**Số lần gọi Tool trung bình** (Average Tool Calls)<br>**Token tiêu thụ** (Token Usage): Prompt Tokens, Completion Tokens, Total Tokens | Đo tổng thời gian từ lúc nhận câu hỏi đến lúc trả câu trả lời cuối.<br>Đếm số lần Agent kích hoạt các công cụ hỗ trợ.<br>Đo lường lượng tài nguyên tiêu thụ làm cơ sở tính chi phí vận hành. |

*(Đã bỏ: Supporting Facts F1, Joint F1, Routing Accuracy, Evidence Grounding — trùng khái niệm với các metric trên, chỉ khác tên gọi từ paper gốc khác domain.)*

---

## 4. Danh mục câu hỏi test chuẩn hoá

| Nhóm | Ví dụ | Ground truth theo mục 2 |
|---|---|---|
| Hỏi đáp sản phẩm (factoid) | "Laptop Dell XPS 13 có RAM bao nhiêu?" | Query DB |
| So sánh sản phẩm | "So sánh iPhone 15 và Samsung S24" | RAGAS |
| Hướng dẫn kỹ thuật | "Làm sao kết nối tai nghe 2 thiết bị cùng lúc?" | RAGAS |
| QA đơn hàng/chính sách | Tra đơn hàng, hỏi đổi trả/bảo hành | Query DB (đơn hàng) / RAGAS (chính sách mở) |
| Release note / khuyến mãi mới | "Có sản phẩm nào mới ra mắt tháng này?" | Query DB (`promotion_lookup_tool`) |
| Tạo ticket / từ chối phù hợp | Mặc cả, tư vấn vượt phạm vi, tấn công | Viết tay |
| Hội thoại nhiều lượt | Chuỗi 3-4 lượt có tham chiếu ngầm | Viết tay |

**Must-have** (đủ cho báo cáo chính): 3 nhóm đầu tiên + tool routing.
**Nice-to-have** (nếu kịp): release note, hội thoại nhiều lượt, State Consistency/Loop Rate đầy đủ.

---

## 5. Kiến trúc RAG cần benchmark

| # | Kiến trúc | Ưu tiên |
|---|---|---|
| 1 | RAG chuẩn — Hybrid Retrieval (vector + BM25) | Must-have (baseline) |
| 2 | Hybrid Retrieval + Rerank (`bge-reranker-v2-m3`) | Must-have |
| 3 | Agentic RAG đầy đủ (multi-tool, max N loop) | Must-have |
| 4 | RAG chuẩn — tăng top-k | Nice-to-have |
| 5 | Truy xuất 1 lần + Rerank (không hybrid) | Nice-to-have |
| 6 | Corrective RAG (tự chấm điểm, tìm lại nếu thiếu) | Nice-to-have |

Đo riêng cho kiến trúc Agentic: sweep `n` = 2/3/5/7 (answer correctness + latency + Loop Rate), tỷ lệ trả lời "không biết" đúng lúc trên tập câu hỏi out-of-scope cố ý.

---

## 6. Kiến trúc Agentic cần benchmark (2 phương án đã thiết kế)

| # | Kiến trúc | Mô tả |
|---|---|---|
| A | **Flat ReAct** (baseline hiện tại) | Guardrail → Master Agent gọi mọi tool trực tiếp, ReAct tối đa 5 vòng trong 1 node |
| B | **Domain-node + Router** | Guardrail+Router gộp 1 lần gọi → chia `product_node`/`policy_node`/`account_node`, mỗi node gọi tool trong domain của mình, loop ở tầng graph (không ReAct lồng trong node) |

**Đo so sánh A vs B**: tổng số lượt gọi LLM/câu hỏi (tách riêng đơn-domain vs đa-domain), tool selection accuracy, latency, **và riêng recall của tier "attack"** trong bộ phân loại rủi ro (kiểm tra việc gộp guardrail+router có làm giảm độ nhạy phát hiện tấn công so với tách riêng hay không).

---

## 7. Danh sách Tool đầy đủ

| Domain | Tool | Ghi chú |
|---|---|---|
| Product | `product_search_tool`, `product_compare_tool`, `check_stock_tool`, `recommendation_tool` | Đã có + đã bổ sung |
| Product (nice-to-have) | `product_review_summary_tool`, `compatibility_check_tool` | |
| Policy | `policy_search_tool`, `promotion_lookup_tool` | Promotion tách riêng khỏi policy để tránh nhầm với "mặc cả" |
| Policy (nice-to-have) | `shipping_estimate_tool` | |
| Account | `order_lookup_tool`, `warranty_check_tool` | |
| Account (rủi ro — cần xác nhận) | `order_cancel_tool` | Tool hành động đầu tiên, nên xếp vào nhánh risk trung bình/cao |
| Support | `escalate_tool` (tường minh, không ẩn trong guardrail), `staff_assist_tool` | |

---

## 8. Hệ thống benchmark — cấu trúc code

```
g_evaluation/
├── test_sets/
│   ├── factoid.jsonl              # question, expected_tool, ground_truth (query DB)
│   ├── ragas_generated.jsonl      # sinh bằng RAGAS TestsetGenerator, đã spot-check
│   ├── ticket_refusal.jsonl       # viết tay, KHÔNG trùng few-shot trong prompt
│   └── multiturn.jsonl            # kịch bản 3-4 lượt viết tay
├── run_benchmark.py                # gọi API /chat theo từng dòng test, ghi log
├── compute_metrics.py              # EM/F1 tự viết + RAGAS cho phần còn lại
└── results/
    └── {kien_truc}_{model}_{ngay}.csv
```

**`run_benchmark.py` — luồng chính:**
```python
import json, time, requests

def run_test_set(path, api_url, config_label):
    results = []
    for line in open(path):
        item = json.loads(line)
        t0 = time.time()
        resp = requests.post(api_url, json={"message": item["question"], "session_id": f"eval-{item['id']}"})
        latency = time.time() - t0
        data = resp.json()
        results.append({
            "id": item["id"], "category": item["category"],
            "question": item["question"], "answer": data["reply"],
            "tool_used": data.get("tool_used"), "expected_tool": item.get("expected_tool"),
            "retrieved_context": data.get("sources", []),
            "ground_truth": item.get("ground_truth"),
            "latency": latency, "config": config_label,
        })
    return results
```

**`compute_metrics.py` — điểm cần lưu ý:**
- EM/F1: tự viết (chuẩn hoá lowercase, bỏ dấu câu, so token) — chỉ áp dụng nhóm factoid.
- RAGAS: dùng cho nhóm còn lại, input đúng format `(question, answer, contexts, ground_truth)`.
- Judge model: cấu hình cố định 1 nơi duy nhất (`JUDGE_MODEL = "..."`), không đổi giữa các lần chạy để so sánh công bằng.
- Loop Rate: đếm số lần `tool_used` trùng lặp liên tiếp với cùng tham số trong `chat_logs` của 1 `session_id`.
- State Consistency: so khớp giá trị trong `final_answer` (regex/LLM-extract số liệu) với giá trị tương ứng đã ghi trong `AgentState.retrieved_context` tại bước trước.

---

## 9. Benchmark LLM API (mục 3.1 gốc, bổ sung ràng buộc judge)

| Model | Vai trò benchmark | Lưu ý |
|---|---|---|
| Gemini 3.5 Flash-Lite | Agent — ứng viên chính (rate-limit tốt, rẻ) | |
| Gemma 4 26B-A4B | Agent — ứng viên phụ | |
| Groq (openai/gpt-oss-120b hoặc tương đương) | Agent — phương án dự phòng khi rate-limit | |
| **Judge cố định** (VD Claude Haiku hoặc Gemini 3.6 Flash) | **Chỉ chấm điểm, không phải Agent** | Không đổi giữa các lần so sánh (mục 0) |

Đo: tool selection accuracy, latency, throughput thực tế dưới rate-limit free tier (đúng vấn đề vận hành đã gặp) — đây là điểm khác biệt so với benchmark "độ chính xác thuần" thông thường, phản ánh đúng ràng buộc thực tế của đồ án.
