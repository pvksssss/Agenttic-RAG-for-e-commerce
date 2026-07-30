# Tài liệu `EcommerceBenchmarkGenerator`

## 1. Mục tiêu

`EcommerceBenchmarkGenerator` là module tùy chỉnh để sinh bộ dữ liệu benchmark cho agentic RAG thương mại điện tử tiếng Việt. Module này:

- Sinh đa dạng usecase: đơn, mơ hồ, top-N, so sánh, điều kiện kết hợp, hội thoại nhiều lượt, usecase khó.
- Dùng dữ liệu thật từ **Supabase** để tính `ground_truth` chính xác.
- Hỗ trợ xoay vòng API key Gemini và rate-limit.
- Xuất chuẩn **RAGAS-friendly / benchmark JSONL**.
- Dễ mở rộng: chỉ cần thêm sample câu hỏi mới, LLM tự phân loại và sinh biến thể.

---

## 2. Vị trí file

- Module Python: `rag-service/src/h_evaluation/ecommerce_benchmark_generator.py`
- Notebook demo: `rag-service/notebooks/12_ecommerce_benchmark_generator.ipynb`
- Script kiểm tra hành vi (optional): `rag-service/notebooks/test_generated_benchmark.py`
- Tài liệu này: `rag-service/docs/ecommerce_benchmark_generator_doc.md`

---

## 3. Cấu trúc module

### 3.1. `GeminiLLM`

Wrapper gọi Gemini với:

- **Xoay key tự động**: dùng `GeminiKeyManager` để chuyển sang key khác khi gặp lỗi `429 / resource_exhausted / quota / rate limit`.
- **Rate-limit tối thiểu**: chờ `min_interval_s` giây giữa các lần gọi (mặc định 4 giây).
- **Retry**: thử lại `len(keys) * 2 + 1` lần trước khi raise.

```python
from src.h_evaluation.ecommerce_benchmark_generator import GeminiLLM

llm = GeminiLLM(min_interval_s=4.0)
text = llm.generate("Viết 1 câu hỏi về laptop mỏng nhẹ", response_mime_type="text/plain")
```

### 3.2. `ProductCatalog`

Load và cache danh sách sản phẩm từ Supabase. Các cột chính:

- `id`, `name`, `brand`, `category`, `price`, `final_price`, `stock`
- `cpu`, `ram`, `storage`, `display_size`, `battery`
- `description`, `specs` JSONB

Khi load, module tính thêm trường `line` bằng cách **cắt tên sản phẩm trước các token thông số / mã SKU**:

```
Laptop Lenovo Yoga Slim 7 14IPH11 83QM002EVN
→ line = "Laptop Lenovo Yoga Slim 7"

MacBook Pro M5 Pro 14 inch 2026 15CPU 16GPU 48GB 1TB
→ line = "MacBook Pro M5 Pro 14 inch"
```

Các phương thức chính:

- `sample_product(brand=, category=)`: chọn ngẫu nhiên 1 sản phẩm.
- `products_by_filter(...)`: lọc theo brand, category, khoảng giá, name_contains, line.
- `distinct_brands(category=)`, `distinct_lines(brand=, category=)`.
- `price_range(...)`: min/max final_price.

### 3.3. `EcommerceBenchmarkGenerator`

Lớp chính, gồm các phương thức sinh từng nhóm usecase:

| Method | Usecase | Ví dụ câu hỏi |
|---|---|---|
| `generate_single_spec` | Hỏi thông số 1 sản phẩm | "Laptop X dùng chip gì?" |
| `generate_lines` | Liệt kê các dòng máy | "Có các loại MacBook nào?" |
| `generate_lines_specs` | Dòng máy + thông số | "Cho a 5 dòng Mac Air dưới 30 triệu, thông số từng dòng?" |
| `generate_top_n` | Top-N theo điều kiện | "Cho tôi 5 laptop Acer dưới 20 triệu" |
| `generate_combined_or` | Điều kiện `hoặc` | "7 dòng MacBook Air hoặc Pro dưới 35 triệu" |
| `generate_ambiguous` | Câu mơ hồ / thiếu bối cảnh | "4 sản phẩm dùng chip gì?" |
| `generate_compare` | So sánh 2–3 dòng | "MacBook Pro hay MacBook Air M5?" |
| `generate_multi_turn` | Hội thoại nhiều lượt | 7-turn conversation |
| `generate_hard` | Edge case chính sách/đổi trả | "Mua tuần trước, muốn đổi RAM 32GB vẫn giữ ưu đãi..." |
| `generate_from_samples` | Mở rộng từ câu mẫu mới | Bất kỳ câu nào user cung cấp |
| `generate_all` | Sinh tất cả nhóm với tỷ lệ tùy chỉnh | — |

---

## 4. Luồng sinh câu hỏi

### Bước 1: Chọn seed từ catalog

Ví dụ với `generate_top_n`:

```python
brand = random.choice(catalog.distinct_brands(category="laptop"))   # "Acer"
min_p, max_p = _choose_price_window(brand=brand, category="laptop")  # 20–30 triệu
top_n = random.choice([3, 4, 5])                                    # 5
```

### Bước 2: Dùng LLM paraphrase thành tiếng Việt tự nhiên

```python
prompt = f"Viết 1 câu hỏi tự nhiên... {top_n} laptop {brand} từ {min_p} đến {max_p} triệu."
question = llm.generate(prompt, response_mime_type="text/plain")
```

### Bước 3: Tính ground truth từ Supabase

```python
products = catalog.products_by_filter(
    brand=brand,
    category="laptop",
    min_price=min_p,
    max_price=max_p,
    sort_by="final_price",
    ascending=True
)[:top_n]
```

### Bước 4: Nhóm dòng máy khi cần

Với `mode='lines'`, mỗi dòng chọn 1 đại diện rẻ nhất:

```python
representatives = _representative_per_line(products)[:5]
```

### Bước 5: Gán expected tool calls

```json
{
  "tool": "product_search",
  "args": {
    "queries": [
      {
        "brand": "Acer",
        "category": "laptop",
        "min_price": 20000000,
        "max_price": 30000000,
        "limit": 5,
        "mode": "rank",
        "include_details": true
      }
    ]
  }
}
```

### Bước 6: Lưu record

```json
{
  "id": "top_n_20260727152052_0004",
  "category": "top_n",
  "question": "Shop ơi, tư vấn giúp mình 5 mẫu laptop Acer tầm giá từ 20 đến 30 triệu...",
  "expected_tool_calls": [...],
  "ground_truth": {
    "product_ids": [...],
    "answer_summary": "..."
  },
  "metadata": {...},
  "contexts": ["description", ...]
}
```

---

## 5. Xử lý usecase đặc biệt

### 5.1. `combined_or` — điều kiện `hoặc`

- Chọn 2 dòng (MacBook Air, MacBook Pro).
- Tìm khoảng giá sao cho cả 2 dòng đều có sản phẩm.
- `expected_tool_calls` chứa 2 query riêng, mỗi query 1 dòng.
- Ground truth là hợp của 2 tập, nhóm theo dòng.

### 5.2. `multi_turn` — hội thoại

- Dùng list sẵn các lượt hội thoại.
- Mỗi lượt được LLM paraphrase lại để tự nhiên.
- Có thể bật/tắt qua `enable_multi_turn`.
- Record dạng:

```json
{
  "category": "multi_turn",
  "turns": [
    {"turn": 1, "question": "...", "expected_tool_calls": [], "ground_truth": ""},
    ...
  ]
}
```

### 5.3. `ambiguous`

- Sinh câu thiếu bối cảnh (ví dụ: “Tư vấn e máy này với”).
- `expected_tool_calls` rỗng.
- `ground_truth` là hướng dẫn hỏi lại.

### 5.4. `hard`

- Kết hợp chính sách đổi trả, mã giảm giá, tình trạng hết hàng.
- `expected_tool_calls` có thể gồm `policy_search`, `order_lookup`.
- Ground truth là kịch bản xử lý thay vì product_ids.

---

## 6. Mở rộng usecase mới (`generate_from_samples`)

Cung cấp 1 câu mẫu, LLM sẽ:

1. Parse thành JSON: `(category, brand, category_product, line, n, min_price, max_price, ...)`.
2. Sinh `n_per_sample` biến thể văn phong khác nhau.
3. Tính lại ground_truth từ Supabase theo params đã parse.

```python
gen.generate_from_samples(
    ["cho tôi 5 laptop Dell dưới 25 triệu"],
    n_per_sample=3
)
```

---

## 7. Chuẩn output

Mỗi record RAGAS-friendly chứa:

- `id`: ID duy nhất.
- `category`: loại usecase.
- `question` hoặc `turns`: câu hỏi / hội thoại.
- `expected_tool_calls`: công cụ + tham số mong đợi.
- `ground_truth`:
  - `product_ids`: danh sách ID sản phẩm đúng.
  - `answer_summary`: câu trả lời tóm tắt dùng làm `ground_truth` cho RAGAS.
  - `specs` / `specs_per_line`: thông số chi tiết (nếu cần).
- `metadata`: thông tin bổ sung.
- `contexts`: mảng description dùng làm `contexts` cho RAGAS.

---

## 8. Xoay vòng API key

```python
class GeminiLLM:
    def __init__(self, gemini_keys=None, model=None, min_interval_s=4.0):
        self.key_manager = GeminiKeyManager(gemini_keys or load_keys_from_settings(settings, "GEMINI"))
```

Khi gặp lỗi 429, module tự động `rotate()` và tạo client mới. Số key lấy từ:

- `settings.GEMINI_API_KEY`
- `settings.GEMINI_API_KEY_2`
- `settings.GEMINI_API_KEY_3`

---

## 9. ChromaDB

Hiện tại module lấy `description` từ Supabase làm `contexts`. Nếu cần truy vấn **ChromaDB** để lấy chunks phong phú hơn, có thể bổ sung:

```python
from src.b_indexing.b0_vector_db import ChromaVectorDatabase

db = ChromaVectorDatabase(settings, config)
result = db.query(collection_name="...", query_texts=[product_name], n_results=3)
```

và thêm chunks vào `contexts` của record.

---

## 10. Cách dùng notebook 12

```bash
cd rag-service/notebooks
jupyter notebook 12_ecommerce_benchmark_generator.ipynb
```

Các cell chính:

1. Import.
2. Kiểm tra catalog.
3. Khởi tạo `EcommerceBenchmarkGenerator`.
4. Chạy `generate_all` với số lượng tùy chỉnh.
5. In và validate mẫu.
6. Lưu `ecommerce_benchmark_test.jsonl`.

---

## 11. Test hành vi với agent

```bash
cd rag-service/notebooks
python test_generated_benchmark.py
```

Script này:

- Compile LangGraph `app` từ `07_01_workflow1.ipynb`.
- Chọn 6 câu đại diện từ `ecommerce_benchmark_test.jsonl`.
- Chạy agent, so sánh tool thực gọi với `expected_tool_calls`.
- Lưu `generated_benchmark_test_results.jsonl`.

File này **optional** — chỉ dùng khi muốn kiểm tra, không cần cho việc sinh data.

---

## 12. Hạn chế và lưu ý

- `name_contains` trong `expected_tool_calls` là từ khóa ngắn, có thể agent cần thêm xử lý nếu tên dòng phức tạp.
- Câu `multi_turn` hiện dùng template cố định; muốn đa dạng hơn có thể sinh từ theme.
- Max price trong `lines_specs` / `lines` có thể lên cao (~100 triệu) nếu catalog có sản phẩm đắt. Có thể capping thêm nếu muốn gần thực tế hơn.
- `contexts` hiện chỉ từ `description` Supabase, chưa lấy từ ChromaDB.

---

## 13. Tóm tắt file quan trọng

| File | Mục đích |
|---|---|
| `src/h_evaluation/ecommerce_benchmark_generator.py` | Module sinh benchmark |
| `notebooks/12_ecommerce_benchmark_generator.ipynb` | Notebook demo và xuất data |
| `notebooks/test_generated_benchmark.py` | Kiểm tra hànhVi agent (optional) |
| `notebooks/ecommerce_benchmark_test.jsonl` | Dữ liệu benchmark sinh ra |
| `notebooks/generated_benchmark_test_results.jsonl` | Kết quả chạy thử trên agent |
