# 🛍️ Agentic RAG cho Thương Mại Điện Tử

[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg?logo=python&logoColor=white)](https://www.python.org/)
[![LangGraph](https://img.shields.io/badge/Orchestration-LangGraph-orange.svg?logo=langchain&logoColor=white)](https://www.langchain.com/langgraph)
[![Next.js 15](https://img.shields.io/badge/Frontend-Next.js%2015-black.svg?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-emerald.svg?logo=supabase&logoColor=white)](https://supabase.com/)
[![ChromaDB](https://img.shields.io/badge/VectorDB-ChromaDB-purple.svg)](https://www.trychroma.com/)
[![OpenRouter](https://img.shields.io/badge/LLM%20%26%20Embed-OpenRouter-red.svg)](https://openrouter.ai/)

Hệ thống RAG thông minh (Agentic RAG) hỗ trợ tư vấn bán hàng, tra cứu thông tin sản phẩm, kiểm tra giá và tồn kho theo thời gian thực, cùng khả năng quản lý hội thoại đa lượt. Hệ thống kết hợp khả năng điều phối Agent, mô hình suy luận ReAct, cơ sở dữ liệu Vector Search và hệ quản trị cơ sở dữ liệu quan hệ SQL.

---

## 🌟 Tính Năng Nổi Bật

- 🛡️ **An Ninh & Guardrail Phân Loại 3 Cấp**:
  - Phân loại yêu cầu người dùng thành an toàn, cần tạo yêu cầu hỗ trợ, hoặc các hành vi tấn công (Prompt Injection / Roleplay Jailbreak).
  - Tự động chuyển hướng các truy vấn vi phạm sang luồng xử lý từ chối và kích hoạt cảnh báo giao diện.
- 🤖 **Agent Suy Luận Đa Lượt (Multi-turn ReAct Agent)**:
  - Tự động phân tích nhu cầu người dùng qua nhiều lượt hội thoại, chủ động gọi các công cụ truy xuất thích hợp.
  - Lưu trữ và quản lý trạng thái hội thoại liên tục qua từng phiên làm việc.
- ⚡ **Kiến Trúc Truy Xuất Kết Hợp (Hybrid RAG)**:
  - Vector Search: Tra cứu tìm kiếm ngữ nghĩa đối với thuộc tính sản phẩm và văn bản chính sách.
  - SQL Search: Lọc điều kiện cứng theo khoảng giá, thương hiệu, danh mục và tra cứu tồn kho thực tế.
- 🛠️ **Bộ Công Cụ Nghiệp Vụ Chuyên Sâu**:
  - Tìm kiếm sản phẩm theo thứ tự phù hợp hoặc gom nhóm theo từng dòng máy/series.
  - So sánh thông số kỹ thuật và giá cả trực quan giữa các sản phẩm.
  - Tra cứu chính sách bảo hành, đổi trả, giao hàng và thông tin đơn hàng.

---

## 🏗️ Kiến Trúc Luồng Xử Lý

```text
[👤 Khách hàng / Web UI] 
          │
          ▼
[🛡️ Guardrail Router] ───(Phát hiện tấn công)──=> [🚫 Luồng Từ Chối & Cảnh Báo UI]
          │
    (An toàn)
          │
          ▼
[🤖 Master ReAct Agent] <===> [🛠️ Bộ Công Cụ Truy Xuất & Tra Cứu]
          │                                         │
          │                                         ├──=> [🔮 Vector DB: Tra cứu ngữ nghĩa & chính sách]
          │                                         │
          │                                         └──=> [🗄️ SQL DB: Lọc cứng giá, tồn kho thời gian thực]
          ▼
[🧠 Trạng Thái Hội Thoại / Memory State]
          │
          ▼
[💬 Phản Hồi Người Dùng & Thống Kê Hiệu Năng]
```

---

## 🚀 Hướng Dẫn Khởi Chạy

### 1. 🐍 Cài đặt môi trường Python

```bash
# Kích hoạt môi trường của bạn
conda activate your_env_name

# Cài đặt các thư viện phụ thuộc
pip install -r requirements.txt
```

### 2. 🔑 Cấu hình biến môi trường

Tạo tệp cấu hình `.env` với các khóa API cần thiết:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_key
OPENROUTER_API_KEY=your_openrouter_key
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
```

### 3. 💻 Khởi chạy Giao diện Người dùng

```bash
npm install
npm run dev
```

Truy cập giao diện tại địa chỉ: `http://localhost:3000`
