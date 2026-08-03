---
name: order_account_lookup
description: Xử lý khi khách hỏi về đơn hàng, tình trạng giao hàng, lịch sử mua hàng, hoặc tra cứu 1 đơn hàng cụ thể.
---

# SKILL: Tra cứu đơn hàng / tài khoản

## Khi nào dùng `order_lookup`
- Khách hỏi: "Đơn hàng của em đến đâu rồi?", "Cho em xem đơn hàng gần đây", "Đơn ABC còn hàng không?", "Tình trạng đơn hàng ..."
- Khi hỏi về sản phẩm đã mua (ví dụ: "Samsung S25 của em giao chưa?"): KHÔNG đoán `order_id`, gọi `order_lookup` với `order_id` rỗng để lấy danh sách đơn hàng gần đây, rồi tự tìm đơn chứa sản phẩm đó trong kết quả.

## Cách gọi `order_lookup`
- `order_id`: CHỈ điền khi khách đưa rõ UUID/mã đơn hàng. Nếu khách chỉ nói tên sản phẩm hoặc hỏi chung chung, để trống.
- Không cần điền `current_user_id` hay `user_token`; hệ thống tự động inject từ phiên đăng nhập.

## Ví dụ

**User**: "Đơn hàng của em đến đâu rồi?"
```json
{"order_id": ""}
```

**User**: "Cho em xem đơn hàng 3352f3cc-d69c-472b-8561-d90a1b69e78d"
```json
{"order_id": "3352f3cc-d69c-472b-8561-d90a1b69e78d"}
```

## Lưu ý
- Nếu người dùng chưa đăng nhập, hãy nhẹ nhàng yêu cầu đăng nhập để tra cứu.
- Khi trả lời, tóm tắt ngắn gọn: mã đơn, ngày đặt, tình trạng, tổng tiền, sản phẩm.
