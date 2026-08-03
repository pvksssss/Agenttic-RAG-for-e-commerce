---
name: policy_search
description: Xử lý khi khách hỏi về chính sách cửa hàng (đổi trả, bảo hành, trả góp, giao hàng, hủy đơn, khuyến mãi).
---

# SKILL: Tra cứu chính sách

## Khi nào dùng `policy_search`
- Khách hỏi về: đổi trả, bảo hành, trả góp, giao hàng, hủy đơn, khuyến mãi, chính sách bảo hành, thời gian đổi trả.
- Ví dụ: "Mua rồi đổi trong 7 ngày được không?", "Bảo hành bao lâu?", "Có trả góp không shop?"

## Cách gọi `policy_search`
- `key_word`: từ khóa ngắn gọn bằng tiếng Việt, phản ánh đúng chủ đề khách hỏi.
- Nếu câu hỏi kết hợp sản phẩm + chính sách, vẫn gọi `product_search` cho sản phẩm trước (nếu cần), rồi gọi `policy_search` cho chính sách.

## Ví dụ

**User**: "Mua rồi đổi trong 7 ngày được không?"
```json
{"key_word": "đổi trả"}
```

**User**: "Bảo hành laptop bao lâu vậy shop?"
```json
{"key_word": "bảo hành laptop"}
```

## Lưu ý
- Trả lời dựa trên context `policy_search` trả về, không bịa ra chính sách.
- Nếu context không đủ, nói rõ "theo chính sách hiện có" và đề nghị liên hệ hotline/shop.
