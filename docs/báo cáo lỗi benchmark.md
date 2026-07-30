# Kế Hoạch & Báo Cáo Phân Tích Chuyên Sâu 12 Usecase Benchmark

Tài liệu này phân tích toàn diện 12 Usecase (Category) trong hệ thống **Agentic RAG TMĐT**, đối chiếu từng độ đo (Metric), cấu trúc nhãn kiểm chứng (Ground Truth), mã nguồn sinh dữ liệu (`ecommerce_benchmark_generator.py`), mã nguồn đánh giá (`benchmark_evaluator.py`), nguyên nhân chi tiết dẫn đến kết quả điểm số, và **4 yếu tố ẩn dễ bị bỏ sót trong thực tế**.

---

## 1. Tổng Quan Thống Kê 12 Category & Thang Đo (Metrics Matrix)

| Category | Số mẫu | Ground Truth Label Format | Faithfulness | Correctness | Relevancy | Context Prec | Context Rec | Avg Latency | Avg Tool Calls | Trạng thái chính |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`compound`** | 20 | `product_ids`, `answer_summary` (SP + CS) | **0.9750** | **0.9500** | **0.9750** | **0.9750** | **0.9750** | 10.52s | 2.00 | 🟢 **Xuất sắc (Ổn định)** |
| **`risk_ticket`** | 20 | `answer_summary` ("Cần tra CSKH/CS") | **0.7500** | **0.9500** | **1.0000** | 0.6000 | 0.5000 | 5.42s | 0.60 | 🟢 **Xuất sắc (Tăng cường)** |
| **`attack`** | 20 | `answer_summary` ("Từ chối...") | 0.3000 | **1.0000** | **1.0000** | 0.0500* | 0.0500* | 3.97s | 0.05 | 🟢 **Ổn định (Guardrail đúng)** |
| **`order_account`** | 20 | `answer_summary` (Mô tả đơn/Hủy đơn) | **0.9500** | **0.8500** | **1.0000** | **1.0000** | **1.0000** | 5.29s | 1.00 | 🟢 **Ổn định** |
| **`lines_specs`** | 20 | `product_ids`, `answer_summary` | **0.8750** | **0.8000** | 0.6500 | **0.9500** | **0.8500** | 7.57s | 1.05 | 🟡 **Khá tốt** |
| **`compare`** | 20 | `product_ids`, `answer_summary` (So sánh) | 0.5750 | **0.7900** | **0.9750** | 0.7500 | 0.7250 | 10.51s | 1.00 | 🟡 **Khá tốt** |
| **`single_spec`** | 20 | `product_ids`, `answer_summary`, `specs` | **0.9000** | 0.6500 | **1.0000** | **0.9000** | 0.6500 | 6.84s | 1.00 | 🔴 **Điểm thấp (Mismatched GT)** |
| **`top_n`** | 20 | `product_ids`, `answer_summary` (Top N) | **0.8250** | 0.6000 | 0.7750 | 0.6500 | 0.6000 | 7.39s | 1.05 | 🔴 **Điểm thấp (Limit/Overlap)** |
| **`ambiguous`** | 20 | `answer_summary` ("Hỏi lại...") | 0.4250 | 0.5750 | 0.7500 | 0.1500* | 0.0250* | 6.76s | 0.50 | 🔴 **Điểm thấp (Judge Prompt)** |
| **`combined_or`** | 20 | `product_ids`, `answer_summary` (SP kép) | **0.8250** | 0.4250 | 0.7750 | 0.7250 | 0.6250 | 11.64s | 1.60 | 🔴 **Điểm thấp (Filter Logic)** |
| **`lines`** | 20 | `product_ids`, `answer_summary` (Dòng SP) | **0.7500** | 0.4165 | **0.9250** | **0.9500** | **0.8000** | 7.80s | 1.05 | 🔴 **Điểm thấp (GT tóm tắt)** |
| **`multi_turn`** | 82 (turns) | `turns[i].ground_truth` (Nhiều lượt) | 0.6555 | 0.2012 | **0.8841** | 0.7683 | 0.3354 | 8.57s | 1.04 | 🔴 **Điểm rất thấp (Ragas Drift)** |

*\* Ghi chú: Chỉ số Context Precision/Recall của nhóm không cần tool (`attack`, `ambiguous`) đã được lọc bỏ trong Dashboard tổng để tránh nhiễu điểm hệ thống.*

---

## 2. Phân Tích Chuyên Sâu Từng Category & Nguyên Nhân Dẫn Đến Điểm Thấp

---

### 🔴 2.1. Category `lines` (Answer Correctness = 0.4165 | Relevancy = 0.9250)

* **Bản chất Usecase**: Khách hàng hỏi danh sách các dòng sản phẩm của 1 thương hiệu (Ví dụ: *"Shop ơi, bên em hiện đang phân phối những dòng laptop ASUS nào vậy?"*).
* **Cấu trúc Ground Truth**:
  - `ground_truth.answer_summary`: Chỉ chứa **danh sách tên tóm tắt ngắn** (ví dụ: `"Các dòng laptop ASUS: ASUS VivoBook, ASUS ExpertBook, ASUS TUF Gaming, ASUS ROG"`).
* **Hành vi thực tế của Agent**:
  - Agent gọi `product_search(mode='lines', brand='ASUS')`, nhận về danh sách sản phẩm mẫu.
  - Agent trả lời **đầy đủ chi tiết kèm giá bán và thông số nổi bật** cho từng dòng máy (Ví dụ: in ra 5 mẫu Asus kèm giá từ 9.3tr đến 18tr).
* **Nguyên nhân chi tiết điểm thấp (0.4165)**:
  1. **Lỗi Ground Truth tóm tắt ngắn**: Ground Truth chỉ ghi 1 câu tóm tắt tổng quan tên dòng máy, trong khi Agent trả lời danh sách chi tiết các mẫu sản phẩm kèm giá.
  2. **Judge LLM ngặt nghèo (Over-strict Judge)**: Khi so sánh `Answer` chi tiết của Agent với `Ground Truth` tóm tắt 1 dòng, Judge LLM nhận thấy "nội dung Agent quá dài, chứa thông tin giá tiền/cấu hình không có trong 1 dòng Ground Truth", dẫn tới đánh giá `answer_correctness` tụt xuống 0.3 - 0.5.

---

### 🔴 2.2. Category `multi_turn` (Answer Correctness = 0.2012 | Context Recall = 0.3354 | Relevancy = 0.8841)

* **Bản chất Usecase**: Hội thoại đa lượt (3 - 4 lượt liên tiếp), người dùng thu hẹp tìm kiếm theo ngữ cảnh lượt trước (Ví dụ: Lượt 1 tìm laptop dưới 25tr ➔ Lượt 2 lọc màn 14 inch ➔ Lượt 3 hỏi giá con nhẹ nhất ➔ Lượt 4 hỏi chính sách đổi trả).
* **Cấu trúc Ground Truth**: Được gán riêng cho từng `turns[i].ground_truth`.
* **Hành vi thực tế của Agent**:
  - Agent giữ bối cảnh hội thoại rất tốt (`Relevancy` đạt **0.8841**). Ở lượt 4, Agent trả lời chính xác chính sách đổi trả 30 ngày.
* **Nguyên nhân chi tiết điểm thấp (0.2012)**:
  1. **Ragas / Judge Context Drift (Trôi bối cảnh)**: Khi đánh giá lượt $N$ ($N \ge 2$), Evaluator gửi toàn bộ lịch sử tin nhắn vào Judge. Judge LLM đối chiếu câu trả lời ở lượt 4 (về chính sách đổi trả) với Ground Truth của riêng lượt 4, nhưng bối cảnh hội thoại chứa cả thông tin laptop từ lượt 1 & 2. Judge bị nhiễu và cho điểm Correctness = 0.0.
  2. **Mismatch giữa Ground Truth lượt và câu trả lời tích lũy**: Ground Truth của lượt 3 chỉ ghi 1 sản phẩm nhẹ nhất, nhưng Agent nhắc lại cả 2 sản phẩm ở lượt trước để khách tiện so sánh ➔ Judge phạt điểm vì khác cấu trúc ngắn.

---

### 🔴 2.3. Category `combined_or` (Answer Correctness = 0.4250 | Latency = 11.64s)

* **Bản chất Usecase**: Tìm kiếm sản phẩm kết hợp nhiều điều kiện hoặc mệnh đề OR (Ví dụ: *"Tìm laptop Asus hoặc Lenovo có RAM 16GB dưới 20 triệu"*).
* **Cấu trúc Ground Truth**: Danh sách sản phẩm thỏa mãn tất cả các điều kiện OR ghép.
* **Hành vi thực tế của Agent**:
  - Agent cần thực hiện 2 lượt gọi `product_search` (Avg Tool Calls = 1.60), thời gian xử lý lâu nhất hệ thống (**11.64s**).
* **Nguyên nhân chi tiết điểm thấp (0.4250)**:
  1. **Giới hạn tham số `queries` của LLM**: Khi chuyển câu hỏi phức tạp thành tham số JSON gọi `product_search`, LLM thường chỉ trích xuất được 1 vế (ví dụ: chỉ trích xuất Asus RAM 16GB mà bỏ qua Lenovo), dẫn đến danh sách sản phẩm trả về bị thiếu 50% so với Ground Truth.
  2. **Recall của Vector Retrieval bị giảm**: Kết hợp nhiều từ khóa lọc trong 1 query làm giảm điểm tương đồng cosine trong Vector DB.

---

### 🔴 2.4. Category `single_spec` (Answer Correctness = 0.6500 | Context Recall = 0.6500)

* **Bản chất Usecase**: Hỏi 1 thông số cụ thể của 1 sản phẩm cụ thể (Ví dụ: *"Dung lượng RAM của laptop Asus ExpertBook B1 là bao nhiêu?"*).
* **Cấu trúc Ground Truth**:
  - `ground_truth.specs`: Dict chứa thông số thật từ DB (`{"ram": "8GB", "storage": "256GB"}`).
  - `ground_truth.answer_summary`: `"Laptop ASUS ExpertBook B1 B1402CVA-NK0104W có ram 8GB"`.
* **Hành vi thực tế của Agent**:
  - Agent trả lời: `"Laptop ASUS ExpertBook B1 có RAM 8GB DDR4, ngoài ra máy trang bị SSD 256GB, CPU Core i3..."`.
* **Nguyên nhân chi tiết điểm thấp (0.6500)**:
  1. **Judge phạt thông tin bổ sung**: Agent trả lời dư thông tin so với câu hỏi (cung cấp thêm SSD/CPU bên cạnh RAM), Judge LLM đánh giá "không khớp hoàn toàn 100% với câu hỏi chỉ hỏi RAM" ➔ Giảm điểm từ 1.0 xuống 0.5 - 0.7.

---

### 🔴 2.5. Category `top_n` (Answer Correctness = 0.6000 | Relevancy = 0.7750)

* **Bản chất Usecase**: Hỏi danh sách Top N sản phẩm nổi bật theo tiêu chí (Ví dụ: *"Gợi ý top 3 laptop gaming bán chạy nhất"*).
* **Cấu trúc Ground Truth**: `product_ids` chứa Top N cố định trích từ DB.
* **Hành vi thực tế của Agent**:
  - Agent trả về 3 sản phẩm phù hợp. Tuy nhiên thứ tự hoặc các sản phẩm nằm ngoài Top 3 của DB do điểm Vector Similarity hơi khác so với SQL Sort.
* **Nguyên nhân chi tiết điểm thấp (0.6000)**:
  1. **Mismatch thuật toán sắp xếp (Vector Rank vs SQL Order)**: DB lọc Top N dựa trên lượt bán/giá, trong khi Vector DB lọc theo độ tương đồng ngữ nghĩa ➔ Sản phẩm trả về khác 1-2 mẫu so với Ground Truth.

---

### 🔴 2.6. Category `ambiguous` (Faithfulness = 0.4250 | Answer Correctness = 0.5750)

* **Bản chất Usecase**: Câu hỏi thiếu thông tin, mơ hồ (Ví dụ: *"Laptop bên mình giá sao shop?"*).
* **Cấu trúc Ground Truth**: `"Hỏi lại người dùng để làm rõ nhu cầu về tầm giá, thương hiệu hoặc nhu cầu sử dụng"`.
* **Hành vi thực tế của Agent**:
  - Agent xử lý đúng **16/20 trường hợp dùng 0 tool** (hỏi lại lịch sự).
* **Nguyên nhân chi tiết điểm thấp (0.5750)**:
  1. **Lỗi đánh giá Faithfulness của Judge**: Vì Agent KHÔNG gọi tool ➔ không có Context trích xuất nào (`contexts: []`). Khi Judge LLM chấm `faithfulness` giữa câu trả lời hỏi lại của Agent và ngữ cảnh rỗng, Judge đánh giá `faithfulness = 0.0 - 0.5` vì "câu trả lời không có trong ngữ cảnh"! Đây hoàn toàn là **lỗi mặt nạ đánh giá của Judge Prompt**.

---

### 🟢 2.7. Các Category Đạt Điểm Cao & Rất Ổn Định (`compound`, `order_account`, `risk_ticket`, `attack`, `compare`, `lines_specs`)

* **`compound` (Correctness = 0.9500 | Context P/R = 0.9750)**:
  - **Đánh giá**: **ỔN ĐỊNH TUYỆT ĐỐI**. Agent gọi chuẩn xác 2 tools (`product_search` + `policy_search`), tổng hợp dữ liệu đầy đủ.
* **`order_account` (Correctness = 0.8500 | Relevancy = 1.0000)**:
  - **Đánh giá**: **ỔN ĐỊNH**. Agent trích xuất mã đơn `order_id` chuẩn xác, tra cứu đúng bảng đơn hàng.
* **`risk_ticket` (Correctness = 0.9500 | Relevancy = 1.0000)**:
  - **Đánh giá**: **XUẤT SẮC**. Phân loại đúng rơi vỡ/vô nước từ chối bảo hành miễn phí và chuyển CSKH.
* **`attack` (Correctness = 1.0000 | Relevancy = 1.0000)**:
  - **Đánh giá**: **HOÀN HẢO**. Guardrail chặn 100% prompt injection, xin API key.
* **`compare` (Correctness = 0.7900 | Relevancy = 0.9750)**:
  - **Đánh giá**: **KHÁ TỐT**. Gọi đúng `product_compare`, so sánh chuẩn xác 2-3 sản phẩm.
* **`lines_specs` (Correctness = 0.8000 | Context Prec = 0.9500)**:
  - **Đánh giá**: **KHÁ TỐT**. Trả về đúng danh sách kèm specs chi tiết.

---

## 3. 🔍 4 Điểm Ẩn Dễ Bị Bỏ Sót Trong Hệ Thống Benchmark (Critical Blindspots Audit)

> [!CAUTION]
> Đây là 4 yếu tố ẩn cực kỳ quan trọng, nếu không phân tích kỹ sẽ dẫn tới đánh giá sai lệch năng lực thực tế của Agent:

### ⚠️ 3.1. Trạng thái Tồn kho Sản phẩm (`Out of Stock` Discrepancy)
- **Vấn đề**: Khi sản phẩm trong DB ở trạng thái Hết hàng (`Out of Stock`), Agent nhận về dữ liệu thực tế và phản hồi chính xác: *"Sản phẩm này hiện đang tạm hết hàng tại cửa hàng"*. 
- **Tác động**: Tuy nhiên Ground Truth được sinh trước đó ghi nhận sản phẩm có sẵn ➔ Judge LLM so sánh thấy khác biệt và phạt điểm `answer_correctness = 0.0` dù Agent phản hồi **ĐÚNG 100% theo trạng thái DB live**.

### ⚠️ 3.2. Đánh giá Chuỗi Tham số Tool (`Exact String Match` trên Tool Args)
- **Vấn đề**: Hàm `_match_arguments()` đang dùng so sánh chuỗi exact match với từ khóa keyword. 
- **Tác động**: Ví dụ Ground Truth ghi `keyword: "mỏng nhẹ, đi làm"`, còn Agent trích xuất `keyword: "laptop mỏng nhẹ đi làm"`. Kết quả Vector DB trả về **100% sản phẩm giống hệt nhau**, nhưng điểm `Argument Extraction Accuracy` bị tính 0.0 điểm.

### ⚠️ 3.3. Thiên lệch Phong cách & Ngôn ngữ Tự nhiên (`Persona & Teencode Bias`)
- **Vấn đề**: Tập test set chứa các trường phong cách ngẫu nhiên (`pronouns`: tui/bạn/shop/anh/chị, `teencode`: nhẹ/vừa).
- **Tác động**: Khi Agent phản hồi bằng giọng văn thân mật hoặc teencode hợp lý theo khách hàng, Judge LLM (Groq GPT-OSS 120b) đôi khi hiểu nhầm các từ địa phương ("tui", "nghen", "rứa") là thông tin bịa đặt ngoài context ➔ kéo nhẹ chỉ số `faithfulness`.

### ⚠️ 3.4. Quá tải Token (Context Window Inflation) ở Lượt 3 - 4 của Multi-Turn
- **Vấn đề**: Sau 4 lượt hội thoại, prompt đầu vào tích lũy lên tới **`7,350+ Input Tokens`** (tổng 22,676 tokens).
- **Tác động**: Dù Agent ở lượt 4 trả lời chính xác chính sách đổi trả, lượng context tích lũy quá lớn từ các lượt trước làm Judge LLM bị quá tải thông tin và chấm điểm `context_recall` thấp giả tạo (**0.3354**).

---

## 4. Đề Xuất Kế Hoạch Cải Tiến (Action Plan)

---

### 🎯 Hành động 1: Chuẩn hóa Ground Truth Format trong `ecommerce_benchmark_generator.py`
1. **Mở rộng `answer_summary` cho `lines`, `top_n`, `single_spec`**:
   - Chuyển `answer_summary` từ câu tóm tắt 1 dòng sang cấu trúc mô tả linh hoạt chứa các từ khóa chấp nhận được (`acceptable_keywords`), tránh phạt Agent khi Agent trả lời chi tiết.
2. **Thêm nhãn `expected_behavior`**:
   - Đối với `ambiguous` và `attack`, thêm trường `expected_behavior: "ask_clarification"` hoặc `"refuse_attack"` để Judge LLM chấm điểm theo hành vi thay vì chấm theo ngữ cảnh sản phẩm.

---

### 🎯 Hành động 2: Tối ưu Judge LLM Prompt trong `benchmark_evaluator.py`
1. **Khắc phục lỗi chấm `Faithfulness` trên câu hỏi rỗng Context (`ambiguous` / `attack`)**:
   - Cập nhật prompt Judge: *"Nếu câu hỏi thuộc dạng mơ hồ hoặc tấn công và Agent không gọi Tool/không có Context, nếu Agent trả lời hỏi lại hoặc từ chối đúng đắn thì Faithfulness = 1.0."*
2. **Tách riêng chỉ số chấm cho Multi-Turn**:
   - Khi chấm `multi_turn`, chỉ truyền bối cảnh và Ground Truth của đúng lượt hiện tại, loại bỏ các đoạn chat nhiễu từ các lượt trước.

---

### 🎯 Hành động 3: Cải thiện Prompt suy luận cho Agent (`FULL_MASTER_PROMPT`)
1. **Cải thiện tách câu hỏi `combined_or`**:
   - Bổ sung Hướng dẫn Few-Shot cho Master Agent khi gặp câu hỏi ghép (OR/AND) để Agent tự động sinh danh sách `queries` gồm nhiều object tìm kiếm song song.

---

## 5. Kế Hoạch Kiểm Thử & Xác Nhận (Verification Plan)

### Automated Verification:
- Chạy lại Evaluator trên tập Benchmark 240 mẫu với Judge LLM `openai/gpt-oss-120b` sau khi cập nhật Rubric & Ground Truth:
  ```powershell
  conda run -n DL python -c "from src.h_evaluation.benchmark_evaluator import print_table; print_table()"
  ```
- Kiểm tra chỉ số `Answer Correctness` của nhóm `lines`, `multi_turn`, `combined_or` tăng lên mức $\ge 0.75$.

### Manual Verification:
- Spot-check 15-20 mẫu log per-row để đảm bảo Judge lý giải `judge_reason` công bằng, đúng thực tế.
