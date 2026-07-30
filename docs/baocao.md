# Bản báo cáo chi tiết về thực tập:

# 1. Chủ đề thực tập: Xây dựng hệ thống chatbot TMĐT chăm sóc khách hàng bằng kiến trúc Agentic RAG

## 1.1. Lý do chọn đề tài và tính cấp thiết
## 1.2. Mục tiêu nghiên cứu và phát triển
## 1.3. Phạm vi và đối tượng nghiên cứu

# 2. Kiến thức cơ bản và công nghệ áp dụng

## 2.1. Khái niệm Retrieval-Augmented Generation (RAG) và Naive RAG
## 2.2. Khái niệm Agentic RAG và cơ chế ReAct Loop
## 2.3. Cơ chế Gọi hàm (Function Calling) của LLM
## 2.4. Cơ sở dữ liệu Vector và ChromaDB
## 2.5. Khung điều phối đồ thị LangGraph / StateGraph
## 2.6. Cơ chế bảo mật Row-Level Security (RLS) của Supabase

# 3. Kiến trúc chi tiết hệ thống

## 3.1. Quy trình chuẩn bị dữ liệu (Data Pipeline)
### 3.1.1. Thu thập dữ liệu thô (Products & Policies)
### 3.1.2. Phân tích, chuẩn hóa và nạp dữ liệu vào Postgres DB (Supabase)
### 3.1.3. Phân nhỏ (Chunking), nhúng (Embedding) và đồng bộ vào Vector DB (ChromaDB)

## 3.2. Thiết kế Đồ thị hội thoại (LangGraph Architecture)
### 3.2.1. Phân loại rủi ro bảo mật đầu vào (Node `classify_risk` & Guardrails)
### 3.2.2. Bộ não điều khiển Agent (Node `MasterAgent`)
### 3.2.3. Quản lý trạng thái (State Management) và Lịch sử hội thoại (Checkpointing)
### 3.2.4. Cơ chế ngắt mạch an toàn (Circuit Breakers: Max Steps, Loop Prevention, Consecutive Failures)

## 3.3. Cơ chế định tuyến truy vấn (Query Routing)
### 3.3.1. Truy vấn dữ liệu tĩnh qua Vector DB (ChromaDB)
### 3.3.2. Truy vấn dữ liệu động qua Relational DB (Supabase)

## 3.4. Thiết kế hệ thống Công cụ (Tools Design)
### 3.4.1. Nhóm Công cụ Tìm kiếm & Hỗ trợ Sản phẩm (Product Domain Tools)
### 3.4.2. Nhóm Công cụ Tra cứu Chính sách FAQ (Policy Domain Tools)
### 3.4.3. Nhóm Công cụ Cá nhân hóa & Xác thực (Account Domain Tools)

# 4. Kế hoạch Benchmark & Đánh giá (Evaluation)

## 4.1. Quy trình tạo bộ dữ liệu kiểm thử (Test-set Generation)
### 4.1.1. Sinh câu hỏi sản phẩm tiếng Việt tự nhiên bằng LLM
### 4.1.2. Sinh câu hỏi chính sách bằng Ragas TestsetGenerator
## 4.2. Các bộ chỉ số đánh giá (Evaluation Metrics)
### 4.2.1. Chỉ số đánh giá chất lượng câu trả lời bằng Ragas (Judge LLM)
### 4.2.2. Chỉ số đánh giá hành vi Agent & Bảo mật bằng Code Python tự viết
### 4.2.3. Chỉ số đo lường hiệu năng và chi phí vận hành (Latency & Token Usage)
## 4.3. Quy trình chạy thử nghiệm và thu thập kết quả (Execution Pipeline)

# 5. Các khó khăn, vướng mắc gặp phải trong quá trình thực hiện

## 5.1. Hạn chế của công cụ đánh giá tự động (Ragas)
## 5.2. Giới hạn tần suất gọi API (Rate Limits của Free Tier)
## 5.3. Vấn đề trôi thông tin (Information Drift) qua nhiều lớp xử lý
## 5.4. Các giải pháp và cơ chế khắc phục đã áp dụng

# 6. Kết luận và Hướng phát triển tương lai

## 6.1. Các kết quả đã đạt được
## 6.2. Hạn chế còn tồn tại
## 6.3. Hướng nghiên cứu và cải tiến trong tương lai

---

# Các usecase:

# Usecase đơn:
- Thông số sản phẩm: ss s25 dùng chip gì
- Thông số sản phẩm: iPhone 15 dùng chip gì
- Các dòng sản phẩm: có các loại macbook nào
- Các dòng sản phẩm + thông số sản phẩm:  macbook pro nào đáng mua

# Usecase không rõ:
- Câu hỏi không rõ:  4 sản phẩm dùng chip gì

# Usecase kết hợp nhiều điều kiện
- Liệt kê top n sản phẩm với điều kiện:  cho tôi 5 laptop Acer dưới 20 triệu
- Liệt kê top n sản phẩm với điều kiện ghép: cho tôi 4 laptop Acer từ 20 đến 30 triệu
- Liệt kê top n sản phẩm theo dòng và điều kiện, thông số ghép: cho a 5 dòng mac air dưới 30 triệu bên e, thông số của từng dòng là gì...
- Liệt kê top n sản phẩm theo dòng: cho a 5 laptop macbook air dưới 20 triệu, nó gồm những dòng nào
- Liệt kê top n sản phẩm theo dòng kết hợp điều kiện hoặc: cho a 7 dòng laptop macbook air hoặc pro dưới 35 triệu

# Usecase multi-turn:
## Hội thoại 1:
- Cho a hỏi mk có laptop mỏng nhẹ pin trâu giá dưới 30 triệu k e, a đang cần tìm 1 con
- Cho a về 5 sản phẩm chip khủng trên 20 triệu và dưới 30 triệu đi e
- Cho a về 5 sản phẩm có card đồ họa khủng trên 20 triệu và dưới 30 triệu đi e
- Cho a hỏi nữa về mình có các loại macbook nào e nhỉ
- Giúp a so sánh giữa macbook pro và macbook air m5
- Giúp a so sánh giữa macbook pro và macbook air m5 và m4 thử e
- a đang tính tậu 1 con mac về để chạy ai local cho đỡ ngốn tiền, em tư vấn a con nào nhiều ram với

## Hội thoại 2:
- Cho a hỏi mình có các dòng samsung s nào e nhỉ
- Cho a các mẫu dòng s dưới 30 triệu đi e
- cho a thông số của các dòng s25 và s26 đi e
- các dòng trên dùng con chip gì vậy


# Usecase khó:
- Tôi mua máy tuần trước, đang dùng mã giảm giá sinh viên, muốn đổi sang bản RAM 32GB nhưng vẫn giữ ưu đãi, nếu hết hàng thì gợi ý giúp tôi sản phẩm tương đương