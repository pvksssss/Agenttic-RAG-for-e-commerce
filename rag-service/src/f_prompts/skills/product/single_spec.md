---
name: single_spec_lookup
description: Trả lời khi khách hỏi 1 thông số cụ thể của 1 sản phẩm (chip, ram, pin, camera, giá, tồn kho...).
---

# SKILL: Hỏi 1 thông tin cụ thể của 1 sản phẩm

## Khi nào dùng
- Khách hỏi chi tiết 1 sản phẩm cụ thể: "con Laptop ASUS ROG Zephyrus G16 này xài chip gì?", "iPhone 15 Pro Max còn hàng không?", "MacBook Air M1 pin bao nhiêu?"
- Sản phẩm được nhắc bằng tên đầy đủ hoặc đủ để xác định dòng.

## Cách gọi `product_search`
- `limit` **phải là 1** vì chỉ quan tâm 1 sản phẩm.
- `name_contains`: tên dòng / series ngắn, ví dụ `"ROG Zephyrus G16"`, `"iPhone 15 Pro Max"`, `"MacBook Air"`. KHÔNG dùng mã SKU.
- `keyword`:
  - Nếu sản phẩm có nhiều variant (cùng dòng nhưng khác RAM/SSD/màu), dùng **tên sản phẩm đầy đủ** làm keyword để chọn đúng variant. Ví dụ: `"Laptop ASUS ROG Zephyrus G16 GU606AW-TB052WS"`.
  - Nếu chỉ muốn nhấn mạnh thông tin cần hỏi, keyword có thể bắt đầu bằng từ khóa ngữ nghĩa như `"chip"`, `"pin"`, `"tồn kho"`, `"giá"`, `"camera"` rồi kèm tên sản phẩm/dòng để tránh nhầm variant.
- `brand` và `category`: điền nếu khách nhắc rõ hoặc suy ra từ tên sản phẩm.
- `include_details=True` khi hỏi thông số kỹ thuật (chip, ram, pin, màn, camera, bộ nhớ).
- `need_price_info=True` khi hỏi giá, tồn kho, discount, SKU.
- KHÔNG đặt `include_details=True` và `need_price_info=True` cùng lúc cho 1 câu hỏi đơn giản.

## Ví dụ

**User**: "Cho chị hỏi chiếc Laptop ASUS ROG Zephyrus G16 GU606AW-TB052WS này dùng chip gì vậy em?"
```json
{
  "queries": [{
    "keyword": "Laptop ASUS ROG Zephyrus G16 GU606AW-TB052WS",
    "brand": "ASUS",
    "category": "laptop",
    "name_contains": "ROG Zephyrus G16",
    "limit": 1,
    "include_details": true
  }]
}
```

**User**: "iPhone 15 Pro Max còn hàng không shop?"
```json
{
  "queries": [{
    "keyword": "tồn kho iPhone 15 Pro Max",
    "brand": "Apple",
    "category": "phone",
    "name_contains": "iPhone 15 Pro Max",
    "limit": 1,
    "need_price_info": true
  }]
}
```

## Lưu ý
- Nếu khách chỉ nói "con này" mà không có ngữ cảnh sản phẩm → KHÔNG gọi tool, hỏi lại.
- Sau khi có kết quả, trả lời NGẮN GỌN và đúng trọng tâm, không liệt kê thêm thông số không liên quan.
