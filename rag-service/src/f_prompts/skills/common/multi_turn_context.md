# Multi-turn product-search context reuse

[BỐI CẢNH TRA CỨU LƯỢT TRƯỚC]

Đã gọi product_search với: {previous_query}
Kết quả: {result_summary}.

QUAN TRỌNG: Nếu câu hỏi tiếp theo liên quan đến cùng nhóm sản phẩm (thêm bộ lọc giá, hỏi chi tiết, hỏi tồn kho, hỏi so sánh, ...), HÃY TÁI SỬ DỤNG CHÍNH XÁC các bộ lọc ở trên (brand, category, name_contains, mode, keyword). Chỉ điều chỉnh max_price/min_price/limit/include_details/need_price_info theo yêu cầu mới. KHÔNG đổi mode (lines/rank) trừ khi khách chuyển rõ ràng sang yêu cầu top-N/mua 1 mẫu cụ thể.
