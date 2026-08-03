# Báo cáo chi tiết về thực tập

## 1. Chủ đề thực tập: Xây dựng hệ thống chatbot TMĐT chăm sóc khách hàng bằng kiến trúc Agentic RAG

### 1.1. Lý do chọn đề tài và tính cấp thiết

Chatbot thương mại điện tử hiện nay cần trả lời đúng về sản phẩm (giá, tồn kho, thông số), chính sách (bảo hành, đổi trả), và đơn hàng cá nhân. Các hệ thống RAG đơn giản chỉ tra cứu văn bản tĩnh, dễ bị lỗi khi dữ liệu thay đổi hoặc câu hỏi cần nhiều bước suy luận. Agentic RAG kết hợp LLM với công cụ (tool calling) để tự động truy vấn SQL/vector DB theo từng ngữ cảnh, giúp trả lời chính xác và có thể kiểm chứng.

### 1.2. Mục tiêu nghiên cứu và phát triển

- Xây dựng pipeline ngầm định (data ingestion, indexing, retrieval) cho sản phẩm/chính sách.
- Thiết kế agent ReAct có khả năng gọi hàm tìm kiếm sản phẩm, so sánh, tra chính sách, tra đơn hàng.
- Xây dựng bộ benchmark tự động để đánh giá agent theo đúng công cụ/tham số/ground truth.
- So sánh Agentic RAG với các baseline đơn giản hơn (Basic RAG, 1-tool RAG).

### 1.3. Phạm vi và đối tượng nghiên cứu

- Lĩnh vực: điện thoại, laptop và phụ kiện.
- Ngôn ngữ: tiếng Việt tự nhiên, đa dạng văn phong.
- Dữ liệu: sản phẩm, chính sách cửa hàng, đơn hàng người dùng.
- Agent: flat ReAct trên LangGraph, LLM chính Gemini, judge Groq.

## 2. Kiến thức cơ bản và công nghệ áp dụng

### 2.1. Retrieval-Augmented Generation (RAG) và Naive RAG

Naive RAG: embed query → tìm top-k chunk trong vector DB → đưa chunk vào prompt → LLM trả lời. Hạn chế: không cập nhật giá/tồn kho theo thời gian thực, khó xử lý câu hỏi đòi hỏi nhiều bước hoặc nhiều điều kiện (dưới 20 triệu, brand A hoặc B).

### 2.2. Agentic RAG và cơ chế ReAct Loop

ReAct = Reasoning + Acting. Agent suy nghĩ từng bước, quyết định gọi công cụ, quan sát kết quả, rồi tiếp tục hoặc trả lời. Trong hệ thống này `MasterAgent` thực hiện vòng lặp tối đa `max_turns`, mỗi lượt gọi Gemini với `tools_schema` và xử lý streaming response.

### 2.3. Cơ chế Function Calling của LLM

Gemini trả về `function_call` trong response. `MasterAgent` parse tên hàm + arguments, chuẩn hóa qua `_sanitize_tool_args`, thực thi hàm Python thật, rồi append `role: tool` vào messages.

### 2.4. Cơ sở dữ liệu Vector và ChromaDB

- `ChromaVectorDatabase`: PersistentClient lưu tại `database/chroma_db/`.
- Mỗi sản phẩm/chính sách được chunk, embed bằng `sentence-transformers/all-MiniLM-L6-v2`, lưu cùng metadata (`brand`, `category`, `product_id`, `price`, ...).
- Truy vấn kết hợp vector similarity và metadata filters (`$and`, `$in`).

### 2.5. LangGraph / StateGraph

`StateGraph` định nghĩa các node: `receive_node`, `guardrail_node`, `master_node`, `rejection_node`. Trạng thái hội thoại được lưu qua `MemorySaver` với `thread_id`, cho phép multi-turn có ngữ cảnh.

### 2.6. Row-Level Security (RLS) của Supabase

`order_lookup` sử dụng dynamic Supabase client với JWT của user để áp dụng RLS. Khi JWT dynamic client lỗi (ví dụ PGRST301), hệ thống fallback về admin client và lọc theo `current_user_id` ở tầng ứng dụng.

## 3. Kiến trúc chi tiết hệ thống

### 3.1. Quy trình chuẩn bị dữ liệu

#### 3.1.1. Thu thập dữ liệu thô

Dữ liệu sản phẩm thu từ CSV/JSON (laptop, điện thoại, …), chính sách từ FAQ cửa hàng. File gốc nằm trong `data for system/` và `rag-service/data/raw/`.

#### 3.1.2. Phân tích, chuẩn hóa và nạp Postgres (Supabase)

`a2_cleaner.py`, `a3_formatter.py` làm sạch tên, giá, thông số, biến thể (SKU, màu, dung lượng). Sản phẩm cuối cùng nạp vào bảng `products` với các cột: `id`, `name`, `brand`, `category`, `price`, `final_price`, `stock`, `sku`, v.v.

#### 3.1.3. Chunking, Embedding và Vector DB

`a4_chunker.py` chia mô tả sản phẩm thành các đoạn có cấu trúc. `b1_embedding.py` tạo vector. `b0_vector_db.py` lưu vào collection `products_collection` và `policies_collection`. `b2_rerank.py` dùng Cohere/cross-encoder để xếp hạng lại top-k.

### 3.2. Thiết kế đồ thị hội thoại (LangGraph)

#### 3.2.1. Phân loại rủi ro bảo mật (`classify_risk` & Guardrails)

`guardrail_call.py` prompt LLM phân loại input thành `safe`, `ticket`, `attack`. Nếu `attack` → `rejection_node`. Nếu `ticket` → có thể chuyển sang hỗ trợ viên. Nếu `safe` → `master_node`.

#### 3.2.2. Bộ não điều khiển Agent (`MasterAgent`)

- Nhận messages, `tools_schema`, `auth_context`, `skill` (tùy chọn).
- Stream gọi Gemini.
- Tách text/tool calls, thực thi tool, lặp lại.
- Trả về `final_answer`, `tool_context`, token/latency.

`master_agent.py` (module) hoặc `MasterAgent` class trong `07_01_workflow1.ipynb` đều cùng cơ chế.

#### 3.2.3. State Management và Checkpointing

LangGraph `MemorySaver` lưu `AgentState` theo `thread_id`. `tool_calls_used` và `conversation_state` được cập nhật mỗi lượt để `master_node` tái sử dụng context tìm kiếm trước đó.

#### 3.2.4. Cơ chế an toàn

- `max_turns` ngăn vòng lặp vô hạn.
- `consecutive_failures` dừng khi tool lỗi liên tiếp.
- `AUTH_TOOLS` đảm bảo chỉ tool cần xác thực mới nhận token.

### 3.3. Cơ chế định tuyến truy vấn

#### 3.3.1. Truy vấn dữ liệu tĩnh (Vector DB)

Dùng cho: mô tả sản phẩm, chính sách, FAQ. `ProductRetriever` kết hợp vector search với metadata filters (`brand`, `price`, `product_ids`).

#### 3.3.2. Truy vấn dữ liệu động (Relational DB)

Dùng cho: giá, tồn kho, đơn hàng. `product_search` truy vấn Supabase SQL trước để lấy candidate IDs, sau đó search vector trong candidate set.

### 3.4. Thiết kế công cụ (Tools)

#### 3.4.1. Product Domain

- `product_search`: tìm/liệt kê/lọc sản phẩm, `mode=rank/lines`.
- `product_compare`: so sánh các sản phẩm theo tên cụ thể.

#### 3.4.2. Policy Domain

- `policy_search`: tìm chính sách bảo hành, đổi trả, trả góp, vận chuyển.

#### 3.4.3. Account Domain

- `order_lookup`: tra cứu đơn hàng theo user (cần auth).

## 4. Kế hoạch Benchmark & Đánh giá

### 4.1. Quy trình tạo bộ dữ liệu kiểm thử

#### 4.1.1. Sinh câu hỏi tiếng Việt tự nhiên

`EcommerceBenchmarkGenerator` dùng `GeminiLLM` để viết lại skeleton thành câu hỏi người dùng. Ví dụ skeleton `{brand: ASUS, product: ROG Zephyrus G16, info: ram}` → câu hỏi tự nhiên.

#### 4.1.2. Sinh câu hỏi chính sách

Câu hỏi chính sách và compound được sinh từ danh sách chủ đề chính sách (warranty, return, installment) kết hợp với sản phẩm.

### 4.2. Các chỉ số đánh giá

#### 4.2.1. RAGAS / Judge LLM

`faithfulness`, `answer_correctness`, `answer_relevancy`, `context_precision`, `context_recall`.

#### 4.2.2. Agent behavior metrics

`tool_selection_accuracy`, `tool_arg_accuracy`, `e2e_score`, `failed_invocations`.

#### 4.2.3. Hiệu năng & chi phí

`latency`, `input_tokens`, `output_tokens`, `total_tokens`.

### 4.3. Quy trình chạy thử nghiệm

1. Sinh test set (`generate_and_verify_20each.py`).
2. Xác minh `expected_tool_calls` khớp ground truth.
3. Chạy agent trên test set → `raw_results.jsonl`.
4. `BenchmarkEvaluator.evaluate(...)` → `aggregate_report.json` + `per_row_scores.csv`.

## 5. Các khó khăn và giải pháp

### 5.1. Hạn chế của RAGAS

RAGAS đánh giá context theo từng turn. Nếu multi-turn truyền context tích lũy toàn bộ các turn, `context_precision` sẽ rất thấp. Giải pháp: trong `_build_rows`, `contexts` chỉ lấy `tool_outputs` của turn hiện tại.

### 5.2. Giới hạn tần suất API

- Gemini free tier giới hạn 500 requests/ngày/model.
- Groq judge đạt TPD limit khi chạy benchmark lớn.
- Giải pháp: key rotation trong `LLMService`; chạy sample nhỏ trước; chuyển sang paid tier/production key khi cần full eval.

### 5.3. Trôi thông tin qua nhiều lớp

LLM có thể bỏ qua hoặc biến dạng tham số tool (ví dụ nhét tên sản phẩm đầy đủ vào `name_contains` thay vì keyword). Giải pháp:
- Củng cố schema mô tả cho `keyword`, `name_contains`, `limit`, `include_details`, `need_price_info`.
- Thêm `skills/` với ví dụ cụ thể cho từng loại câu hỏi.
- `MasterAgent` chèn skill vào system messages.

### 5.4. Các giải pháp đã áp dụng

- Rà soát lại ground truth bằng cách chạy expected tool calls trên DB thật.
- Sửa `_match_query` để chấm điểm tham số mềm mại hơn (brand/category recoverable, keyword semantic).
- Tạo skill `common/multi_turn_context.md` để quản lý prompt tái sử dụng context multi-turn.
- Tạo 2 notebook baseline để đo giá trị của tool use và agent planning.

## 6. Kết luận và hướng phát triển

### 6.1. Các kết quả đã đạt được

- Benchmark 20-each (260 parent, 322 eval rows) sinh và xác minh thành công, **322/322 khớp ground truth**.
- Full ReAct agent đạt e2e ~0.74-0.75 trên 240 mẫu; perfect baseline đạt ~1.0, chứng tỏ benchmark/evaluator không còn lỗi nghiêm trọng.
- Baseline 07_A (Basic RAG) trên 10 mẫu `single_spec` có e2e ~0.22, answer_correctness ~0.65, tool_arg_accuracy = 0.
- Baseline 07_B (1 tool + 1 LLM) hoạt động trên cùng test set, cho phép so sánh trực tiếp.

### 6.2. Hạn chế còn tồn tại

- Agent vẫn yếu ở `multi_turn` (e2e ~0.51), `combined_or` (tool_arg ~0.44), `compound` (~0.57).
- RAGAS đầy đủ bị chặn bởi Gemini quota.
- `MasterAgent` flat ReAct chưa có node router chọn skill tự động; skill được chọn theo keyword.

### 6.3. Hướng phát triển

- Thêm node lập kế hoạch (planner) trước `MasterAgent` để xử lý `combined_or`, `compound`, `multi_turn`.
- Tinh chỉnh (fine-tune / prompt-tune) agent trên các lỗi `tool_arg_accuracy` thấp.
- Chuyển RAGAS và judge sang paid API hoặc local judge để đánh giá toàn bộ benchmark.
- Tích hợp skill theo category một cách tự động thay vì rule-based keyword.

---

# Các usecase

## Usecase đơn
- Thông số sản phẩm: "ss s25 dùng chip gì"
- Thông số sản phẩm: "iPhone 15 dùng chip gì"
- Các dòng sản phẩm: "có các loại macbook nào"
- Các dòng sản phẩm + thông số: "macbook pro nào đáng mua"

## Usecase không rõ
- "4 sản phẩm dùng chip gì" → thiếu thông tin, agent nên hỏi lại.

## Usecase kết hợp nhiều điều kiện
- Top n với điều kiện: "cho tôi 5 laptop Acer dưới 20 triệu"
- Top n ghép điều kiện: "cho tôi 4 laptop Acer từ 20 đến 30 triệu"
- Top n theo dòng + thông số: "cho a 5 dòng mac air dưới 30 triệu, thông số từng dòng là gì"
- Top n theo dòng: "cho a 5 laptop macbook air dưới 20 triệu gồm những dòng nào"
- Top n dòng OR: "cho a 7 dòng laptop macbook air hoặc pro dưới 35 triệu"

## Usecase multi-turn

### Hội thoại 1
- "Cho a hỏi mk có laptop mỏng nhẹ pin trâu giá dưới 30 triệu k e, a đang cần tìm 1 con"
- "Cho a về 5 sản phẩm chip khủng trên 20 triệu và dưới 30 triệu đi e"
- "Cho a về 5 sản phẩm có card đồ họa khủng trên 20 triệu và dưới 30 triệu đi e"
- "Cho a hỏi nữa về mình có các loại macbook nào e nhỉ"
- "Giúp a so sánh giữa macbook pro và macbook air m5"
- "Giúp a so sánh giữa macbook pro và macbook air m5 và m4 thử e"
- "a đang tính tậu 1 con mac về để chạy ai local cho đỡ ngốn tiền, em tư vấn a con nào nhiều ram với"

### Hội thoại 2
- "Cho a hỏi mình có các dòng samsung s nào e nhỉ"
- "Cho a các mẫu dòng s dưới 30 triệu đi e"
- "cho a thông số của các dòng s25 và s26 đi e"
- "các dòng trên dùng con chip gì vậy"

## Usecase khó
- "Tôi mua máy tuần trước, đang dùng mã giảm giá sinh viên, muốn đổi sang bản RAM 32GB nhưng vẫn giữ ưu đãi, nếu hết hàng thì gợi ý giúp tôi sản phẩm tương đương"
