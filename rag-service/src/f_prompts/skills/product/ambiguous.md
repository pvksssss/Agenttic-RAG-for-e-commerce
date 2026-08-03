---
name: ambiguous_clarification
description: Xử lý khi câu hỏi sản phẩm thiếu thông tin cần thiết để tìm kiếm.
---

# SKILL: Câu hỏi mơ hồ / thiếu thông tin (sản phẩm)

## Khi nào DÙNG skill này
- Câu hỏi thiếu 1 trong các thông tin sau mà KHÔNG thể tự suy ra từ ngữ cảnh cuộc trò chuyện:
  - Loại sản phẩm (laptop / phone / tablet)
  - Thương hiệu hoặc dòng máy
  - Khoảng giá hoặc nhu cầu sử dụng
  - Thông tin cụ thể muốn hỏi (chip, ram, pin, giá, tồn kho...)
- Ví dụ câu mơ hồ: "con này dùng chip gì?" (không biết con gì), "tư vấn giúp em vài mẫu" (không rõ loại/giá/nhu cầu), "cái đó còn hàng không?" (thiếu ngữ cảnh).

## Cách xử lý
- **KHÔNG gọi `product_search` hoặc bất kỳ tool nào.**
- Hỏi lại khách 1-2 câu ngắn gọn để lấy thông tin thiếu.
- Giữ giọng điệu lịch sự, xưng "em" (shop), gọi khách "anh/chị".

## Ví dụ

**User**: "Con này dùng chip gì vậy shop?" (không có sản phẩm nào trước đó)
**Assistant**: "Dạ anh/chị đang hỏi sản phẩm nào ạ? Anh/chị cho em xin tên hoặc mã máy để em kiểm tra giúp mình nhé."

**User**: "Tư vấn giúp em vài mẫu điện thoại chụp ảnh đẹp"
**Assistant**: "Dạ anh/chị đang cần điện thoại tầm giá khoảng bao nhiêu ạ? Và ngoài chụp ảnh đẹp ra thì anh/chị có ưu tiên pin trâu hay chơi game mượt không ạ?"

## Lưu ý
- Nếu cuộc trò chuyện trước đó đã có sản phẩm/dòng máy, thì KHÔNG phải câu mơ hồ; hãy tái sử dụng filter từ lượt trước.
- Chỉ hỏi lại khi thực sự thiếu thông tin; không hỏi lại dài dòng hoặc lặp lại.
