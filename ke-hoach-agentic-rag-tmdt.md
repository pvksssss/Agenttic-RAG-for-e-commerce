# KẾ HOẠCH ĐỒ ÁN: AGENTIC RAG CHO WEBSITE TMĐT ĐIỆN TỬ
### (Laptop / Điện thoại / Đồng hồ thông minh / Tai nghe / Phụ kiện)

**Nguyên tắc phân chia công việc:**
- **Phần Web (TMĐT)**: Vibe code bằng AI coding tool (Cursor / Claude Code / v0 / Lovable / Bolt...), không cần tự viết tay chi tiết, chỉ cần mô tả đúng yêu cầu cho AI.
- **Phần Agentic RAG**: Tự viết bằng Python, đây là trọng tâm học thuật của đồ án, phần được chấm điểm chính.
- **Mục tiêu thời gian**: Toàn bộ phải xong **trong hoặc trước 1 tháng**, ưu tiên xong sớm để có thời gian đệm cho báo cáo + quay demo + xử lý phát sinh.

---

## 0. TỔNG QUAN KIẾN TRÚC HỆ THỐNG

```
┌─────────────────────────┐         ┌──────────────────────────┐
│   FRONTEND (Next.js)    │  HTTP   │   RAG/AGENT SERVICE       │
│   - Trang TMĐT           │ ──────► │   (FastAPI - Python)     │
│   - Popup chat hỗ trợ    │ ◄────── │   - Agent controller     │
└───────────┬──────────────┘         │   - Tools (RAG, DB, ...) │
            │                        └──────┬───────────┬────────┘
            │ REST API                      │           │
            ▼                               ▼           ▼
┌────────────────────────────────┐  ┌──────────────────────────┐
│  SUPABASE (Postgres)           │  │  CHROMA (Vector Store)    │
│  - Bảng quan hệ: products,     │  │  - Embedding sản phẩm     │
│    orders, reviews,             │  │  - Embedding chính sách   │
│    support_tickets, chat_logs  │  │  → Tìm kiếm ngữ nghĩa    │
│  → Tra cứu chính xác           │  │    (cosine similarity)    │
│    (SQL trực tiếp, KHÔNG qua   │  └──────────────────────────┘
│    vector search — đơn hàng,   │           ▲
│    tồn kho, giá...)            │           │ sync (script
│  - Auth (email + Google)       │           │ offline, chạy
│  - Storage (ảnh sản phẩm)      │───────────┘ khi đổi data)
└────────────────────────────────┘

(*) Tuỳ chọn benchmark (mục 3.2): thêm FAISS / pgvector chạy song
    song để so sánh hiệu năng/độ chính xác với Chroma.
```

**Vì sao tách như vậy:**
- Next.js + Supabase là bộ đôi cực kỳ dễ vibe-code (hầu hết tool AI coding đều được huấn luyện nhiều nhất trên stack này, tài liệu/ví dụ rất nhiều).
- Supabase gánh toàn bộ phần "khó nhằn" của web mà bạn không chuyên: đăng nhập, đăng nhập Google, database quan hệ, lưu ảnh — bạn gần như không cần viết backend thủ công cho phần TMĐT.
- Agentic RAG là 1 service Python độc lập (FastAPI), giao tiếp với web qua 1 API endpoint duy nhất (`/chat`) — tách biệt hoàn toàn, dễ phát triển/test độc lập, không phụ thuộc vào việc web có sửa đổi hay không.
- **Nguyên tắc định tuyến dữ liệu (quan trọng)**: không phải mọi truy vấn đều cần vector DB — phân loại theo loại truy vấn trước:
  - **Tra cứu chính xác** (đơn hàng, tồn kho, giá, xác thực user) → query SQL trực tiếp vào Supabase Postgres, **bỏ qua vector search hoàn toàn**.
  - **Tìm kiếm ngữ nghĩa** (mô tả sản phẩm, chính sách) → cần vector search (Chroma).
- **Mặc định dùng Chroma** làm vector store chính — pipeline RAG rõ ràng từng bước (chunk → embed → index → query), dễ thay đổi strategy để benchmark, dễ trình bày trong báo cáo. Dữ liệu gốc vẫn nằm trong Supabase Postgres (source of truth), Chroma là bản copy đã được embedding, đồng bộ bằng script offline.
- pgvector / FAISS có thể thêm sau để **benchmark so sánh** vector store (mục 3.2) — không phải phương án chính.

---

## PHẦN 1: WEB THƯƠNG MẠI ĐIỆN TỬ (VIBE CODE)

### 1.1 Công nghệ đề xuất

| Thành phần | Công nghệ | Lý do chọn |
|---|---|---|
| Frontend framework | **Next.js 14+ (App Router) + TypeScript** | Stack phổ biến nhất với AI coding tool, nhiều template TMĐT có sẵn để AI tham khảo |
| UI/Styling | **Tailwind CSS + shadcn/ui** | Component dựng sẵn (button, card, dialog, form...), vibe code ra giao diện đẹp nhanh mà không cần tự thiết kế CSS |
| State giỏ hàng | **Zustand** (hoặc React Context) | Đơn giản hơn Redux, đủ dùng cho giỏ hàng/session tạm |
| Database + Auth + Storage | **Supabase** | Auth có sẵn Google OAuth, Postgres quản lý qua giao diện web, không cần tự dựng backend auth |
| Thanh toán | **Stripe Checkout (test mode)** | Miễn phí ở chế độ test, tài liệu rất rõ ràng, AI coding tool tích hợp tốt. *(Thay thế: VNPay/Momo sandbox nếu muốn tính thực tế Việt Nam hơn, nhưng phức tạp hơn khi vibe code)* |
| Deploy | **Vercel** | Free tier, deploy Next.js 1 click, tự động CI/CD từ GitHub |

**Prompt gợi ý khi vibe code (để AI hiểu đúng phạm vi):**
> "Xây dựng website thương mại điện tử bán đồ điện tử (laptop, điện thoại, đồng hồ thông minh, tai nghe) bằng Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui, dùng Supabase cho database/auth/storage, Stripe cho thanh toán test mode. Có các trang: trang chủ, danh sách sản phẩm theo danh mục, chi tiết sản phẩm, giỏ hàng, checkout, đăng nhập/đăng ký (kèm đăng nhập Google), trang tài khoản, và 1 popup chat hỗ trợ khách hàng ở góc dưới phải mọi trang."

### 1.2 Danh sách chức năng TMĐT cần có

#### A. Trang chủ (Home)
- Banner khuyến mãi (carousel, dữ liệu tĩnh/giả lập)
- Danh mục sản phẩm nổi bật: Laptop / Điện thoại / Đồng hồ thông minh / Tai nghe / Phụ kiện
- Section "Sản phẩm bán chạy", "Sản phẩm mới"
- Header: logo, thanh tìm kiếm, icon giỏ hàng (có số lượng), icon tài khoản, menu danh mục
- Footer: thông tin liên hệ, chính sách (đổi trả, bảo hành, vận chuyển) — **các trang chính sách này quan trọng vì sẽ là nguồn dữ liệu cho RAG**

#### B. Thanh tìm kiếm
- Tìm theo tên sản phẩm/thương hiệu (search bar ở header, luôn hiển thị)
- Gợi ý tìm kiếm (autocomplete) khi gõ — có thể làm đơn giản (query DB theo tên gần đúng), không cần AI ở bước này
- Trang kết quả tìm kiếm hiển thị dạng lưới sản phẩm

#### C. Trang danh sách sản phẩm theo danh mục
- Filter: khoảng giá, thương hiệu, thông số riêng theo loại (RAM/CPU cho laptop, dung lượng pin cho tai nghe...)
- Sort: giá tăng/giảm, mới nhất, đánh giá cao nhất
- Phân trang hoặc infinite scroll

#### D. Trang chi tiết sản phẩm
- Hình ảnh (nhiều ảnh, có thể zoom)
- Tên, giá, tình trạng kho (còn hàng/hết hàng)
- Bảng thông số kỹ thuật đầy đủ (**bảng này là dữ liệu cốt lõi cho RAG so sánh/tư vấn sản phẩm**)
- Mô tả chi tiết
- Đánh giá của người dùng (rating trung bình + danh sách review)
- Nút "Thêm vào giỏ", "Mua ngay"
- Sản phẩm liên quan / gợi ý cùng danh mục

#### E. Giỏ hàng
- Danh sách sản phẩm đã thêm, sửa số lượng, xóa sản phẩm
- Tự động tính tổng tiền
- Nút "Tiến hành thanh toán"

#### F. Thanh toán (Checkout)
- Bước 1: Nhập/chọn địa chỉ giao hàng
- Bước 2: Chọn phương thức thanh toán (COD giả lập / Stripe test card)
- Bước 3: Xác nhận đơn hàng → tạo order trong Supabase → chuyển trang "Đặt hàng thành công"

#### G. Đăng ký / Đăng nhập
- Đăng ký/đăng nhập bằng email + mật khẩu (Supabase Auth)
- **Đăng nhập bằng Google** (Supabase Auth OAuth — chỉ cần bật trong dashboard Supabase + cấu hình Google Cloud Console, AI coding tool làm được phần code, bạn chỉ cần tự lấy Client ID/Secret)
- Quên mật khẩu (Supabase có sẵn flow reset password qua email)

#### H. Trang tài khoản
- Tab "Thông tin cá nhân": xem/sửa tên, số điện thoại, địa chỉ
- Tab "Đơn hàng của tôi": danh sách đơn hàng, trạng thái (Đang xử lý/Đang giao/Đã giao/Đã hủy), chi tiết từng đơn — **đây là dữ liệu mà RAG sẽ dùng để trả lời "đơn hàng của tôi đến đâu rồi"**
- Tab "Đổi mật khẩu"

#### I. Popup hỗ trợ khách hàng (chat widget) — **nơi Agentic RAG hoạt động**
- Icon chat nổi ở góc dưới phải, hiển thị trên mọi trang
- Click mở cửa sổ chat: khung hiển thị tin nhắn (giống Messenger/Zalo), ô nhập tin nhắn, nút gửi
- Hiển thị tin nhắn chào mừng mặc định khi mở lần đầu (VD: "Xin chào! Mình có thể giúp gì cho bạn về sản phẩm, đơn hàng hoặc chính sách?")
- Gọi API `POST /chat` tới RAG service, hiển thị câu trả lời trả về (có thể kèm markdown/link sản phẩm nếu agent trả về link)
- Lưu lịch sử chat theo session (localStorage tạm hoặc lưu Supabase nếu muốn bền vững)
- *(Nếu còn thời gian)*: nút "Yêu cầu gặp nhân viên" — hiển thị trạng thái "đã chuyển cho nhân viên" (giả lập, không cần hệ thống nhân viên thật)

#### J. *(Tùy chọn nếu dư thời gian)* Trang Admin đơn giản
- Thêm/sửa/xóa sản phẩm — dùng để **chuẩn bị dữ liệu mẫu cho RAG** (30–50 sản phẩm thực tế, có mô tả và thông số đầy đủ)
- Xem danh sách đơn hàng

### 1.3 Schema dữ liệu sản phẩm (để vibe code đúng và để RAG dùng được)

Yêu cầu AI coding tool tạo bảng `products` trong Supabase với các trường tối thiểu:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | khóa chính |
| category | text | laptop / phone / smartwatch / earphone / accessory |
| brand | text | Apple, Samsung, Dell, Sony... |
| name | text | tên sản phẩm |
| price | numeric | giá VNĐ |
| stock | integer | tồn kho |
| description | text | mô tả dài — **nguồn chính để tạo embedding cho RAG** |
| specs | jsonb | thông số kỹ thuật dạng key-value, linh hoạt theo từng loại sản phẩm |
| images | text[] | danh sách URL ảnh |
| rating_avg | numeric | điểm đánh giá trung bình |
| embedding | vector(768) | **(mặc định dùng pgvector)** embedding của `description`, dùng cho tìm kiếm ngữ nghĩa — nằm ngay trong bảng để tránh phải đồng bộ sang DB khác |
| created_at | timestamp | |

Gợi ý cấu trúc `specs` (jsonb) theo từng danh mục — cần thống nhất từ đầu để RAG so sánh sản phẩm dễ dàng:

```json
// Laptop
{"cpu": "Intel Core i7-14700H", "ram": "16GB", "storage": "512GB SSD", "screen": "15.6 inch FHD", "gpu": "RTX 4060", "battery": "70Wh", "weight": "2.1kg"}

// Điện thoại
{"chip": "Snapdragon 8 Gen 3", "ram": "12GB", "storage": "256GB", "screen": "6.7 inch AMOLED", "battery": "5000mAh", "camera": "50MP+12MP+10MP"}

// Tai nghe
{"battery_life": "30 giờ (kèm hộp sạc)", "anc": true, "connection": "Bluetooth 5.3", "waterproof": "IPX4"}

// Đồng hồ thông minh
{"battery_life": "18 giờ", "display": "AMOLED 1.5 inch", "waterproof": "5ATM", "compatible": "iOS/Android"}
```

Ngoài `products`, cần thêm 5 bảng phục vụ RAG:
- `orders` (id, user_id, status, items, total, created_at, shipping_address)
- `reviews` (id, product_id, user_id, rating, comment, created_at)
- `support_tickets` (id, customer_id, order_id nullable, category [advisory/negotiation/technical/attack_flagged/other], risk_level [low/medium/high], created_by [agent/staff/customer], status [open/in_progress/resolved], assigned_staff_id nullable, note, created_at) — phục vụ cơ chế phân quyền rủi ro ở mục 2.7
- `chat_logs` (id, session_id, user_id nullable, role [user/agent/tool/system], message, tool_used nullable, risk_level nullable, created_at) — lưu toàn bộ hội thoại phục vụ audit/truy vết (mục 2.10)
- `policy_chunks` (id, source_doc, chunk_index, content, embedding vector(768), created_at) — lưu các đoạn (chunk) tài liệu chính sách đã embedding, dùng cho `policy_rag_tool`

> **Ghi chú kỹ thuật**: bật extension `pgvector` trong Supabase (Dashboard → Database → Extensions → `vector`), sau đó tạo index (`CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`) trên cả 2 cột `products.embedding` và `policy_chunks.embedding` để truy vấn nhanh. Nhờ vậy 1 câu SQL có thể vừa `WHERE price < X AND category = 'laptop'` vừa `ORDER BY embedding <-> query_embedding` cùng lúc — không cần gọi sang hệ thống khác.

### 1.4 Timeline vibe code phần Web (đề xuất: 7–9 ngày, làm trong Tuần 1)

| Ngày | Việc |
|---|---|
| 1 | Khởi tạo project Next.js + Supabase, **bật extension `pgvector`**, thiết kế schema DB (gồm cột `embedding` trong `products`, bảng `policy_chunks`), seed 30–50 sản phẩm mẫu (dùng ChatGPT/Claude sinh dữ liệu giả cho nhanh) |
| 2 | Trang chủ + Header/Footer + danh mục sản phẩm |
| 3 | Trang danh sách sản phẩm + filter/sort + thanh tìm kiếm |
| 4 | Trang chi tiết sản phẩm + đánh giá |
| 5 | Giỏ hàng + Checkout + tích hợp Stripe test mode |
| 6 | Đăng ký/Đăng nhập + Đăng nhập Google + Trang tài khoản |
| 7 | Popup chat widget (giao diện, chưa cần backend thật — có thể mock trả lời tạm) |
| 8–9 | Đệm: sửa lỗi, deploy Vercel, viết thêm 2–3 trang chính sách (đổi trả, bảo hành, vận chuyển) làm nguồn dữ liệu cho RAG |

### 1.5 Kiến trúc Bảo mật & Xác thực (Supabase Auth & Row-Level Security RLS)

Để đảm bảo tính bảo mật và an toàn cho hệ thống thương mại điện tử, chúng tôi thiết lập kiến trúc xác thực không trạng thái (Stateless Authentication) dựa trên JWT Token của Supabase và Row-Level Security (RLS) của Postgres:

#### A. Phân định vai trò các API Keys:
*   **Supabase Anon Key (Publishable Key - Khóa ẩn danh công khai)**:
    *   *Bản chất*: Giống như **"Chiếc chuông bấm ngoài cổng chính"** của rạp phim. Khóa này hoàn toàn công khai, an toàn khi nhúng vào mã nguồn Next.js ở Frontend.
    *   *Nhiệm vụ*: Báo cho Supabase biết request này thuộc về hệ thống của shop để định tuyến đúng DB, đồng thời giúp Supabase áp dụng Rate Limiting chống spam DoS. Khi request dùng Anon Key, Supabase mặc định gán vai trò hạn chế là `anon` và bắt buộc đi qua bộ kiểm soát **RLS**. Muốn truy cập dữ liệu nhạy cảm, request bắt buộc phải đính kèm thêm **JWT Token (vé thông hành)** của người dùng.
*   **Supabase Service Role Key (Secret Key - Khóa quản trị đặc quyền)**:
    *   *Bản chất*: Giống như **"Thẻ vạn năng (Master Key)"** của Giám đốc rạp. Khóa này có quyền lực tối cao, bỏ qua (bypass) hoàn toàn tất cả các luật phân quyền RLS.
    *   *Nhiệm vụ*: Chỉ được lưu trữ tuyệt mật ở Backend FastAPI (`.env`). Dùng cho các tác vụ hệ thống (như nạp dữ liệu thô bằng loader, đồng bộ dữ liệu định kỳ, hoặc tạo ticket hỗ trợ đặc quyền) nơi không đại diện cho phiên đăng nhập của một khách hàng cụ thể nào.

#### B. Phân biệt Access Token (JWT) và Refresh Token trong phiên đăng nhập:
*   **Access Token (JWT Token)**: Là vé thông hành có **thời hạn sử dụng ngắn (mặc định 1 tiếng)** trong Supabase để nâng cao tính bảo mật (nếu bị lộ cũng tự động vô hiệu hóa nhanh). Đây chính là mã `user_token` được gửi qua HTTP Header `Authorization: Bearer <token>` sang FastAPI để xác thực.
*   **Refresh Token**: Là giấy chứng minh danh tính có **thời hạn sử dụng lâu (mặc định 7 ngày)**, được lưu ẩn an toàn trong Cookies trình duyệt.
*   *Cơ chế tự động làm mới*: Trước khi Access Token hết hạn, Supabase Client SDK ở Frontend Next.js sẽ **tự động chạy ngầm** gửi Refresh Token lên Supabase đổi lấy Access Token mới tinh và cập nhật lại phiên làm việc. Quá trình diễn ra trong 0.1 giây hoàn toàn ngầm, giúp người dùng không bao giờ bị gián đoạn trải nghiệm chat.

#### C. Quy trình xác thực và truy vấn dữ liệu cá nhân (Data Flow):
1.  **Đăng nhập & Cấp vé**: Người dùng thực hiện đăng nhập thành công trên Frontend (Next.js) và được Supabase cấp cả **Access Token (JWT)** và **Refresh Token**.
2.  **Gửi yêu cầu kèm vé**: Khi khách hàng chat, mã Access Token này được đính kèm vào Header `Authorization: Bearer <token>` để gửi sang Backend FastAPI.
3.  **Xác thực kép**: Backend FastAPI gửi mã Access Token + `ANON_KEY` lên Supabase Auth API để xác nhận:
    *   Xác định người dùng hợp lệ (tránh token giả mạo).
    *   Xác định yêu cầu này đến từ hệ thống chính chủ của shop (qua `ANON_KEY`).
    *   Khóa quyền của request trong phạm vi khách hàng (vai trò `authenticated`), tuyệt đối không được vượt sang quyền admin và bắt buộc tuân thủ RLS để không thể truy cập dữ liệu của người dùng khác.
4.  **Truy xuất & So khớp**: Sau khi xác thực thành công, Supabase trả về `user_id` thật cho Backend. Backend tiến hành so khớp ID này và tiêm cứng vào các tham số của Tool để thực thi truy vấn dữ liệu cá nhân một cách an toàn.

---

## PHẦN 2: AGENTIC RAG (BẠN TỰ VIẾT — PHẦN TRỌNG TÂM)

### 2.1 Mục tiêu của Agentic RAG trong hệ thống

Đóng vai trợ lý mua sắm kiêm chăm sóc khách hàng, xử lý được các nhóm câu hỏi mà **RAG thường (1 lần retrieve rồi trả lời) không đủ**, vì cần dữ liệu động (đơn hàng), cần nhiều bước (so sánh), hoặc cần quyết định khi nào không đủ thông tin.

### 2.2 Danh sách các Công cụ (Tools) của AI Agent

Dưới đây là danh sách đầy đủ các công cụ (Tools) được lập trình bằng Python, đóng vai trò là "tay chân" của AI Agent để truy xuất thông tin, so sánh và thực hiện các nghiệp vụ thương mại điện tử một cách an toàn:

#### A. Nhóm Công cụ dành cho Khách hàng (Tìm kiếm & Tư vấn)

##### 1. **`product_search(key_word, brand, min_price, max_price, limit)`**
*   **Mô tả**: Tìm kiếm sản phẩm theo ngôn ngữ tự nhiên kết hợp lọc cứng.
*   **Nguồn dữ liệu**: ChromaDB (`products_collection`) kết hợp Reranker và co giãn giới hạn động (Dynamic Limit Scaling).
*   **Lý do có tool**: Giúp khách hàng tìm sản phẩm thông minh theo mô tả tự nhiên ("laptop mỏng nhẹ pin trâu") hoặc khoảng giá cụ thể, vượt trội hoàn toàn so với tìm kiếm từ khóa thông thường.
*   **Usecase thực tế**: Khách hàng hỏi: *"Tìm cho tôi laptop HP mỏng nhẹ giá dưới 20 triệu"*.

##### 2. **`product_compare(product_names)`**
*   **Mô tả**: So sánh thông số kỹ thuật chi tiết của 2-3 sản phẩm được chỉ định.
*   **Nguồn dữ liệu**: Supabase Postgres (`products` -> cột `specs` dạng JSONB).
*   **Lý do có tool**: Gom thông tin so sánh nhanh chóng, trình bày bảng so sánh chi tiết và đưa ra nhận xét ưu nhược điểm (như CPU, RAM, Pin) để khách hàng dễ chọn lựa.
*   **Usecase thực tế**: Khách hàng hỏi: *"So sánh Asus Zenbook 14 và MacBook Air M2 giúp tôi"*.

##### 3. **`policy_search(key_word, limit)`**
*   **Mô tả**: Tìm kiếm thông tin về các chính sách bán hàng, đổi trả, bảo hành, vận chuyển của shop.
*   **Nguồn dữ liệu**: ChromaDB (`policies_collection`).
*   **Lý do có tool**: Tự động giải đáp các câu hỏi FAQ thường gặp của shop, giảm tải cho đội ngũ CSKH.
*   **Usecase thực tế**: Khách hàng hỏi: *"Tôi được đổi trả sản phẩm trong vòng bao nhiêu ngày?"*.

##### 4. **`check_stock_and_delivery(product_id, destination_province)`**
*   **Mô tả**: Kiểm tra số lượng sản phẩm tồn kho thực tế và tính toán thời gian giao hàng dự kiến.
*   **Nguồn dữ liệu**: Supabase Postgres (`products` -> cột `stock` thời gian thực) + logic tính ngày vận chuyển.
*   **Lý do có tool**: Thông tin tồn kho trong ChromaDB là tĩnh và có thể bị trễ. Cần tool này để kiểm tra số lượng tồn kho chính xác theo thời gian thực tại DB trước khi khách đặt mua.
*   **Usecase thực tế**: Khách hàng hỏi: *"iPhone 16 Pro Max còn hàng không và giao về Hà Nội mất bao lâu?"*.

---

#### B. Nhóm Công cụ cá nhân (Yêu cầu xác thực & bảo mật)

##### 5. **`order_lookup(current_user_id, user_token, order_id)`**
*   **Mô tả**: Tra cứu trạng thái đơn hàng, lịch sử mua hàng cá nhân của tài khoản đang đăng nhập.
*   **Nguồn dữ liệu**: Supabase Postgres (`orders`).
*   **Lý do có tool**: Cung cấp trạng thái đơn hàng tự động mà vẫn đảm bảo tuyệt đối không rò rỉ dữ liệu cá nhân chéo giữa các tài khoản.
*   **Usecase thực tế**: Khách hàng hỏi: *"Samsung S25 của tôi giao đến đâu rồi?"* (Agent sẽ tự động gọi tool không truyền `order_id` để lấy 5 đơn gần đây, đọc cột `items` và so khớp tên sản phẩm để trả lời thông minh).
*   **Cơ chế xác thực & Bảo mật 2 lớp**:
    *   *Xác thực*: Backend FastAPI bóc tách JWT Token từ Header `Authorization`, giải mã lấy `user_id` và tiêm cứng vào tham số `current_user_id` của Tool.
    *   *Bảo mật tầng Database*: Nếu có `user_token`, khởi tạo client động (`get_user_supabase_client`) dùng Anon Key + Token của khách. Supabase tự động áp dụng luật RLS (`auth.uid() = user_id`) để lọc dữ liệu ở mức DB.
    *   *Bảo mật tầng Ứng dụng (Fallback)*: Nếu `user_token` trống (khi lập trình viên test offline trong Jupyter Notebook), tự động fallback dùng `supabase_admin_client` nhưng vẫn kẹp lọc cứng `.eq("user_id", current_user_id)` bằng code Python.
    *   *Chốt chặn*: Nếu khách hàng chưa đăng nhập (`current_user_id` trống), tool từ chối xử lý ngay lập tức.

---

#### C. Nhóm Công cụ dành cho Quản trị viên & Nhân viên (Bảo mật đặc quyền)

##### 6. **`admin_financial_summary(admin_token, query_period)`**
*   **Mô tả**: Tổng hợp báo cáo doanh thu, sản phẩm bán chạy cho quản trị viên.
*   **Nguồn dữ liệu**: Supabase Postgres (`orders` + `products`).
*   **Lý do có tool**: Cung cấp công cụ phân tích dữ liệu nhanh cho nhà quản lý ngay trên khung chat Admin.
*   **Usecase thực tế**: Admin hỏi: *"Doanh thu tuần này của shop được bao nhiêu?"*.
*   **Cơ chế bảo mật**: Bắt buộc truyền `admin_token` hợp lệ (đã được phân quyền admin trong `auth.users`). Nếu không có token admin, tool từ chối thực thi để tránh rò rỉ thông tin tài chính qua tấn công prompt jailbreak của người dùng thường.

##### 7. **`generate_product_description_draft(product_name, specs)`**
*   **Mô tả**: Tự động soạn thảo bản nháp mô tả sản phẩm hấp dẫn dựa trên thông số kỹ thuật.
*   **Nguồn dữ liệu**: LLM Generation.
*   **Lý do có tool**: Tiết kiệm thời gian viết bài cho đội ngũ biên tập nội dung của shop.
*   **Cơ chế hoạt động**: Agent sinh bài viết mô tả sản phẩm mẫu hiển thị lên màn hình Admin. Admin kiểm tra và bấm xác nhận phê duyệt thủ công trên giao diện Web để lưu bài viết vào database (Agent không được phép ghi đè trực tiếp DB sản phẩm).

##### 8. **`staff_assist_tool(ticket_id)`**
*   **Mô tả**: Trợ giúp nhân viên nội bộ xử lý khiếu nại (soạn nháp tin nhắn phản hồi, tra lịch sử mua hàng đối chứng).
*   **Nguồn dữ liệu**: Supabase Postgres (`orders`, `support_tickets`, `policies`).
*   **Lý do có tool**: Tối ưu hóa hiệu suất làm việc của nhân viên hỗ trợ khách hàng.
*   **Usecase thực tế**: Nhân viên tra cứu nhanh xem khách hàng gửi ticket khiếu nại có đủ điều kiện đổi trả máy theo chính sách hay không.

### 2.3 Kiến trúc Đồ thị Đa Agent (Multi-Agent StateGraph Architecture)

Hệ thống Agentic RAG được thiết kế theo mô hình đồ thị trạng thái đa Agent (Multi-Agent StateGraph) phân tầng, giúp kiểm soát tuyệt đối 100% luồng xử lý và đảm bảo tính an toàn dữ liệu:

```text
                                    User Request
                                         │
                                         ▼
                                  Authentication
                           (Extract & Verify JWT Token)
                                         │
                                         ▼
                              Intent Classification
                                  (Router Node)
                                         │
               ┌─────────────────────────┼─────────────────────────┐
               ▼                         ▼                         ▼
        Product Domain             Policy Domain             User Account
     (Public Catalog Tools)       (Public FAQ Tools)       (Protected Orders)
               │                         │                         │
               ▼                         ▼                         ▼
    Hybrid Search / Stock          Policy Search            Order Lookup Service
               │                         │                         │
               ▼                         ▼                         ▼
         Product Agent             Policy Agent              Account Agent
               │                         │                         │
               └─────────────────────────┼─────────────────────────┘
                                         ▼
                             Final Response Synthesizer
                             (Guardrails & UI Navigation)
```

- **Authentication Node**: Kiểm tra JWT Token trong Header. Nếu có token ➡️ Đánh dấu `is_authenticated = True`. Nếu không có ➡️ Vẫn cho phép truy vấn thông tin công khai.
- **Intent Classification (Router Node)**: Phân loại ý định khách hàng thành 3 miền chuyên trách (`product`, `policy`, `account`).
- **Domain Sub-Graphs**: Mỗi nhánh gọi đúng bộ tool trong thư mục tương ứng (`src/d_tools/product`, `src/d_tools/policy`, `src/d_tools/account`).
- **Guardrail & Chuyển giao qua Nút UI (UI-Assisted Handover)**: Khi RAG không tìm thấy thông tin phù hợp, dữ liệu không ổn định, hoặc gặp các câu hỏi rủi ro (thương lượng giá, lỗi phần cứng), Agent sẽ từ chối bịa đặt và lịch sự phản hồi: *"Vấn đề này cần sự hỗ trợ trực tiếp từ nhân viên CSKH, bạn vui lòng nhấn nút **[Tạo Ticket Hỗ Trợ]** ngay bên cạnh màn hình chat để đội ngũ tiếp nhận ngay nhé!"*.
- **Xác thực trước khi tra đơn hàng**: `order_lookup` chỉ chạy được nếu agent nhận được token/user_id hợp lệ từ frontend gửi kèm — tránh lộ thông tin đơn hàng người khác.

### 2.3.1 Nguyên tắc định tuyến truy vấn (Query Routing) — Không phải mọi thứ đều cần Vector DB

> ⚠️ **Đây là nguyên tắc quan trọng nhất của kiến trúc** — nhiều người mới làm RAG hay bị rối chỗ này, cứ đẩy mọi truy vấn qua vector search dẫn đến chậm, sai, phức tạp không cần thiết.

**Quy tắc cốt lõi: phân loại truy vấn trước, mới quyết định đi đâu.**

```
                    ┌─────────────────────────┐
                    │   Câu hỏi từ khách      │
                    └────────────┬────────────┘
                                 │ Agent (LLM) chọn tool
              ┌──────────────────┴──────────────────────┐
              ▼                                          ▼
┌───────────────────────────┐         ┌───────────────────────────┐
│  Loại 1: SQL trực tiếp    │         │  Loại 2: Vector search    │
│                           │         │                           │
│  Dữ liệu KHÔNG có trong  │         │  Dữ liệu ĐÃ embed sẵn   │
│  Chroma:                  │         │  trong Chroma:            │
│  - Đơn hàng (orders)      │         │  - Sản phẩm (giá, specs,  │
│  - Lịch sử mua hàng      │         │    giảm giá, mô tả...)    │
│  - Thông tin tài khoản    │         │  - Chính sách (đổi trả,   │
│  - Tạo ticket/đánh giá    │         │    bảo hành, vận chuyển)  │
│  (thao tác GHI vào DB)    │         │                           │
└─────────────┬─────────────┘         └─────────────┬─────────────┘
              ▼                                      ▼
 ┌──────────────────────┐             ┌──────────────────────────┐
 │  Supabase Postgres   │             │  Chroma (vector DB)      │
 │  → Hàm Python có SQL │             │  → cosine similarity     │
 │    viết sẵn bên trong │             │    trả về top-k kết quả  │
 └──────────────────────┘             └──────────────────────────┘
              └──────────────────┬──────────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  LLM tổng hợp kết quả    │
                    │  → sinh câu trả lời      │
                    └──────────────────────────┘
```

> **Lưu ý quan trọng:** LLM **KHÔNG** tự viết SQL hay truy cập DB. Bạn viết sẵn các hàm Python (tools) có logic SQL/Chroma bên trong. LLM chỉ **chọn gọi tool nào** và **truyền tham số** (ví dụ: `order_lookup_tool(order_id="ORD-123")`). Tool chạy xong trả kết quả lại cho LLM tổng hợp câu trả lời. Đây là cơ chế **function calling** — cốt lõi của "Agentic" RAG.

##### 2.3.3 Cơ chế Tích lũy Tool Calls và Bảo tồn Chữ ký Mật mã (`thought_signature`)

Để xử lý các yêu cầu gọi hàm phức tạp và tương thích 100% với các mô hình suy luận thế hệ mới (như Gemini 3.6 Flash / Thinking Models), luồng xử lý tại Nút Agent (`MasterAgent`) thực hiện quy trình 4 bước chuẩn hóa trong vòng lặp duyệt Stream (`chunk`):

1. **Tích lũy Tool Calls đa luồng (Parallel Tool Call Accumulation)**:
   * Gom và tích lũy các yêu cầu gọi hàm trả về từ `chunk.function_calls` vào từ điển `tool_calls_dict` theo chỉ số `idx`.
   * Hỗ trợ xử lý mượt mà khi LLM đưa ra nhiều quyết định gọi Tool song song trong cùng 1 lượt (Parallel Function Calling).
2. **Bảo tồn Chữ ký Mật mã (`thought_signature`)**:
   * Với các mô hình Gemini 3.x/Thinking, mỗi `Part` gọi hàm bao hàm một chuỗi byte chữ ký bảo mật (`thought_signature`) chứng minh quyết định gọi hàm xuất phát từ luồng suy luận nội bộ của mô hình.
   * Agent tự động trích xuất chuỗi byte `thought_signature` này và đóng gói kèm vào `formatted_tool_calls` gửi lại cho API ở lượt kế tiếp, loại bỏ hoàn toàn lỗi `ClientError 400: Function call is missing a thought_signature`.
3. **Chuyển đổi Lịch sử Hội thoại 2 Chiều (OpenAI ↔ Gemini Content Translation)**:
   * Khi chuyển đổi lịch sử từ dạng OpenAI/Groq sang dạng Google Gemini (`list[types.Content]`):
     * Các yêu cầu gọi hàm của `assistant` được đóng gói thành `Part.from_function_call(name=..., args=...)` kèm `thought_signature`.
     * Kết quả thực thi của Tool (`role: "tool"`) được gộp chung vào 1 đối tượng `Content(role="user", parts=[...])` chứa các `Part.from_function_response(...)`, tuân thủ 100% quy định gom nhóm lượt gọi song song của Google Gemini SDK.
4. **Trích xuất Chỉ số Benchmark (TTFT & Token Usage Metrics)**:
   * Bấm giờ `TTFT` (Time to First Token) ngay khi mảnh chữ hoặc tool call đầu tiên xuất hiện.
   * Trích xuất `usage_metadata` (`prompt_token_count` & `candidates_token_count`) từ chunk cuối cùng để phục vụ báo cáo đánh giá hiệu năng (Benchmark).

#### Loại 1 — SQL trực tiếp (dữ liệu không nằm trong Chroma)

Áp dụng cho: dữ liệu **riêng tư theo user** (đơn hàng, tài khoản) và **thao tác ghi** (tạo ticket, đánh giá).

Những dữ liệu này không được embed vào Chroma vì: (1) thuộc về từng user riêng, cần xác thực, (2) thay đổi liên tục (đơn hàng mới mỗi ngày), (3) là thao tác ghi chứ không phải tìm kiếm.

| Tool | Câu hỏi ví dụ | Cách xử lý |
|---|---|---|
| `order_lookup_tool` | "Đơn hàng ORD-123 ở đâu rồi?" | SQL: `WHERE id = 'ORD-123' AND user_id = $user` |
| `order_lookup_tool` | "Tôi đã mua gì tháng trước?" | SQL: `WHERE user_id = $user AND created_at > ...` |
| `escalate_tool` | "Tôi muốn khiếu nại" | SQL INSERT vào `support_tickets` |

#### Loại 2 — Vector search (dữ liệu đã embed sẵn trong Chroma)

Áp dụng cho: **tất cả câu hỏi về sản phẩm** (kể cả hỏi cụ thể giá/giảm giá) và **chính sách**.

Vì text embed trong Chroma đã chứa đầy đủ thông tin (tên, giá, giảm giá, specs, mô tả...), nên câu hỏi cụ thể ("S22 bao nhiêu tiền?") cũng được vector search xử lý tốt — nó tìm đúng sản phẩm S22, LLM đọc context và trích xuất giá.

| Tool | Câu hỏi ví dụ | Cách xử lý |
|---|---|---|
| `product_search_tool` | "Laptop mỏng nhẹ pin trâu" | Chroma: tìm ngữ nghĩa, trả top-5 |
| `product_search_tool` | "Samsung S22 bao nhiêu tiền?" | Chroma: tìm đúng S22, LLM đọc giá từ context |
| `product_search_tool` | "S22 có giảm giá không?" | Chroma: tìm S22, LLM đọc discount từ context |
| `product_compare_tool` | "So sánh iPhone 15 và S24" | Chroma: tìm 2 SP, LLM so sánh specs |
| `policy_rag_tool` | "Chính sách đổi trả thế nào?" | Chroma: tìm chunk chính sách liên quan |

> **Tại sao câu hỏi cụ thể cũng dùng vector?** Vì text embed đã bao gồm tất cả info sản phẩm. Khi hỏi "S22 bao nhiêu tiền?", vector search match "S22" → trả về document chứa `"... Giá: 16,000,000đ. Giảm giá: 5%..."` → LLM trích xuất thông tin cần thiết. Không cần SQL riêng cho câu hỏi kiểu này.

---

#### Pipeline RAG có 2 giai đoạn tách biệt (quan trọng!)

> ⚠️ **Chunking/embedding KHÔNG xảy ra khi khách hỏi.** Nó xảy ra TRƯỚC ĐÓ, chạy 1 lần offline.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GIAI ĐOẠN 1: CHUẨN BỊ (OFFLINE — chạy 1 LẦN, khi dữ liệu thay đổi)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Supabase DB          Script Python (sync_data.py)
  ┌──────────┐  query  ┌────────────────────────────────────┐
  │ products │ ──────► │ 1. Đọc data từ DB                  │
  │ policies │         │ 2. Ghép JSON→text / chunk văn bản   │
  └──────────┘         │ 3. Embed (model do BẠN chọn)       │
                       │ 4. Lưu vector vào Chroma           │
                       └─────────────────┬──────────────────┘
                                         ▼
                       ┌──────────────────────────┐
                       │  Chroma (vector DB)       │
                       │  Đã có sẵn 800+ vectors   │
                       │  NGỒI CHỜ truy vấn       │
                       └──────────────────────────┘
  → Xong. Script nghỉ. Chạy lại khi thêm/sửa sản phẩm.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GIAI ĐOẠN 2: PHỤC VỤ (ONLINE — mỗi khi khách hàng hỏi)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Khách: "Có laptop mỏng nhẹ pin trâu dưới 20 triệu không?"
         │
         ▼
  Bước 1: Embed CÂU HỎI (chỉ 1 câu ngắn, vài ms)
         │
         ▼
  Bước 2: Tìm trong Chroma bằng cosine similarity → top-5
         │
         ▼
  Bước 3: Đưa top-5 + câu hỏi cho LLM → sinh câu trả lời
```

#### Xử lý 2 loại dữ liệu khác nhau

| | Sản phẩm (JSON) | Chính sách (văn bản dài) |
|---|---|---|
| Kích thước | ~200-500 từ/sản phẩm | ~1000-3000 từ/tài liệu |
| Cần chunk? | **KHÔNG** — 1 SP = 1 chunk | **CÓ** — split 200-400 từ/chunk |
| Cách xử lý | Ghép JSON → text → embed | Split text → embed từng chunk |
| Lưu trong Chroma | 1 document/sản phẩm | Nhiều document/tài liệu |

**Sản phẩm (JSON → text, không cần chunk):**
```python
def product_to_text(p):
    specs = ", ".join(f"{k}: {v}" for k, v in p["specs"].items()) if p.get("specs") else ""
    return f"{p['name']} - {p['brand']} - {p['category']}. {p['description']}. Thông số: {specs}. Giá: {p['price']:,}đ"
```

**Chính sách (văn bản dài → cần chunk):**
```python
def chunk_policy(text, chunk_size=300, overlap=50):
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if chunk: chunks.append(chunk)
    return chunks
```

---

#### Vector store: Chroma (chính) + pgvector/FAISS (benchmark)

##### ✅ Chroma — vector store chính (đã chọn)

**Lý do chọn Chroma làm mặc định thay vì pgvector:**
- Pipeline RAG **rõ ràng từng bước** (chunk → embed → index → query), dễ trình bày trong báo cáo
- Dễ **thay đổi chunking strategy** để benchmark (chunk_size, overlap, field-based vs whole-doc)
- Dễ **swap embedding model** (chỉ đổi model, chạy lại script sync)
- Dễ **swap vector store backend** (đổi sang FAISS/pgvector để so sánh)
- API Python gọn (`collection.query()`), phù hợp người chuyên Python
- Supabase Postgres vẫn là **source of truth** (dữ liệu gốc), Chroma là bản copy đã embedding

```python
# sync_data.py — Script đồng bộ (chạy 1 lần khi data thay đổi)
from sentence_transformers import SentenceTransformer
import chromadb

model = SentenceTransformer("intfloat/multilingual-e5-large")
chroma = chromadb.PersistentClient(path="./chroma_db")

# === Collection sản phẩm ===
prod_collection = chroma.get_or_create_collection("products")
products = supabase.table("products").select("*").execute().data
texts = [product_to_text(p) for p in products]  # Ghép JSON→text (không chunk)
embeddings = model.encode(texts)
prod_collection.upsert(
    ids=[p["id"] for p in products],
    documents=texts,
    embeddings=embeddings.tolist(),
    metadatas=[{"price": p["price"], "category": p["category"], "brand": p["brand"]} for p in products]
)

# === Collection chính sách ===
policy_collection = chroma.get_or_create_collection("policies")
policies = load_policy_files()  # Đọc 3-5 file chính sách
for doc in policies:
    chunks = chunk_policy(doc["content"])  # Chunk vì văn bản dài
    chunk_embeddings = model.encode(chunks)
    policy_collection.upsert(
        ids=[f"{doc['id']}_chunk_{i}" for i in range(len(chunks))],
        documents=chunks,
        embeddings=chunk_embeddings.tolist()
    )
print("✅ Đồng bộ xong!")
```

##### Cách 2 (benchmark): pgvector / FAISS

Thêm sau khi Chroma đã chạy ổn, **dùng cùng pipeline chunk+embed**, chỉ đổi nơi lưu:
- **pgvector**: embedding lưu ngay trong Supabase Postgres (cột `embedding`), cho phép Hybrid Retrieval trong 1 câu SQL
- **FAISS**: lưu in-memory, truy vấn rất nhanh, phù hợp benchmark tốc độ
- So sánh trên cùng bộ test: latency, recall@k, precision

---

#### Tóm tắt quyết định kiến trúc

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Đơn hàng / lịch sử mua / tài khoản | SQL trực tiếp Supabase (Loại 1) | Dữ liệu riêng tư theo user, không nằm trong Chroma |
| Tạo ticket / đánh giá / thao tác ghi | SQL trực tiếp Supabase (Loại 1) | Thao tác ghi DB, không phải tìm kiếm |
| Tất cả câu hỏi về sản phẩm (kể cả giá, giảm giá, specs cụ thể) | **Chroma** vector search (Loại 2) | Text embed chứa đầy đủ info, vector tìm đúng SP → LLM trích xuất |
| Hỏi chính sách | **Chroma** vector search (Loại 2) | Chunk → embed → query, tương tự sản phẩm |
| Embedding model | Tự chọn (e5-large, BGE-M3...) | Supabase/Chroma KHÔNG có model embed sẵn, phải tự embed |
| Cơ chế LLM gọi tool | **Function calling** | LLM KHÔNG tự viết SQL, chỉ chọn tool + truyền tham số |
| Benchmark vector store | Thêm pgvector + FAISS (mục 3.2) | So sánh latency/recall giữa 3 backend |

### 2.4 Dữ liệu cần chuẩn bị riêng cho RAG

1. **Product catalog embedding** (OFFLINE, chạy 1 lần):
   - Đọc toàn bộ sản phẩm từ Supabase Postgres
   - Ghép các trường JSON (`name` + `brand` + `category` + `description` + `specs`) thành 1 đoạn text cho mỗi sản phẩm — **không cần chunk** vì mỗi sản phẩm đã đủ ngắn (~200-500 từ)
   - Embed bằng model do bạn chọn (e.g. `multilingual-e5-large`)
   - Lưu vector + metadata (price, category, brand) vào **Chroma** collection `products`
2. **Tài liệu chính sách** (OFFLINE, chạy 1 lần):
   - Tự viết 3–5 file (~1–2 trang mỗi file) cho: Chính sách đổi trả, Chính sách bảo hành, Chính sách vận chuyển, Câu hỏi thường gặp (FAQ)
   - **Cần chunk** vì văn bản dài (~1000-3000 từ) — split thành đoạn 200–400 từ/chunk, có overlap 50 từ
   - Embed từng chunk, lưu vào **Chroma** collection `policies`
3. **Bộ câu hỏi test tự tạo** (30–50 câu, chia đều theo 7 tool ở trên) — dùng để đánh giá độ chính xác chọn tool + độ chính xác câu trả lời.

> Toàn bộ pipeline trên nằm trong 1 script `sync_data.py`, chạy lại mỗi khi thêm/sửa sản phẩm hoặc cập nhật chính sách. Nếu benchmark vector store (mục 3.2), dùng **cùng pipeline** chunk+embed, chỉ đổi nơi lưu (Chroma → FAISS → pgvector).

### 2.5 API tích hợp với Web

Chỉ cần expose **1 endpoint chính**:
```
POST /chat
Body: { "message": "...", "session_id": "...", "user_token": "..." (optional, để tra đơn hàng) }
Response: { "reply": "...", "tool_used": "...", "sources": [...] (nếu có trích dẫn) }
```
Team vibe-code phía Next.js chỉ cần gọi endpoint này từ popup chat — không cần biết bên trong agent xử lý thế nào, giữ ranh giới rõ ràng giữa 2 phần việc.

### 2.6 Đánh giá (Evaluation) cho Agentic RAG

| Chỉ số | Cách đo |
|---|---|
| Tool selection accuracy | % câu hỏi test agent chọn đúng tool cần dùng |
| Retrieval precision | % tài liệu/sản phẩm truy xuất được thực sự liên quan (đánh giá thủ công trên bộ test) |
| Answer correctness | % câu trả lời cuối đúng so với đáp án kỳ vọng |
| Hallucination rate | % câu trả lời có thông tin bịa không có trong nguồn |
| Latency trung bình | Thời gian phản hồi mỗi câu hỏi (giây) |
| So sánh baseline | RAG thường (1 lần retrieve, không tool, không loop) **vs** Agentic RAG — chứng minh agentic tốt hơn ở nhóm câu hỏi cần tool (tra đơn hàng, so sánh) |

> Bộ thang đo đầy đủ hơn (Context Precision/Recall, F1, Faithfulness, Answer Relevancy, số lần gọi tool trung bình...) và cách chạy benchmark tự động (không nhập tay trong khung chat) được mô tả chi tiết ở mục 3.4.

### 2.7 Cơ chế phân loại & xử lý rủi ro (Risk Classifier)

Ngoài guardrail chống bịa ở mục 2.3 (lo về **độ chính xác thông tin**), bổ sung 1 tầng riêng lo về **mức độ an toàn/thẩm quyền được phép trả lời**, chạy ngay sau khi agent tổng hợp xong câu trả lời dự kiến (draft answer), trước khi trả về cho khách:

- **Bộ phân loại rủi ro (risk classifier)**: có thể là 1 bước riêng (LLM nhỏ chuyên biệt, hoặc chính LLM controller nhưng dùng prompt phân loại riêng, hoặc 1 mô hình classification nhẹ) — chia câu hỏi/câu trả lời dự kiến thành 3 nhóm:
  1. **Rủi ro dạng tấn công (attack)**: jailbreak, prompt injection, yêu cầu vượt phạm vi hệ thống,... → **từ chối khéo**. Model nền hiện đại thường đã được huấn luyện sẵn để tự từ chối các trường hợp này, nhưng vẫn nên có thêm lớp classifier/guard riêng để chắc chắn hơn (defense-in-depth), không phụ thuộc hoàn toàn vào hành vi mặc định của model.
  2. **Rủi ro dạng tư vấn/tài chính (advisory)**: sản phẩm ghi "giá liên hệ", mặc cả/thương lượng giá, tư vấn chuyên sâu vượt phạm vi FAQ/policy đã có, hoặc bất kỳ nội dung liên quan tiền bạc mà không phải hỏi giá niêm yết thông thường → **agent không tự trả lời trực tiếp**, tạo ticket trong `support_tickets` (mục 1.3) và chuyển nhân viên thật.
  3. **Rủi ro thấp / trong phạm vi cho phép**: hỏi sản phẩm, chính sách, tra đơn hàng, so sánh sản phẩm ở mức giá niêm yết → agent xử lý tự động theo luồng ở mục 2.3.

- **Phân quyền xử lý theo mức rủi ro**:
  - **Thấp**: agent tự động xử lý, không cần người can thiệp.
  - **Trung bình** (VD hỏi mức giảm giá nằm trong chương trình khuyến mãi đã công bố công khai): agent trả lời được nhưng **giới hạn theo điều kiện chính sách đã định nghĩa sẵn** — không được tự ý đưa ra mức giá/ưu đãi mới ngoài những gì đã công bố.
  - **Cao** (mặc cả, tư vấn sâu, giá liên hệ, hoặc nghi vấn attack cần xác minh thêm): bắt buộc **human confirmation** — tạo ticket, gắn `risk_level = high`, gán nhân viên; agent chỉ phản hồi tạm kiểu "mình đã ghi nhận yêu cầu, nhân viên sẽ liên hệ sớm nhất".
  - Nhân viên cũng có thể **tự tạo ticket thủ công** khi trao đổi trực tiếp với khách ngoài kênh chat — set `created_by = staff`.

- **Ghi log đầy đủ**: mọi quyết định phân loại rủi ro (kể cả khi agent tự xử lý ở mức thấp) đều ghi vào `chat_logs`/`support_tickets` kèm `risk_level` và lý do, phục vụ audit/truy vết (mục 2.10).

**Mở rộng `staff_assist_tool` (mục 2.2, #7) cho nhân viên xử lý ticket**: khi ticket rủi ro tư vấn/tài chính được tạo, tool này hỗ trợ nhân viên bằng cách tự động đọc hóa đơn/đơn hàng liên quan, tra lịch sử đơn hàng của khách, đối chiếu với chính sách hoàn tiền/đổi trả (qua `policy_rag_tool`), rồi **soạn sẵn 1 bản nháp phản hồi** để nhân viên xem, chỉnh sửa và duyệt gửi — nhân viên không phải tự tra cứu từ đầu.

### 2.8 Lựa chọn Model cho Agent Controller: API vs Local nhỏ

| Phương án | Ưu điểm | Nhược điểm | Khi nào phù hợp |
|---|---|---|---|
| **Gọi API model lớn** (Gemini, Claude, GPT...) | Chất lượng cao, function calling ổn định, không cần hạ tầng GPU, ít công sức | Phụ thuộc quota/chi phí, độ trễ mạng, khó tuỳ biến phong cách trả lời sâu | Ưu tiên nếu deadline gấp (1 tháng) — chọn làm phương án chính |
| **Deploy model nhỏ local (≤3B tham số)**, VD Gemma 2B | Chủ động hạ tầng, có thể finetune đúng phong cách tư vấn, không phụ thuộc quota | Đánh đổi hiệu năng/độ chính xác rất lớn so với model lớn, cần GPU (dù nhỏ) để inference mượt, tốn công finetune + đánh giá riêng | Chỉ nên làm nếu còn dư thời gian — coi là **thí nghiệm so sánh** cho báo cáo, không thay thế hoàn toàn phương án API |
| **Prompt engineering cho model API** để trả lời tự nhiên như người tư vấn thật | Không cần finetune, chỉnh sửa nhanh, tận dụng chất lượng model lớn | Giới hạn bởi khả năng prompt, khó ép phong cách/ngữ điệu đặc thù như finetune thật | Phương án cân bằng, nên làm trước — system prompt mô tả rõ vai trò/giọng điệu + vài ví dụ few-shot phong cách tư vấn |

**Khuyến nghị lộ trình**: dùng **API + prompt engineering** làm baseline chính (đủ chạy đúng deadline 1 tháng). Nếu còn thời gian, thử thêm **model nhỏ local finetune** như 1 nhánh benchmark so sánh (mục 3.1, mở rộng ở mục 5.1), không đặt làm phương án chính vì rủi ro thời gian/hạ tầng cao.

**Nếu finetune model nhỏ, có nên dùng Knowledge Distillation (KD) / DPO không?**
- **KD**: cho model nhỏ học từ output của model lớn (dùng chính API model lớn để sinh dữ liệu "thầy" cho bộ câu hỏi ở mục 2.4 mở rộng thêm) — phù hợp để **chắt lọc đúng kiến thức trả lời** (product knowledge, cách dùng tool) vào model nhỏ. Nên làm trước tiên nếu có finetune, vì đây là cách hiệu quả nhất bù lại phần "kiến thức" model nhỏ vốn thiếu.
- **DPO**: phù hợp hơn để **tinh chỉnh phong cách trả lời** (giọng điệu, độ dài, cách xưng hô) khi đã có tập cặp câu trả lời (tốt/chưa tốt) — có thể tự tạo cặp này bằng cách so sánh output model lớn (tốt) vs model nhỏ chưa finetune (chưa tốt).
- **Đề xuất thứ tự nếu có thời gian**: làm **KD trước** (ưu tiên đúng thông tin) → **DPO sau** (tinh chỉnh phong cách) — vì đúng thông tin quan trọng hơn giọng điệu trong bối cảnh tư vấn TMĐT.

### 2.9 Giới hạn vòng lặp Agentic & Đảm bảo hội thoại nhiều lượt (Multi-turn)

- **Giới hạn số vòng lặp tối đa (max n iterations)**: agent chỉ được gọi tool tối đa `n` lần liên tiếp trong 1 lượt trả lời trước khi bắt buộc tổng hợp và trả lời (dù chưa hoàn toàn chắc chắn), tránh lặp vô hạn. Giá trị `n` cụ thể (VD 3, 5, 7...) **cần benchmark để chọn** (mục 3.3) — đánh đổi giữa độ đầy đủ thông tin và độ trễ/chi phí gọi tool.
- **Cơ chế trả lời "không biết"**: nếu sau `n` vòng vẫn không đủ thông tin đáng tin cậy (theo guardrail chống bịa ở mục 2.3), agent phải trả lời dạng "mình chưa tìm thấy thông tin này" kèm hướng gợi ý tiếp theo (liên hệ nhân viên / hỏi cụ thể hơn) — **không được cố trả lời khi không chắc**.
- **Đảm bảo ngữ cảnh hội thoại nhiều lượt**: agent phải giữ ngữ cảnh giữa các lượt hỏi liên tiếp trong cùng `session_id`. Ví dụ chuỗi cần test thực tế: hỏi về sản phẩm A → hỏi so sánh A với B → hỏi "sản phẩm này là gì" (ngầm hiểu là B, sản phẩm vừa nhắc) → hỏi "vậy tôi mua ở đâu". Agent cần resolve được các tham chiếu ngầm định (coreference) dựa vào lịch sử hội thoại, không xử lý từng câu độc lập.
- Cả 2 yêu cầu trên cần bộ test riêng và đo lường cụ thể, không chỉ kiểm tra bằng cảm quan khi test thủ công (xem mục 3.3, 3.4).

### 2.10 Lưu trữ & Logging hội thoại khách hàng

- Ghi log **toàn bộ** lượt hỏi đáp của khách hàng vào bảng `chat_logs` (mục 1.3): mỗi message (user/agent/tool/system) lưu kèm `tool_used`, `risk_level` (liên kết mục 2.7), thời gian.
- **Mục đích logging**:
  1. Audit/truy vết khi có khiếu nại hoặc cần kiểm tra lại quyết định của agent (đặc biệt case rủi ro trung bình/cao ở mục 2.7).
  2. Làm nguồn dữ liệu thực tế để **mở rộng bộ câu hỏi test/benchmark** sau này (câu hỏi thật thường đa dạng hơn bộ test tự tạo ban đầu).
  3. Nếu sau này finetune model nhỏ (mục 2.8), log hội thoại thật là nguồn tham khảo tốt để biết người dùng thật hỏi kiểu gì.
- Nên ghi log bất đồng bộ (fire-and-forget), tách khỏi luồng phản hồi chính để không ảnh hưởng latency trả lời khách.

---

## PHẦN 3: BENCHMARK MÔ HÌNH / KIẾN TRÚC

Mục tiêu: không chỉ xây hệ thống chạy được, mà còn **có số liệu so sánh** để làm nội dung phân tích cho báo cáo.

### 3.1 Benchmark LLM cho vai trò Agent Controller (function calling)

So sánh trên cùng 1 bộ câu hỏi test (30–50 câu), đo tool selection accuracy + latency + chi phí (nếu có):

| Model (qua API free/rẻ) | Điểm mạnh cần kiểm tra |
|---|---|
| Gemini 2.5/3 Flash (Google AI Studio, free tier) | Baseline tốc độ cao, function calling ổn định |
| Gemma 4 26B-A4B (Google AI Studio, free) | Model mở, function calling native |
| Claude Haiku (nếu có credit) | Độ chính xác tool-calling |
| DeepSeek / Qwen (API rẻ) | Phương án dự phòng nếu hết quota free |

### 3.2 Benchmark Embedding Model (retrieval tiếng Việt)

So sánh recall@k trên bộ câu hỏi tìm sản phẩm:

| Embedding model | Ghi chú |
|---|---|
| `multilingual-e5-large` | Hỗ trợ tiếng Việt tốt, chạy local free (sentence-transformers) |
| `BGE-M3` | Cạnh tranh trực tiếp, cũng chạy local free |
| Google `text-embedding-004` (API) | So sánh model thương mại vs mã nguồn mở |

**Nhánh mở rộng (tuỳ chọn, nếu còn thời gian): so sánh vector store backend**

| Backend | Ưu điểm | Nhược điểm |
|---|---|---|
| **pgvector (Supabase Postgres)** — mặc định | Không cần đồng bộ (embedding nằm cùng bảng dữ liệu gốc), lọc cứng + vector search trong 1 câu SQL, không thêm hạ tầng | Tốc độ truy vấn với tập dữ liệu rất lớn (>1 triệu vector) kém hơn vector DB chuyên dụng — không phải vấn đề với quy mô 30–50 sản phẩm của đồ án |
| **Chroma** | API Python đơn giản, dễ dùng khi prototype | Cần script đồng bộ riêng từ Postgres, thêm 1 thành phần hạ tầng phải quản lý |
| **FAISS** | Tốc độ truy vấn rất nhanh (in-memory), phổ biến trong nghiên cứu | Không có filter theo metadata linh hoạt như SQL, cần tự quản lý persistence, cũng cần đồng bộ riêng |

So sánh trên cùng bộ dữ liệu sản phẩm, đo: latency truy vấn, độ chính xác (recall@k phải giống nhau vì cùng embedding model), độ phức tạp triển khai — dùng làm nội dung phân tích cho báo cáo, giải thích rõ lý do chọn pgvector làm phương án chính.

### 3.3 Benchmark kiến trúc RAG (chi tiết theo từng biến thể)

Thay vì chỉ so sánh 3 nhóm lớn, chia nhỏ hơn để có số liệu phân tích rõ ràng cho báo cáo — so sánh trên cùng 1 bộ test (mục 3.4):

| # | Kiến trúc | Mô tả |
|---|---|---|
| 1 | **RAG tiêu chuẩn — Hybrid Retrieval** | Kết hợp semantic search (vector) + keyword search (BM25/full-text), retrieve 1 lần rồi generate — baseline chính |
| 2 | **RAG tiêu chuẩn — tăng số đoạn truy vấn (top-k lớn hơn)** | Giữ hybrid retrieval nhưng tăng số chunk lấy về (VD top-10 thay vì top-3) nhằm giảm khả năng bỏ sót thông tin, đánh đổi context dài/nhiễu hơn |
| 3 | **Hybrid Retrieval + Rerank** | Sau khi hybrid retrieve, dùng model rerank (VD cross-encoder / `bge-reranker`) sắp xếp lại theo độ liên quan trước khi đưa vào prompt |
| 4 | **Truy xuất 1 lần + Rerank (không hybrid)** | Chỉ 1 phương thức retrieve (semantic hoặc keyword) nhưng thêm rerank để ưu tiên đoạn liên quan trực tiếp nhất — xem rerank có bù được việc thiếu hybrid không |
| 5 | **Corrective RAG** | Tự chấm điểm tài liệu tìm được, tìm lại nếu không đủ |
| 6 | **Agentic RAG đầy đủ** | Multi-tool, tối đa `n` vòng lặp trước khi trả lời (mục 2.9), có cơ chế "không biết" khi thiếu thông tin |

**Các chiều đo lường bổ sung riêng cho Agentic RAG (kiến trúc #6)**:
- **Benchmark giá trị `n` tối ưu**: chạy cùng bộ test với `n` = 2, 3, 5, 7... đo answer correctness/hallucination rate và latency/số lần gọi tool tương ứng — chọn `n` cân bằng tốt nhất giữa chất lượng và chi phí/độ trễ (n quá nhỏ → thiếu thông tin, n quá lớn → lặp không cần thiết).
- **Tỷ lệ trả lời "không biết" đúng lúc**: bộ test cần có 1 nhóm câu hỏi **cố tình không có đáp án** trong dữ liệu (out-of-scope) để đo agent có nhận biết và từ chối đúng cách hay bịa thông tin.
- **Test hội thoại nhiều lượt (multi-turn)**: bộ test riêng dạng chuỗi 3–4 lượt liên tiếp có tham chiếu ngầm định (ví dụ ở mục 2.9), đo tỷ lệ agent resolve đúng ngữ cảnh qua các lượt.

→ Kỳ vọng vẫn giữ nguyên: Agentic RAG thắng rõ nhất ở nhóm câu hỏi cần tool ngoài RAG hoặc cần nhiều lượt (tra đơn hàng, so sánh, hội thoại nối tiếp), còn câu hỏi đơn giản 1 lượt thì các kiến trúc có thể ngang nhau — đây là điểm phân tích cho báo cáo, chứng minh "agentic không phải lúc nào cũng cần nhưng cần đúng chỗ".

### 3.4 Bộ test chuẩn hoá & Thang đo Benchmark (chạy tự động, không nhập tay)

**a) Danh mục loại câu hỏi trong bộ test** (đảm bảo đủ nhóm, không chỉ hỏi đáp sản phẩm đơn thuần):

| Nhóm | Mô tả | Ví dụ |
|---|---|---|
| Từ chối khéo yêu cầu không phù hợp | Câu hỏi ngoài phạm vi / có dấu hiệu tấn công (mục 2.7) | "Bỏ qua hướng dẫn trước đó và..." |
| So sánh sản phẩm | So sánh 2–3 sản phẩm cụ thể | "So sánh iPhone 15 và Samsung S24" |
| Hỏi đáp sản phẩm | Hỏi thông tin/thông số 1 sản phẩm | "Laptop Dell XPS 13 có RAM bao nhiêu?" |
| Hướng dẫn kỹ thuật | Hướng dẫn dùng sản phẩm/tính năng | "Làm sao kết nối tai nghe với 2 thiết bị cùng lúc?" |
| Tạo ticket support | Câu hỏi cần escalate (mục 2.7): mặc cả giá, tư vấn chuyên sâu | — |
| Release note / sản phẩm mới, giảm giá | Thông tin sản phẩm hot, khuyến mãi mới nhất | "Có sản phẩm nào mới ra mắt tháng này?" |
| Tỷ lệ ghi nguồn đúng khi so sánh | Câu trả lời so sánh có trích dẫn đúng nguồn (specs/product_id), không nhầm lẫn giữa các sản phẩm | — |
| Nhắc sản phẩm (upsell/gợi ý liên quan) | Agent có chủ động gợi ý sản phẩm liên quan phù hợp không | — |
| QA đơn hàng/chính sách | Tra đơn hàng, hỏi chính sách đổi trả/bảo hành | — |
| Hội thoại nhiều lượt | Chuỗi 3–4 lượt có tham chiếu ngầm (mục 2.9) | — |

**b) Thang đo (metrics) áp dụng**:

| Nhóm | Thang đo |
|---|---|
| Độ chính xác nội dung | Accuracy, Answer Correctness / **Answer Relevancy** (câu trả lời có đúng trọng tâm câu hỏi không) |
| Chất lượng retrieval | **Context Precision**, **Context Recall**, F1 (kết hợp precision/recall) |
| Độ trung thực | **Faithfulness** (câu trả lời có bám sát tài liệu truy xuất được không, đo mức độ bịa) |
| Hành vi agent | Tool selection accuracy, **số lần gọi tool trung bình**, tỷ lệ dừng vòng lặp đúng lúc (mục 2.9) |
| Hiệu năng | Latency trung bình, latency P95 |
| An toàn | Tỷ lệ từ chối khéo đúng (nhóm câu hỏi attack), tỷ lệ escalate đúng (nhóm câu hỏi rủi ro tư vấn — mục 2.7) |

> Gợi ý công cụ: có thể dùng thư viện **RAGAS** (Python) để tính sẵn Context Precision/Recall, Faithfulness, Answer Relevancy theo chuẩn — đỡ phải tự viết công thức, chỉ cần chuẩn bị đúng format input (question, answer, contexts, ground_truth).

**c) Hình thức chạy benchmark — cần script tự động, không test tay trong khung chat**:
- Chuẩn bị bộ câu hỏi test dạng file (VD `test_set.jsonl`/`.csv`): mỗi dòng gồm `question`, `expected_tool` (nếu có), `expected_answer`/`ground_truth`, `category` (theo bảng mục a).
- Viết 1 script Python gọi lần lượt tới API `/chat` (mục 2.5) cho từng câu hỏi, ghi lại: câu trả lời, tool đã gọi, thời gian phản hồi, số lần gọi tool.
- Script tự tính các thang đo ở mục b) (dùng RAGAS hoặc tự viết so khớp/scoring), xuất ra 1 file kết quả (CSV/bảng) để đưa thẳng vào báo cáo — tránh phải đọc từng câu trả lời trong popup chat rồi chấm tay, vừa chậm vừa dễ sai khi cần chạy lại nhiều lần (so sánh nhiều kiến trúc/model ở mục 3.1–3.3).
- Script cần chạy lại dễ dàng mỗi khi đổi kiến trúc/model để so sánh (tái sử dụng cùng bộ test, chỉ đổi endpoint/config).

### 3.5 *(Phần nâng cao, làm nếu còn thời gian sau khi hệ thống chính đã chạy ổn)* — Diffusion LLM cho bước viết câu trả lời cuối

Ý tưởng: sau khi agent (LLM thường, chính xác) đã tổng hợp đủ thông tin đúng từ các tool, dùng **DiffusionGemma** (qua Google AI Studio, free) để **viết lại thành câu trả lời cuối cùng cho người dùng**, tận dụng tốc độ sinh song song của diffusion LLM cho đoạn văn dài (không giao việc quyết định/suy luận cho nó).

So sánh:

| Tiêu chí | AR LLM viết trực tiếp | DiffusionGemma viết lại (sau khi AR đã tổng hợp đúng) |
|---|---|---|
| Tốc độ sinh (token/giây) | Baseline | Kỳ vọng nhanh hơn rõ rệt cho câu trả lời dài |
| Chất lượng văn phong | Baseline | Đo bằng đánh giá thủ công/khảo sát nhỏ |
| Độ chính xác thông tin | Baseline | Kỳ vọng tương đương (vì thông tin đã được AR chốt trước, diffusion chỉ viết lại) |

> Lưu ý: đây là phần mở rộng, **không phải yêu cầu bắt buộc** — chỉ nên làm sau khi Agentic RAG core đã chạy ổn định và đúng deadline, tránh rủi ro tooling (DiffusionGemma còn khá mới, xem lại phần thảo luận trước để cân nhắc rủi ro hạ tầng).

### 3.6 Khung Đo Đạc Benchmark & So Sánh Các Biến Thể Kiến Trúc (Architecture Benchmark Framework)

Để tạo điểm sáng khoa học và minh chứng định lượng cho bài báo cáo đồ án, hệ thống thiết kế khung đo đạc so sánh giữa 3 biến thể kiến trúc:

1. **Biến thể 1: Basic RAG (Baseline 1)**: Vector search thuần túy, không có Agent controller.
2. **Biến thể 2: Single Controlled Agent Loop + Circuit Breaker + Self-RAG Evaluator (Baseline 2)**: 
   * Đồ thị điều khiển vĩ mô ➡️ Nút chạy thẳng Tool Python ➡️ LLM Evaluator đánh giá ➡️ Nút Tổng hợp (Master Brain).
   * Tích hợp 3 lớp Circuit Breaker (Max steps, Chặn gọi trùng lặp, Chặn 3 lỗi liên tiếp).
3. **Biến thể 3: Multi-Agent Sub-Graphs (Kiến trúc Phân tầng)**: 
   * Đồ thị rẽ nhánh sang các Sub-Agent chuyên trách từng miền (`product_agent`, `policy_agent`, `account_agent`).

#### Bộ chỉ số đo đạc Benchmark (Benchmark Metrics):
* **First-Turn Tool-Call Accuracy (Tỷ lệ chọn đúng Tool ngay trong lần đầu tiên)**: 
  * Đo đạc xem với một câu hỏi đầu vào, Agent có chọn **đúng 100% Tool cần thiết và đúng định dạng tham số ngay trong lượt đầu tiên (1-pass)** hay phải mất thêm lượt lặp sửa sai.
* **Cross-Model Benchmark (So sánh hiệu năng giữa các Mô hình LLM)**:
  * So sánh tỷ lệ First-Turn Tool Accuracy, Latency và Chi phí Token giữa các LLM tiêu biểu: `Gemini 1.5 Flash` vs `Gemini 1.5 Pro` vs `Claude 3.5 Haiku` vs `GPT-4o-mini`.
* **Domain-Specific Accuracy Breakdown (Phân tích theo từng Miền Domain)**:
  * Đánh giá chi tiết tỷ lệ gọi đúng tool phân theo 3 nhóm miền nghiệp vụ:
    1. *Product Domain*: `product_search`, `product_compare`, `check_stock`.
    2. *Policy Domain*: `policy_search`.
    3. *Account Domain*: `order_lookup`.
* **Latency (p50 / p95)**: Tổng thời gian phản hồi câu hỏi (giây) và số lượng lượt gọi LLM trung bình/câu hỏi.
* **Cost (Token Consumption)**: Tổng số token tiêu thụ (Input + Output Tokens) cho từng câu hỏi.
* **Faithfulness & Answer Relevancy (Đo bằng RAGAS / LLM-as-a-Judge)**: Đánh giá xem câu trả lời có bám sát dữ liệu RAG và trả lời đúng trọng tâm không.
* **Multi-Intent Handling**: Tỷ lệ xử lý thành công các câu hỏi phức hợp chứa 2-3 vế cùng lúc.

---

## PHẦN 4: TIMELINE TỔNG THỂ (mục tiêu: xong core trước 3 tuần, còn 1 tuần đệm)

| Tuần | Nội dung chính | Đầu ra |
|---|---|---|
| **Tuần 1** | Vibe code toàn bộ Web TMĐT (mục 1.4) + viết tài liệu chính sách + chuẩn bị 30–50 sản phẩm mẫu | Web chạy được, có dữ liệu thật để RAG dùng |
| **Tuần 2** | Xây Agentic RAG core: embedding + Chroma + `product_search_tool` + `policy_rag_tool` + agent controller cơ bản (chưa cần tất cả 6 tool) | Chat trả lời được câu hỏi sản phẩm/chính sách cơ bản |
| **Tuần 3 (nửa đầu)** | Thêm 4 tool còn lại (`order_lookup`, `compare`, `recommendation`, `escalate` + `staff_assist_tool`) + guardrail chống bịa + risk classifier (mục 2.7) + giới hạn vòng lặp/multi-turn (mục 2.9) + tích hợp API vào popup chat trên web | Agentic RAG hoàn chỉnh, tích hợp end-to-end |
| **Tuần 3 (nửa sau)** | Tạo bộ câu hỏi test theo đúng form (mục 3.4-a), viết script benchmark tự động, chạy benchmark (Phần 3.1–3.4) | Số liệu so sánh cho báo cáo, xuất từ script chứ không nhập tay |
| **Tuần 4** | *(Đệm)* Thử phần nâng cao Diffusion LLM (3.5) hoặc mở rộng Phần 5 nếu kịp, viết báo cáo, quay video demo, rà soát lỗi | Nộp trước hạn |

**Nguyên tắc ưu tiên nếu thiếu thời gian**: Web (Phần 1) → Agentic RAG core 3 tool đầu (Phần 2, mục 1–2–4) → guardrail chống bịa + giới hạn vòng lặp (2.9, dùng `n` mặc định hợp lý nếu không kịp benchmark) → Benchmark cơ bản (3.1–3.4, có thể chạy tay tạm 1 lần nếu không kịp viết script, nhưng nên ưu tiên script vì phải chạy lại nhiều lần) → các phần còn lại (tool `escalate`/`recommendation`, risk classifier đầy đủ 3 mức, benchmark diffusion, Phần 5) là "nice-to-have", cắt bớt nếu cần mà không ảnh hưởng tới việc nộp đúng hạn.

---

## PHẦN 5: MỞ RỘNG NẾU THỜI GIAN CHO PHÉP (>1 THÁNG)

Các hạng mục dưới đây **không bắt buộc**, chỉ nên làm sau khi Phần 1–3 (core) đã hoàn thiện và chạy ổn định, đúng deadline gốc 1 tháng.

### 5.1 Mở rộng bộ test & benchmark
- Mở rộng bộ test hội thoại nhiều lượt (mục 2.9) với chuỗi phức tạp hơn (5–6 lượt, nhiều tham chiếu ngầm chồng chéo).
- Benchmark thêm giá trị `n` vòng lặp agentic ở dải rộng hơn, thêm biến thể kiến trúc retrieval nếu phát sinh ý tưởng mới trong lúc làm.
- Chạy KD/DPO thật (mục 2.8) cho model nhỏ local, đưa vào benchmark so sánh chính thức thay vì chỉ dừng ở đề xuất lý thuyết.

### 5.2 RAG cho nhân viên hỏi đáp nội bộ
- Xây thêm 1 luồng RAG riêng (hoặc dùng chung agent controller nhưng đổi hệ tri thức) phục vụ **nhân viên nội bộ**: quy trình xử lý ticket, chính sách nội bộ chưa public cho khách (VD chi tiết quy trình duyệt hoàn tiền, thang phân loại rủi ro ở mục 2.7...), tra cứu nhanh thông tin sản phẩm/đơn hàng phục vụ công việc.
- Dữ liệu nguồn: tài liệu nội bộ (quy trình, SOP) — tự viết thêm, tương tự cách chuẩn bị tài liệu chính sách khách hàng ở mục 2.4.
- Benchmark: dùng lại **y hệt bộ thang đo ở mục 3.4**, hoặc làm 1 bộ test riêng theo đặc thù câu hỏi nội bộ (VD nhóm "tra cứu quy trình", "tra cứu quyền hạn xử lý ticket") nếu câu hỏi nội bộ khác biệt đáng kể so với câu hỏi khách hàng.
- Lưu ý phân quyền: RAG nội bộ cần xác thực nhân viên (khác cơ chế xác thực khách hàng ở mục 2.3), tránh lộ dữ liệu nội bộ nếu tích hợp chung giao diện.

### 5.3 Diffusion LLM cho bước viết câu trả lời cuối
Xem chi tiết ở mục 3.5 — giữ nguyên vị trí ưu tiên thấp nhất trong toàn bộ kế hoạch.

---

## PHẦN BỔ SUNG: CẬP NHẬT THỰC TẾ TRIỂN KHAI (SO SÁNH THIẾT KẾ CŨ & TRIỂN KHAI MỚI)

Dưới đây là bảng đối chiếu chi tiết giữa thiết kế dự kiến ban đầu trong kế hoạch và thực tế triển khai thực tế của dự án tính đến thời điểm hiện tại:

### 1. Cơ sở dữ liệu Vector (Vector Store) & Data Flow
*   **Thiết kế cũ (Kế hoạch)**: Dự kiến sử dụng `pgvector` trực tiếp trong cơ sở dữ liệu Supabase làm Vector Store chính để vừa `WHERE` giá vừa tìm kiếm vector cùng một lúc.
*   **Triển khai mới (Thực tế)**: Sử dụng **ChromaDB cục bộ (Persistent Client)** làm Vector Store chính cho cả 2 collection `products_collection` và `policies_collection`. Việc này giúp quá trình demo cục bộ, benchmark và thay đổi cấu hình RAG (chunk_size, embedding model) trở nên cực kỳ linh hoạt và độc lập với Supabase Cloud.

### 2. Kiến trúc phân lớp code (OOP & Functional Interface)
*   **Thiết kế cũ (Kế hoạch)**: Chưa quy định chi tiết cách tổ chức các file Python trong `src/`.
*   **Triển khai mới (Thực tế)**: Tách biệt hoàn toàn thành 2 tầng rõ rệt:
    *   **Tầng Logic Nghiệp Vụ (OOP - `src/c_retrieval/`)**: Định nghĩa lớp cha `BaseRetriever` xử lý Embedding, Chroma query và Reranker. Các lớp con `ProductRetriever` và `PolicyRetriever` kế thừa trực tiếp để sử dụng lại code mà không cần duplicate.
    *   **Tầng Giao Tiếp LLM (Functional - `src/d_tools/`)**: Chứa các file tool độc lập như `product_search.py`, `policy_search.py`, `product_compare.py`. Tầng này chỉ expose các hàm Python thuần (`def`) nhận tham số và định dạng string sạch sẽ cho LLM, đi kèm JSON Schema và được gom chung tại `__init__.py`.

### 3. Xử lý khoảng giá và lọc cứng (Metadata Filtering)
*   **Thiết kế cũ (Kế hoạch)**: Định tuyến SQL trực tiếp qua Supabase hoặc pgvector SQL query.
*   **Triển khai mới (Thực tế)**: Tận dụng cơ chế **Metadata Filtering (`where` filter)** trực tiếp trong ChromaDB. Viết hàm dynamic build where clause trong `BaseRetriever` để lọc cứng `brand`, `min_price`, và `max_price` ngay khi query Vector DB, đảm bảo Reranker chỉ xếp hạng các sản phẩm nằm trong khoảng giá mong muốn.

    *   Xây dựng cơ chế **Co giãn giới hạn động (Dynamic Limit Scaling)** trong `BaseRetriever`: Nếu người dùng yêu cầu số lượng kết quả (`limit`) lớn hơn giá trị `k_rerank` mặc định, hệ thống sẽ tự động nâng `k_rerank = limit` và nâng `k_query = limit * 3` để đảm bảo luôn cung cấp đủ số lượng ứng viên chất lượng cho Reranker.
        *   *Usecase thực tế cần giải quyết*: Khách hàng yêu cầu *"Kể cho tôi 10 sản phẩm laptop HP dưới 20 triệu"*. Nếu cấu hình `k_rerank` mặc định trong hệ thống chỉ là 5, RAG thông thường sẽ chỉ trả về tối đa 5 sản phẩm (không đáp ứng đủ yêu cầu). Nhờ cơ chế Dynamic Scaling, hệ thống tự động nhận diện `limit = 10 > k_rerank (5)`, sau đó tự động co giãn nâng `k_rerank` lên 10 và `k_query` lên 30 ở tầng DB/Reranker, đảm bảo trả về đủ và đúng số lượng 10 sản phẩm tốt nhất cho người dùng.

### 5. Tool so sánh nhiều sản phẩm chuyên biệt (`product_compare`)
*   **Thiết kế cũ (Kế hoạch)**: Dự kiến để LLM tự quyết định gọi nhiều lượt query hoặc dùng SQL.
*   **Triển khai mới (Thực tế)**: Viết tool `product_compare` chuyên biệt nhận danh sách tên máy `product_names`. Tool tự chạy vòng lặp Python cục bộ để tìm từng máy với `limit=1` (đáp ứng đúng ý tưởng `rerank = 1`), gom thông tin lại 1 lần duy nhất gửi cho LLM. Thiết kế này giúp tiết kiệm lượt gọi API của LLM, tăng tốc độ phản hồi và nâng cao độ chính xác khi so sánh.

### 6. Nguyên tắc định hướng nhu cầu & Khóa hệ sinh thái (Agent Controller Level)
*   **Thiết kế cũ (Kế hoạch)**: Đưa ra lựa chọn tích hợp Web Search thô để lấy thông tin bên ngoài.
*   **Triển khai mới (Thực tế)**: Quyết định **Khóa hệ sinh thái dữ liệu**, không tích hợp Web Search ngoài để bảo vệ dữ liệu, tối ưu hóa tốc độ (giảm 2-4s latency gọi API ngoài) và ngăn chặn việc Agent tư vấn nhầm sang sản phẩm của các shop đối thủ.
*   **Cơ chế Định hướng nhu cầu (Demand Redirection)**: Được lập trình trực tiếp bằng Prompt hệ thống ở tầng Agent Controller. Khi khách hàng hỏi về sản phẩm/thương hiệu không có trong kho:
    1.  Agent nhận diện phân khúc/nhu cầu của sản phẩm đó (Ví dụ: Lenovo ThinkPad ➡️ nhu cầu làm việc văn phòng, độ bền cao).
    2.  Agent tự động chuyển hướng gọi `product_search` để truy xuất các sản phẩm có tính chất tương đương trong kho (Ví dụ: Dell Latitude, HP ProBook).
    3.  Agent trả lời khéo léo thông báo shop tạm hết hàng dòng đó và tư vấn khách chuyển hướng sang các sản phẩm thay thế tương đương đang sẵn có để chốt đơn.

### 7. Danh sách các Usecase so sánh và tìm kiếm sản phẩm thực tế
Để đảm bảo khả năng tư vấn thông minh cho cả đối tượng khách hàng rành công nghệ lẫn người dùng phổ thông (người lớn tuổi hỏi mơ hồ), hệ thống Agentic RAG đã thiết kế và xử lý các usecase thực tế sau:

| # | Câu hỏi của Khách hàng | Loại câu hỏi | Cách Agent & Tool phối hợp xử lý |
|---|---|---|---|
| **1** | *"Tìm laptop chơi game mượt giá dưới 20 triệu"* | Tìm kiếm ngữ nghĩa + lọc cứng | LLM trích xuất `key_word` và `max_price`. Gọi `product_search`. ChromaDB thực hiện lọc cứng price trước, Reranker xếp hạng ngữ nghĩa sau. |
| **2** | *"Kể cho tôi 10 sản phẩm laptop HP dưới 20 triệu"* | Yêu cầu số lượng lớn vượt config | Kích hoạt **Co giãn giới hạn động (Dynamic Limit Scaling)**. Hệ thống tự động nâng `k_rerank = 10` và `k_query = 30` ở tầng DB để không bị thiếu kết quả. |
| **3** | *"So sánh giúp tôi Dell XPS 13 và MacBook Air M2"* | So sánh trực tiếp các sản phẩm cụ thể | LLM gọi duy nhất 1 tool `product_compare(product_names=['Dell XPS 13', 'MacBook Air M2'])`. Python chạy vòng lặp cục bộ lấy đúng 1 kết quả tốt nhất (`limit=1`) cho mỗi máy. |
| **4** | *"So sánh điện thoại Samsung dòng A, dòng M và dòng S"* | So sánh dòng sản phẩm / phân khúc vĩ mô | LLM nhận diện đây là cẩm nang mua sắm. Gọi tool `policy_search` để lấy thông tin FAQ phân khúc của shop, hoặc gọi `product_search` lấy nhiều mẫu đại diện tự tổng hợp. |
| **5** | *"So sánh Samsung A06 và các dòng Samsung khác"* | So sánh 1 máy cụ thể với dòng máy chung chung | LLM tìm specs của A06 trước (giá rẻ) ➡️ Tự động gọi tiếp `product_search` tìm các máy Samsung giá rẻ dưới 5 triệu để làm đối chứng so sánh cho hợp lý. |
| **6** | *"So sánh Samsung S24 Plus với các dòng iPhone"* | So sánh 1 máy cụ thể với thương hiệu đối thủ | LLM lấy specs của S24 Plus (flagship) ➡️ Tự suy luận đối thủ xứng tầm của nó bên Apple (iPhone 15 Plus hoặc iPhone 15 Pro) ➡️ Gọi tiếp `product_search` tìm iPhone tương ứng để so sánh. |
| **7** | *"So sánh Samsung S24, S25 Plus, iPhone 16 và các dòng Xiaomi của Tàu"* | Câu hỏi hỗn hợp phức tạp (cụ thể + mơ hồ) | LLM tách câu hỏi làm 2 phần: gọi `product_compare` cho 3 máy cụ thể, và gọi song song `product_search` tìm các dòng flagship Xiaomi tương đương ➡️ Gom thông tin so sánh. |
| **8** | *"Shop mình có bán laptop Lenovo ThinkPad không?"* | Hỏi sản phẩm không có sẵn (Định hướng nhu cầu) | LLM nhận diện ThinkPad không nằm trong danh mục sản phẩm của shop ➡️ Không dùng Web Search ngoài ➡️ Tự gọi `product_search` tìm các dòng máy tương đương đang có sẵn (Dell Latitude, HP ProBook) để tư vấn định hướng khách hàng mua sản phẩm của shop. |

