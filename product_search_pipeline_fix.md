# Hướng dẫn sửa: Product Search & Compare — Hybrid Filter (SQL trước, Semantic sau)

## Bối cảnh

Giá/tồn kho đã được chuyển ra khỏi Vector DB (Chroma) sang Supabase (dữ liệu cập nhật
theo thời gian thực, không nên nhúng vào embedding tĩnh). Hiện `product_search` và
`product_compare` đang xử lý sai thứ tự: search semantic trước, tra giá sau — khiến
không thể lọc theo khoảng giá trước khi tìm ngữ nghĩa (case: "laptop mỏng nhẹ pin trâu
dưới 20 triệu"), và `product_compare` không lấy được giá vì đọc thẳng metadata Chroma
(đã bị xóa giá).

File cần sửa: `product_search.py`, `product_compare.py`.

---

## Nguyên tắc bắt buộc: tách 2 loại điều kiện, xử lý bằng 2 cơ chế khác nhau

| Loại điều kiện | Field | Xử lý bằng | Lý do |
|---|---|---|---|
| **Cứng / có cấu trúc** | `brand`, `category`, `min_price`, `max_price` | SQL (Supabase) hoặc metadata filter (Chroma `where`) | Dữ liệu chính xác, tập giá trị hữu hạn hoặc số |
| **Mờ / mô tả tự nhiên** | tên/model sản phẩm, đặc điểm định tính (mỏng nhẹ, pin trâu, chơi game...) | Semantic search (Chroma `query_texts`) | Không có field cấu trúc tương ứng, cần similarity |

**Tuyệt đối không** dùng SQL/exact-match để so khớp tên sản phẩm (vd `WHERE name LIKE '%S24%'`)
— tên có vô số biến thể viết (S24, SS S24, Galaxy S24, Samsung Galaxy S24...), SQL exact
match sẽ miss các biến thể này. Việc so khớp tên LUÔN đi qua semantic search.

---

## Luồng xử lý mới cho `product_search`

**Cấu trúc input — CHUYỂN `brand`/`min_price`/`max_price` XUỐNG CẤP PER-ITEM**
(quyết định thiết kế: bottleneck thật là số LƯỢT GỌI LLM, không phải số lượt query
Supabase — nên ưu tiên cho phép 1 lượt tool call xử lý được nhiều filter khác nhau
cùng lúc, thay vì ép model phải gọi tool nhiều lần cho mỗi filter khác nhau, vốn dễ
khiến model yếu bỏ sót ý sau trong câu hỏi ghép):

```
{
  queries: [
    {
      keyword: str,               # CHỈ phần mô tả ngữ nghĩa, không lặp brand/giá
      include_details?: bool,
      need_price_info?: bool,
      brand?: str,                 # RIÊNG cho item này
      min_price?: number,          # RIÊNG cho item này
      max_price?: number,          # RIÊNG cho item này
    },
    ...
  ],
  limit?: int                      # vẫn giữ ở cấp ngoài — chỉ là số lượng hiển thị,
                                    # không phải điều kiện lọc, không có vấn đề "vỏ dừa"
}
```

Ví dụ: *"tìm Dell dưới 20 triệu và Asus dưới 25 triệu"* → 1 lần gọi tool, 2 item:
`[{keyword: "laptop", brand: "Dell", max_price: 20000000}, {keyword: "laptop",
brand: "Asus", max_price: 25000000}]` — không cần 2 lượt gọi tool riêng.

```
BƯỚC 0 — Với MỖI item trong queries, xác định has_hard_filter RIÊNG cho item đó
    for q in queries:
        q["has_hard_filter"] = any([q.get("brand"), q.get("min_price"), q.get("max_price")])

BƯỚC 1 — Gom các item có has_hard_filter=True, DEDUPE theo (brand, min_price,
         max_price) giống hệt nhau để tránh query Supabase trùng lặp
    filter_groups = group_items_by((brand, min_price, max_price))
    for (brand, min_price, max_price), items_in_group in filter_groups:
        SELECT id, price, final_price, discount, stock, sku
        FROM products
        WHERE (brand = :brand IF brand) AND (price >= :min_price IF min_price)
                                         AND (price <= :max_price IF max_price)
        candidate_ids_for_group = [...]
        price_info_map_for_group = {...}
        -- Gán candidate_ids_for_group + price_info_map_for_group cho MỌI item
           trong items_in_group (không query lại cho từng item riêng lẻ).

BƯỚC 2 — Xử lý RIÊNG cho từng item khi candidate_ids của item đó RỖNG
    (logic giống bản trước, nhưng giờ CÔ LẬP theo từng item — 1 item rỗng
    KHÔNG làm dừng xử lý các item khác trong cùng batch):

    a) Rỗng do min_price/max_price (chính xác, không alias) -> item đó trả
       "không tìm thấy sản phẩm phù hợp mức giá này", các item khác vẫn tiếp
       tục xử lý bình thường.

    b) Rỗng do nghi ngờ brand bị lệch alias -> RETRY chỉ riêng item đó, bỏ
       brand, dùng candidate_ids mới. Chuẩn hóa brand qua dict alias tĩnh
       trước khi query (vd {"ss": "Samsung", ...}) để giảm tần suất case này.

BƯỚC 3 — Semantic search trong Chroma, cho từng item
    for q in queries:
        if q["has_hard_filter"] and q candidate_ids không rỗng:
            collection.query(query_texts=[q["keyword"]],
                              where={"id": {"$in": q_candidate_ids}}, n_results=limit)
        else:  # không có filter cho item này -> search toàn catalog, không regression
            collection.query(query_texts=[q["keyword"]], n_results=limit)

BƯỚC 4 — Item nào semantic search rỗng -> chỉ báo "không tìm thấy" cho riêng
    item đó, không ảnh hưởng các item khác (giống bước 2, tính độc lập theo item).

BƯỚC 5 — Merge giá theo need_price_info CỦA TỪNG ITEM
    Nếu item có has_hard_filter=True: giá đã có sẵn từ bước 1 (theo group),
    hiển thị nếu need_price_info=True cho item đó.
    Nếu item có has_hard_filter=False và need_price_info=True: gom các item
    này lại, query Supabase 1 LẦN cho toàn bộ id cần giá (không phải theo
    từng item riêng lẻ trong loop).
```

### Cập nhật tool schema (`PRODUCT_SEARCH_SCHEMA`)

**Description tổng của tool** — làm rõ mỗi item có filter riêng, khuyến khích
model tách 1 câu hỏi ghép thành nhiều item thay vì gọi tool nhiều lần:

```
"description": (
    "Search for one or multiple electronic products. Each item in `queries` can "
    "have ITS OWN brand/min_price/max_price filter — if the customer asks about "
    "multiple products with DIFFERENT conditions in one message (e.g. 'Dell dưới "
    "20 triệu và Asus dưới 25 triệu'), split them into separate items in a SINGLE "
    "call rather than calling this tool multiple times. If brand/min_price/"
    "max_price are provided for an item, the system pre-filters candidates by "
    "these exact conditions FIRST, then ranks semantically within that filtered "
    "set — always fill these fields when known instead of embedding them in the "
    "keyword text. Use include_details=True for technical specs (chip, RAM, "
    "display, battery...). Use need_price_info=True when asking about price, "
    "discount, stock, or SKU. Default both to False to save tokens."
)
```

**Schema từng field trong 1 item của `queries`**:

```
"keyword": (
    "Chỉ chứa phần MÔ TẢ ngữ nghĩa (tên sản phẩm, đặc điểm định tính: mỏng nhẹ, "
    "pin trâu, chơi game...). KHÔNG lặp lại brand hoặc giá trong keyword — đã có "
    "field riêng cùng cấp (brand, min_price, max_price) NGAY TRONG ITEM NÀY. Ví "
    "dụ: 'laptop Asus mỏng nhẹ pin trâu dưới 25 triệu' -> keyword: 'laptop mỏng "
    "nhẹ pin trâu', brand: 'Asus', max_price: 25000000 (cùng trong 1 item)."
)
"brand": "Thương hiệu để lọc chính xác trước khi tìm ngữ nghĩa, CHỈ áp dụng cho "
         "item này (khác item có thể khác brand). Để trống nếu khách không nhắc rõ."
"min_price": "Giá tối thiểu (VNĐ) lọc trước, CHỈ áp dụng cho item này."
"max_price": "Giá tối đa (VNĐ) lọc trước, CHỈ áp dụng cho item này (vd 'dưới 20 "
             "triệu' -> 20000000)."
```

**Lưu ý khi implement dedupe (bước 1)**: nhóm các item theo tuple
`(brand, min_price, max_price)` — kể cả `None` cũng là 1 giá trị nhóm hợp lệ
(vd 2 item cùng không có filter nào thì gộp chung 1 nhóm "không filter", không
cần query Supabase cho nhóm này). Với quy mô 1 lần gọi thường chỉ 2-4 item
(chatbot CSKH, không phải batch lớn), dedupe là tối ưu tốt nhưng không bắt
buộc phải cực kỳ hiệu quả — vài query Supabase riêng lẻ vẫn đủ nhanh nếu bỏ
qua bước dedupe trong lần implement đầu, có thể thêm sau nếu cần.

---

## Luồng xử lý mới cho `product_compare`

Vấn đề hiện tại: đọc thẳng `metadata.get("price")` từ Chroma — sau khi bỏ giá khỏi
vector DB, field này luôn trả `"Unknown"`.

```
BƯỚC 1 — Với mỗi tên trong product_names: semantic search lấy best-match ID
    (giữ nguyên logic hiện tại — đây là bước match TÊN, luôn qua semantic,
    không đổi)
    -> matched_ids = [id1, id2, ...]  (loại bỏ None nếu có tên không match được)

BƯỚC 2 — Batch query Supabase 1 LẦN DUY NHẤT cho toàn bộ matched_ids
    SELECT id, price, final_price, discount, stock, sku
    FROM products WHERE id IN (matched_ids)
    -- KHÔNG query riêng lẻ từng sản phẩm trong loop — gộp 1 lần để tránh
       N round-trip cho N sản phẩm so sánh.

BƯỚC 3 — Merge giá từ bước 2 vào từng entry so sánh (thay cho
    metadata.get("price", "Unknown") hiện tại)
```

---

## Checklist test sau khi sửa

- [ ] "laptop HP dưới 20 triệu" — không có mô tả định tính → SQL lọc brand+giá, semantic gần như no-op, trả đúng sản phẩm HP đúng giá
- [ ] "laptop mỏng nhẹ pin trâu dưới 20 triệu" — SQL lọc giá trước, semantic rerank "mỏng nhẹ pin trâu" trong tập đã lọc giá
- [ ] "laptop Asus mỏng nhẹ pin trâu dưới 25 triệu" — SQL lọc brand+giá, semantic rerank mô tả
- [ ] "SS S24 còn hàng không" — brand alias "ss"→"Samsung" chuẩn hóa đúng, semantic match "S24"≈"Galaxy S24" trong tập đã lọc brand
- [ ] Câu hỏi chỉ có giá, KHÔNG có sản phẩm nào trong khoảng giá đó thật sự (case B-a) — phải trả "không tìm thấy" trung thực, KHÔNG bị fallback hiện sản phẩm sai giá
- [ ] Câu hỏi có brand bị viết sai/lạ không có trong dict alias (case B-b) — fallback bỏ brand, vẫn tìm được theo semantic thay vì báo "hết hàng" nhầm
- [ ] Câu hỏi không có điều kiện cứng nào (vd chỉ "laptop pin trâu") — bỏ qua SQL, search toàn catalog như hành vi cũ, không regression
- [ ] "Tìm Dell dưới 20 triệu và Asus dưới 25 triệu" (2 filter khác nhau) — xử lý được trong 1 LẦN gọi tool (2 item, mỗi item filter riêng), không cần model gọi tool 2 lần
- [ ] 1 item trong batch bị rỗng do giá (case a) — chỉ item đó báo "không tìm thấy", các item khác trong cùng batch vẫn trả kết quả bình thường (không bị kéo theo lỗi)
- [ ] 2 item trong batch vô tình cùng chung (brand, min_price, max_price) — chỉ 1 lượt query Supabase cho nhóm đó (dedupe), không query trùng lặp
- [ ] Nhiều item cùng có `need_price_info=True` và không có hard filter — gộp 1 lượt query Supabase cho toàn bộ id cần giá, không phải N lượt riêng lẻ
- [ ] `product_compare` với 2-3 sản phẩm — giá hiển thị đúng (không còn "Unknown"), chỉ 1 lượt query Supabase cho cả batch

---

## Không đổi (ngoài phạm vi sửa lần này)

- Cấu trúc `ProductRetriever.retrieve()` — chỉ thêm tham số `where` khi gọi, không
  đổi logic bên trong retriever.
- Cách xử lý `include_details` trong `product_search` — giữ nguyên, vẫn per-item.
- Vấn đề embedding recall cho alias tên sản phẩm ngoài brand (vd "S24" tự thân,
  không qua brand filter) — xử lý riêng ở đợt sau (chuẩn hóa alias tên sản phẩm/
  fuzzy match), không nằm trong phạm vi sửa lần này.
- Tham số `limit` vẫn để ở cấp tool call ngoài (không đẩy xuống per-item) — đây chỉ
  là số lượng hiển thị, không phải điều kiện lọc ảnh hưởng đến tính đúng-sai của kết
  quả, nên không có rủi ro giống brand/giá.
