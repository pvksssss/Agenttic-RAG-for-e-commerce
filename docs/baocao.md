# Báo cáo chi tiết về thực tập

## 1. Chủ đề thực tập: Xây dựng hệ thống chatbot TMĐT chăm sóc khách hàng bằng kiến trúc Agentic RAG

### 1.1. Lý do chọn đề tài và tính cấp thiết

Chatbot thương mại điện tử hiện nay cần trả lời đúng về sản phẩm (giá, tồn kho, thông số), chính sách (bảo hành, đổi trả), và đơn hàng cá nhân. Các hệ thống RAG đơn giản chỉ tra cứu văn bản tĩnh, dễ bị lỗi khi dữ liệu thay đổi hoặc câu hỏi cần nhiều bước suy luận. Agentic RAG kết hợp LLM với công cụ (tool calling) để tự động truy vấn SQL/vector DB theo từng ngữ cảnh, giúp trả lời chính xác và có thể kiểm chứng.

### 1.2. Mục tiêu nghiên cứu và phát triển

- Xây dựng pipeline ngầm định (data ingestion, indexing, retrieval) cho sản phẩm/chính sách.
- Thiết kế agent ReAct có khả năng gọi hàm tìm kiếm sản phẩm, so sánh, tra chính sách, tra đơn hàng.
- Xây dựng bộ benchmark tự động để đánh giá agent theo đúng công cụ/tham số/ground truth.
- So sánh Agentic RAG với các baseline đơn giản hơn (Basic RAG, 1-tool RAG).

### 1.3. Phạm vi và đối tượng nghiên cứu

- Lĩnh vực: điện thoại, laptop và phụ kiện.
- Ngôn ngữ: tiếng Việt tự nhiên, đa dạng văn phong.
- Dữ liệu: sản phẩm, chính sách cửa hàng, đơn hàng người dùng.
- Mô hình agent: flat ReAct trên LangGraph, LLM chính là Gemini, LLM chấm điểm (judge) là Groq.

## 2. Kiến thức cơ bản và công nghệ áp dụng

### 2.1. Retrieval-Augmented Generation (RAG) và Naive RAG

Naive RAG: embed query → tìm top-k chunk trong vector DB → đưa chunk vào prompt → LLM trả lời. Hạn chế: không cập nhật giá/tồn kho theo thời gian thực, khó xử lý câu hỏi đòi hỏi nhiều bước hoặc nhiều điều kiện (dưới 20 triệu, brand A hoặc B). Trong đồ án này, Naive RAG được triển khai làm **baseline** để đo lường giá trị gia tăng thực tế của cơ chế gọi công cụ (tool use) và khả năng lập kế hoạch (planning) của agent.

### 2.2. Agentic RAG và cơ chế ReAct Loop

ReAct = Reasoning + Acting. Agent suy nghĩ từng bước, quyết định gọi công cụ, quan sát kết quả, rồi tiếp tục hoặc trả lời. Trong hệ thống, **bộ não điều khiển (Master Agent)** thực hiện vòng lặp suy luận tối đa `max_turns` lượt, mỗi lượt gọi LLM theo cơ chế function calling, truyền danh sách schema công cụ, và xử lý phản hồi dạng streaming từng phần.

### 2.3. Cơ chế Function Calling của LLM

Mỗi công cụ (tool) được khai báo dưới dạng **JSON Schema** theo chuẩn OpenAI Function Calling gồm: tên hàm, mô tả, danh sách tham số và ràng buộc. Khi hội thoại cần dữ liệu, LLM trả về một `function_call` với tên hàm và đối số. Agent trích xuất, **chuẩn hóa linh hoạt đối số** (hỗ trợ nhiều định dạng JSON/YAML, cấu trúc phẳng hoặc lồng), thực thi hàm Python thật, rồi đưa kết quả trở lại làm ngữ cảnh cho lượt suy luận tiếp theo.

### 2.4. Cơ sở dữ liệu Vector và ChromaDB

- Hệ thống sử dụng **ChromaDB dạng PersistentClient**, lưu dữ liệu vector cục bộ với không gian đo **cosine**.
- Mỗi sản phẩm/chính sách được chia đoạn (chunk), **nhúng bằng mô hình `nvidia/llama-nemotron-embed-vl-1b-v2:free`** (vector 2048 chiều) qua dịch vụ OpenRouter, lưu kèm metadata (`brand`, `category`, `product_id`, `price`, ...).
- Hệ thống có 2 bộ sưu tập chính: bộ sưu tập sản phẩm và bộ sưu tập chính sách.
- Truy vấn kết hợp **tìm kiếm tương tự vector** với **bộ lọc metadata** (`$and`, `$in`, so sánh), sau đó **xếp hạng lại (rerank)** kết quả bằng mô hình `nvidia/llama-nemotron-rerank-vl-1b-v2:free` của OpenRouter để chọn top-k phù hợp nhất.
- Tầng truy vấn còn hỗ trợ **co giãn động số lượng kết quả**: nếu yêu cầu `limit` lớn hơn cấu hình mặc định, hệ thống tự tăng số ứng viên gốc (thường gấp 3 lần) trước khi rerank để đảm bảo chất lượng.

### 2.5. LangGraph / StateGraph

Đồ thị hội thoại được xây dựng bằng **LangGraph StateGraph**, gồm các nút: tiếp nhận & xác thực, phân loại an ninh, agent chính, từ chối. Trạng thái hội thoại được lưu qua **MemorySaver** theo `thread_id` (tương ứng một phiên chat), cho phép hội thoại nhiều lượt giữ được ngữ cảnh. State lưu đầy đủ câu hỏi người dùng, mã phiên, token/ID người dùng, mức rủi ro, lịch sử tin nhắn và **lịch sử các lần gọi công cụ** — được cộng dồn qua các lượt nhờ cơ chế reducer.

### 2.6. Xác thực JWT và Row-Level Security (RLS) của Supabase

Hệ thống sử dụng **Supabase Auth** làm nền tảng xác thực, với **ba loại kết nối dữ liệu** để đảm bảo an toàn:

1. **Client quyền thấp (anon)**: dùng để **kiểm tra hợp lệ JWT online** qua API xác thực của Supabase — tránh dùng khóa quản trị khi đọc token của khách hàng.
2. **Client quản trị (service role)**: dùng cho các thao tác backend nội bộ.
3. **Client động theo người dùng**: nhúng JWT của người dùng vào header, giúp Supabase **áp dụng Row-Level Security (RLS)** ngay tại tầng cơ sở dữ liệu.

Quá trình xác thực: khi nhận được token từ header `Authorization` hoặc từ request, hệ thống gọi hàm kiểm tra token online và trả về UUID của người dùng nếu hợp lệ. Từ đó state đánh dấu `is_authenticated` và lưu `user_id`. Khi người dùng hỏi về đơn hàng, công cụ tra cứu sẽ dùng client động theo JWT để truy vấn (RLS chặn dữ liệu của người khác), **đồng thời lọc thêm theo `user_id` ở tầng ứng dụng** như một lớp bảo vệ kép. Nếu chưa đăng nhập, công cụ trả về thông báo hướng dẫn đăng nhập.

## 3. Kiến trúc chi tiết hệ thống

### 3.0. Tổng quan kiến trúc backend

Backend là một **dịch vụ API (FastAPI)** kết hợp bốn khối chính:

- **Đồ thị hội thoại (LangGraph)**: điều khiển luồng xử lý câu hỏi.
- **Tầng gọi LLM đa nhà cung cấp**: đóng gói lời gọi đến Gemini/Groq, hỗ trợ streaming, function calling và **tự động xoay vòng nhiều khóa API** khi bị giới hạn tần suất.
- **Cơ sở dữ liệu vector (ChromaDB)**: dữ liệu tĩnh như mô tả sản phẩm, chính sách.
- **Supabase (Postgres + Auth)**: dữ liệu động như giá, tồn kho, đơn hàng; đồng thời là nơi xác thực JWT.

Luồng xử lý một câu hỏi trong phiên bản production:

```
[Tiếp nhận & xác thực JWT]
      ↓
[Phân loại an ninh: safe / needs_ticket / attack]
      ↓
├── attack hoặc needs_ticket → [Nút từ chối]: từ chối lịch sự, hướng dẫn tạo ticket → Kết thúc
└── safe → [Master Agent]: vòng lặp ReAct gọi công cụ, trả lời → Kết thúc
```

### 3.1. Quy trình chuẩn bị dữ liệu

#### 3.1.1. Thu thập dữ liệu thô

Dữ liệu sản phẩm (laptop, điện thoại, phụ kiện) được thu thập từ nguồn CSV/JSON, chính sách cửa hàng từ hệ thống FAQ. Ngoài dữ liệu tĩnh, hệ thống còn có các script thu thập dữ liệu (crawl) và nhập khẩu thông số sản phẩm từ kho dữ liệu Icecat.

#### 3.1.2. Phân tích, chuẩn hóa và nạp Postgres (Supabase)

- Dữ liệu JSON thô được phân tích: tách phần mô tả nổi bật, **giải mã toàn bộ thông số kỹ thuật thành một cấu trúc key-value động (JSONB)**, làm sạch các khóa rác, tự động tính phần trăm giảm giá, loại bỏ trùng lặp theo ID, rồi **ghi hàng loạt (upsert)** vào bảng sản phẩm.
- Tầng làm sạch loại bỏ thẻ HTML lẫn trong mô tả, chuẩn hóa tên, thương hiệu, giá và thông số.
- Tầng định dạng chuyển mỗi sản phẩm thành **một văn bản tiếng Việt thống nhất, có cấu trúc** (gộp bộ vi xử lý, RAM, lưu trữ, màn hình, pin, camera, trọng lượng, kích thước...), phục vụ cho việc nhúng.

#### 3.1.3. Chunking, Embedding và Vector DB

- Tài liệu được chia đoạn bằng **bộ tách văn bản đệ quy theo cấu trúc** (kích thước 1000 ký tự, chồng lấp 200) để giữ ngữ cảnh liền mạch.
- Từng đoạn được **nhúng vector 2048 chiều** (mô hình NVIDIA Nemotron qua OpenRouter) và lưu vào ChromaDB.
- Khi truy vấn, kết quả ban đầu được **xếp hạng lại bằng mô hình rerank** để nâng cao độ chính xác top-k.

#### 3.1.4. Cấu trúc cơ sở dữ liệu (Supabase)

Hệ thống khởi tạo **6 bảng dữ liệu**, tất cả đều **bật Row-Level Security (RLS)**:

| Bảng | Mục đích | Các trường chính |
|---|---|---|
| `products` | Sản phẩm | ID, tên, thương hiệu, SKU, danh mục, giá gốc, giá bán, giảm giá, tồn kho, thông số phẳng (CPU, RAM, lưu trữ, màn hình...) và `specs` dạng JSONB |
| `orders` | Đơn hàng | UUID, `user_id` liên kết tài khoản Supabase, trạng thái, danh sách sản phẩm (JSONB), tổng tiền, địa chỉ giao hàng |
| `reviews` | Đánh giá | Liên kết sản phẩm, người đánh giá, số sao (1–5), nội dung |
| `support_tickets` | Ticket hỗ trợ | Người gửi, đơn hàng liên quan, loại yêu cầu, mức rủi ro, nguồn tạo, trạng thái, người phụ trách |
| `chat_logs` | Nhật ký trò chuyện | Mã phiên, người dùng, vai trò (user/agent/tool/system), nội dung, công cụ dùng, mức rủi ro |
| `policies` | Chính sách | Tiêu đề, nội dung, loại chính sách (đổi trả / bảo hành / giao hàng / FAQ) |

Các bảng sản phẩm, đánh giá, chính sách cho phép **đọc công khai**; các bảng đơn hàng, ticket, nhật ký chat được **bảo vệ theo người dùng** — chính nhờ vậy mà cơ chế JWT + RLS trở nên bắt buộc khi truy vấn dữ liệu cá nhân.

### 3.2. Thiết kế đồ thị hội thoại (LangGraph)

#### 3.2.1. Phân loại an ninh và bảo vệ (Guardrail)

Đây là **nút phân loại**, thực hiện **duy nhất một lần gọi LLM** với mô hình nhẹ và nhanh, **không gọi bất kỳ công cụ nào**. Dựa trên prompt phân loại, nó trả về một trong ba nhánh:

- `safe` — câu hỏi thông thường đúng phạm vi chăm sóc khách hàng → chuyển sang Master Agent.
- `needs_ticket` — yêu cầu có **rủi ro kinh tế** (mặc cả giá, xin ưu đãi ngoài chương trình, hoàn tiền vượt chính sách) → nút từ chối: ghi nhận yêu cầu, hướng khách **tạo ticket** cho bộ phận xử lý.
- `attack` — dấu hiệu **khai thác/thao túng hệ thống** (prompt injection, đóng vai, yêu cầu tiết lộ hướng dẫn nội bộ) → nút từ chối và **không lưu tin nhắn** vào lịch sử.

Nguyên tắc phân loại: đánh giá theo **ý đồ** lời nói, không chỉ theo từ khóa; khi phân vân giữa an toàn và cần ticket thì **ưu tiên an toàn hơn** (để con người xác nhận); khi nghi ngờ tấn công thì **ưu tiên chặn**.

#### 3.2.2. Bộ não điều khiển Agent (Master Agent)

- Nhận lịch sử hội thoại, danh sách schema công cụ, ngữ cảnh xác thực và hướng dẫn kỹ năng (skill) tùy chọn.
- Gọi LLM **dạng streaming**, phân tích từng phần phản hồi để gom văn bản, lời gọi công cụ (tên + đối số) và chữ ký suy luận (thought signature).
- Thực thi công cụ thật, đưa kết quả trở lại làm ngữ cảnh, lặp lại đến giới hạn số lượt.
- **Tự động tiêm thông tin xác thực** cho các công cụ cần đăng nhập (tra đơn hàng, giỏ hàng...); danh sách này được khai báo tập trung để dễ mở rộng.
- **Chuẩn hóa đối số công cụ** linh hoạt: chấp nhận nhiều định dạng LLM trả về (chuỗi JSON/YAML, mảng câu hỏi, đối tượng phẳng), hợp nhất giá trị mặc định, đảm bảo mỗi công cụ luôn nhận đúng cấu trúc dữ liệu.
- Trả về câu trả lời cuối cùng (hoặc `None` nếu hết số lượt mà vẫn cần gọi công cụ), kèm lịch sử công cụ, số token và độ trễ.

#### 3.2.3. Quản lý trạng thái và bộ nhớ phiên

Bộ nhớ phiên dùng LangGraph `MemorySaver` theo `thread_id`. Lịch sử lời gọi công cụ và trạng thái hội thoại được **cập nhật và cộng dồn** sau mỗi lượt, giúp Master Agent **tái sử dụng ngữ cảnh tìm kiếm trước đó** — ví dụ khi khách hỏi tiếp "4 sản phẩm đó dùng chip gì", hệ thống chèn một ghi chú nhắc agent giữ nguyên bộ lọc (hãng, giá, chế độ) của lần tìm kiếm trước.

#### 3.2.4. Cơ chế an toàn

- Giới hạn số lượt suy luận ngăn **vòng lặp vô hạn**.
- Giới hạn số lần thử lại khi gặp lỗi API.
- Chỉ các công cụ cần xác thực mới được nhận token người dùng.
- Lớp phân loại an ninh chặn prompt injection từ đầu.
- Prompt hướng dẫn chính cấm agent **bịa đặt thông tin**, giữ vai trò nhân viên CSKH và **không tiết lộ hướng dẫn nội bộ**.

#### 3.2.5. Giao diện API (Endpoint)

Hệ thống cung cấp hai endpoint chính:

- **Kiểm tra sức khỏe** (`GET`) : trả về trạng thái dịch vụ, chế độ debug và trạng thái kết nối Supabase.
- **Trò chuyện** (`POST`) : nhận câu hỏi, mã phiên và token tùy chọn (từ header `Authorization` hoặc trong body). Quy trình: (1) kiểm tra JWT để lấy ID người dùng nếu có; (2) gọi đồ thị hội thoại với thread_id là mã phiên; (3) trích xuất câu trả lời cuối, nguồn trích dẫn và danh sách công cụ đã dùng; (4) trả về phản hồi chuẩn.

#### 3.2.6. Tầng gọi LLM đa nhà cung cấp

Đây là tầng trung gian thống nhất mọi lời gọi đến các nhà cung cấp mô hình:

- **Hỗ trợ hai nhà cung cấp chính**: Gemini (Google) và Groq, cả hai đều hỗ trợ streaming, function calling và gọi song song.
- **Tự động xoay vòng nhiều khóa API** (cấu hình tới 8 khóa mỗi nhà cung cấp): khi gặp lỗi giới hạn tần suất (429), hệ thống chuyển sang khóa kế tiếp; nếu hết cả vòng thì **chờ 60 giây và thử lại**, tối đa số vòng cho phép. Điều này rất quan trọng khi dùng gói miễn phí.
- **Chuyển đổi định dạng tin nhắn** giữa chuẩn OpenAI (dùng chung cho Groq) và chuẩn Gemini, **giữ nguyên lời gọi công cụ và chữ ký suy luận** — khắc phục triệt để lỗi vòng lặp vô hạn khi gọi công cụ trên Gemini.
- Cấu hình **hai mô hình riêng** cho hai vai trò: mô hình định tuyến (chịu trách nhiệm quyết định gọi công cụ) và mô hình trả lời (sinh câu trả lời cuối), giúp tối ưu chi phí và tốc độ.
- Đo đếm số token vào/ra mỗi lượt, phục vụ đánh giá hiệu năng.

### 3.3. Cơ chế định tuyến truy vấn

#### 3.3.1. Truy vấn dữ liệu tĩnh (Vector DB)

Dùng cho mô tả sản phẩm, chính sách và FAQ. Tầng truy vấn nhúng câu hỏi → tra cứu ChromaDB (có thể kèm bộ lọc metadata về thương hiệu, giá, mã sản phẩm) → xếp hạng lại → trả về tài liệu kèm metadata và điểm tương đồng.

#### 3.3.2. Truy vấn dữ liệu động (Relational DB)

Dùng cho giá, tồn kho, đơn hàng — những dữ liệu thay đổi liên tục. Công cụ tìm sản phẩm **truy vấn SQL trước** để lấy tập ứng viên (theo hãng, danh mục, tên dòng máy, khoảng giá) cùng giá/tồn kho thời gian thực, sau đó **tìm kiếm ngữ nghĩa trong chính tập ứng viên đó**. Nếu không có bộ lọc cứng, hệ thống tìm kiếm trên toàn bộ vector DB.

### 3.4. Thiết kế công cụ (Tools)

Mỗi công cụ gồm một hàm xử lý thật và một **schema khai báo** để LLM gọi đúng. Bốn công cụ chính:

#### 3.4.1. Công cụ tìm kiếm và so sánh sản phẩm

- **Tìm kiếm sản phẩm**: hỗ trợ nhiều tham số lọc (hãng, danh mục, giá, tên dòng máy) và **hai chế độ trả kết quả**:
  - `rank` — trả top-N sản phẩm phù hợp nhất (dùng cho "rẻ nhất", "top 5", "nên mua").
  - `lines` — **nhóm theo dòng máy/series**, trả một đại diện rẻ nhất mỗi dòng (dùng cho "có những dòng nào", "các loại").
  - Kết hợp dữ liệu giá/tồn kho/SKU **thời gian thực** từ cơ sở dữ liệu, và rút trích nhanh các thông số (chip, RAM, lưu trữ, màn hình, pin) khi khách yêu cầu thông số chi tiết.
- **So sánh sản phẩm**: so sánh thông số và giá thật của các sản phẩm cụ thể, chỉ dùng khi khách **nêu tên rõ 2+ sản phẩm**.

#### 3.4.2. Công cụ chính sách

Tìm kiếm chính sách bảo hành, đổi trả, trả góp, vận chuyển trong bộ sưu tập chính sách. LLM được hướng dẫn **rút gọn câu hỏi thành 1–3 từ khóa tiếng Việt** trước khi tìm kiếm.

#### 3.4.3. Công cụ tài khoản (tra cứu đơn hàng)

Tra cứu đơn hàng theo người dùng đã đăng nhập. Thông tin xác thực (ID người dùng, token) được **tiêm tự động** bởi Master Agent, không do LLM sinh ra — vì vậy không nằm trong schema khai báo. Công cụ ưu tiên truy vấn bằng client động theo JWT để RLS chặn dữ liệu của người khác; nếu khách chỉ hỏi chung chung hoặc theo tên sản phẩm, công cụ trả **5 đơn hàng gần nhất kèm tên sản phẩm** để agent đối chiếu.

### 3.5. Hướng dẫn kỹ năng (Skill Injection)

Tùy theo câu hỏi, hệ thống **chọn một file hướng dẫn markdown phù hợp** và tiêm vào prompt hệ thống như một "kỹ năng" chuyên biệt, giúp agent xử lý chính xác từng loại tình huống:

- **Câu hỏi mơ hồ**: hướng dẫn **KHÔNG gọi công cụ** khi thiếu loại sản phẩm/hãng/giá/nhu cầu — thay vào đó hỏi lại khách 1–2 câu ngắn gọn.
- **Câu hỏi thông số cụ thể**: hướng dẫn xử lý chip, RAM, pin, giá, tồn kho.
- **Chính sách và đơn hàng**: hướng dẫn chuyên sâu theo từng lĩnh vực.
- **Hội thoại nhiều lượt**: mẫu nhắc nhắc agent **tái sử dụng bộ lọc** của lần tìm kiếm trước khi khách hỏi tiếp.

Cách làm này giữ cho prompt chính ngắn gọn, **giảm token** và tăng độ chính xác theo từng loại câu hỏi.

## 4. Kế hoạch Benchmark & Đánh giá

### 4.1. Quy trình tạo bộ dữ liệu kiểm thử

#### 4.1.1. Sinh câu hỏi tiếng Việt tự nhiên

Một **trình sinh benchmark** dùng LLM Gemini (có xoay vòng khóa) để biến các bộ tham số (skeleton) thành câu hỏi tiếng Việt tự nhiên, đa dạng văn phong. Ví dụ bộ tham số `{hãng: ASUS, sản phẩm: ROG Zephyrus G16, thông tin: RAM}` có thể trở thành câu hỏi thực tế của khách hàng. Trình sinh hỗ trợ nhiều loại: thông số đơn lẻ, liệt kê dòng máy, top-N, so sánh, điều kiện OR, câu hỏi mơ hồ, hội thoại nhiều lượt, tra đơn hàng, yêu cầu rủi ro/ticket, tấn công và câu hỏi tổng hợp. Mỗi mẫu chứa câu hỏi, **lời gọi công cụ kỳ vọng** (tên công cụ + tham số chuẩn) và **đáp án chuẩn** (danh sách sản phẩm + tóm tắt + thông số).

#### 4.1.2. Sinh câu hỏi chính sách

Câu hỏi chính sách và câu hỏi tổng hợp được sinh từ danh sách chủ đề (bảo hành, đổi trả, trả góp) kết hợp với sản phẩm. Đáp án chuẩn được **xác minh bằng cách chạy thật lời gọi công cụ kỳ vọng trên cơ sở dữ liệu** để đảm bảo khớp thực tế.

### 4.2. Các chỉ số đánh giá

#### 4.2.1. RAGAS / Judge LLM

Gồm năm chỉ số chất lượng: mức độ trung thực (faithfulness), độ chính xác câu trả lời (answer_correctness), độ liên quan câu trả lời (answer_relevancy), độ chính xác ngữ cảnh (context_precision) và độ bao phủ ngữ cảnh (context_recall). Trình chấm điểm (judge) dùng LLM Groq/Gemini theo **bảng rubric**, tự động xoay khóa khi bị giới hạn tần suất; đồng thời hỗ trợ chạy bộ đo RAGAS để đối chiếu chéo.

#### 4.2.2. Chỉ số hành vi agent

- **Độ chính xác chọn công cụ** (tool_selection_accuracy): đo mức agent chọn đúng công cụ cần thiết.
- **Độ chính xác tham số công cụ** (tool_arg_accuracy): so khớp tham số gọi thật với kỳ vọng, chấm mềm theo từng công cụ.
- **Điểm end-to-end** (e2e_score): trung bình của độ chính xác câu trả lời + chọn công cụ + tham số công cụ.
- **Phát hiện vòng lặp**: phát hiện agent gọi lặp cùng công cụ/đối số.
- Số lần gọi không thành công.

#### 4.2.3. Hiệu năng & chi phí

Độ trễ (trung bình/trung vị/p95), số token vào, token ra, tổng token, và **phân bố số lần gọi công cụ** (0/1/2/3+).

### 4.3. Quy trình chạy thử nghiệm

1. Sinh bộ kiểm thử (bằng trình sinh hoặc RAGAS).
2. Xác minh lời gọi công cụ kỳ vọng khớp với đáp án chuẩn.
3. Chạy agent trên bộ kiểm thử → lưu kết quả thô.
4. Đánh giá → xuất báo cáo tổng hợp và bảng điểm chi tiết từng mẫu.
5. In bảng điều khiển (dashboard) trực quan hóa toàn bộ chỉ số.

## 5. Các khó khăn và giải pháp

### 5.1. Hạn chế của RAGAS

RAGAS đánh giá ngữ cảnh theo từng lượt hội thoại. Nếu hội thoại nhiều lượt truyền ngữ cảnh tích lũy toàn bộ, chỉ số độ chính xác ngữ cảnh sẽ rất thấp. Giải pháp: khi xây dựng bảng dữ liệu đánh giá, **chỉ lấy kết quả công cụ của lượt hiện tại** làm ngữ cảnh, không gộp toàn bộ lịch sử.

### 5.2. Giới hạn tần suất API

- Gemini gói miễn phí giới hạn số yêu cầu/ngày theo từng mô hình.
- Groq (dùng làm judge) thường chạm giới hạn ngày khi chạy benchmark lớn.
- Giải pháp: **xoay vòng nhiều khóa API** ở mọi tầng gọi LLM; chạy mẫu nhỏ trước; khi cần đánh giá toàn bộ thì chuyển sang gói trả phí hoặc khóa production.

### 5.3. Trôi thông tin qua nhiều lớp

LLM có thể bỏ qua hoặc biến dạng tham số công cụ (ví dụ nhét tên sản phẩm đầy đủ vào trường tên dòng máy thay vì từ khóa ngữ nghĩa). Giải pháp:
- **Củng cố mô tả schema** cho từng trường: từ khóa, tên dòng máy, số lượng, cờ lấy chi tiết.
- Bổ sung **hướng dẫn kỹ năng (skill)** với ví dụ cụ thể cho từng loại câu hỏi.
- **Chuẩn hóa linh hoạt đối số** ngay trong tầng agent, sẵn sàng sửa các định dạng sai.

### 5.4. Các giải pháp đã áp dụng

- Rà soát lại đáp án chuẩn bằng cách chạy lời gọi công cụ kỳ vọng trên cơ sở dữ liệu thật.
- Điều chỉnh công thức chấm tham số **mềm mại hơn**: cho phép một số trường được suy ra từ trường khác, đối chiếu từ khóa theo ngữ nghĩa.
- Tạo mẫu hướng dẫn **tái sử dụng ngữ cảnh hội thoại nhiều lượt**.
- Xây dựng **2 baseline** (RAG cơ bản và một công cụ đơn giản) để định lượng giá trị của tool use và khả năng lập kế hoạch.

## 6. Kết luận và hướng phát triển

### 6.1. Các kết quả đã đạt được

- Bộ benchmark 20 mẫu/loại (260 mẫu gốc, 322 dòng đánh giá) được sinh và xác minh thành công, **322/322 khớp đáp án chuẩn**.
- Agent ReAct đầy đủ đạt điểm end-to-end khoảng **0.74–0.75** trên 240 mẫu; baseline hoàn hảo đạt ~1.0, chứng tỏ bộ benchmark và bộ đánh giá không còn lỗi nghiêm trọng.
- Baseline RAG cơ bản trên 10 mẫu thông số đơn lẻ chỉ đạt end-to-end ~0.22, độ chính xác câu trả lời ~0.65 và **độ chính xác tham số công cụ bằng 0** — minh chứng rõ giá trị của cơ chế gọi công cụ.
- Baseline một công cụ + một LLM hoạt động trên cùng bộ kiểm thử, cho phép so sánh trực tiếp.

### 6.2. Hạn chế còn tồn tại

- Agent vẫn yếu ở nhóm câu hỏi **nhiều lượt** (end-to-end ~0.51), **điều kiện OR kết hợp** (độ chính xác tham số ~0.44) và **câu hỏi tổng hợp** (~0.57).
- Bộ đo RAGAS đầy đủ bị chặn bởi hạn mức Gemini.
- Master Agent dạng ReAct phẳng chưa có nút định tuyến tự chọn kỹ năng; kỹ năng hiện được chọn theo từ khóa.

### 6.3. Hướng phát triển

- Thêm nút **lập kế hoạch (planner)** trước Master Agent để xử lý tốt các câu hỏi OR kết hợp, tổng hợp và nhiều lượt.
- Tinh chỉnh (fine-tune / prompt-tune) agent trên các lỗi có độ chính xác tham số công cụ thấp.
- Chuyển bộ đo RAGAS và judge sang API trả phí hoặc judge cục bộ để đánh giá toàn bộ benchmark.
- Tích hợp chọn kỹ năng **tự động theo ngữ cảnh** thay vì quy tắc từ khóa.

---

# Các usecase

## Usecase đơn
- Thông số sản phẩm: "ss s25 dùng chip gì"
- Thông số sản phẩm: "iPhone 15 dùng chip gì"
- Các dòng sản phẩm: "có các loại macbook nào"
- Các dòng sản phẩm + thông số: "macbook pro nào đáng mua"

## Usecase không rõ
- "4 sản phẩm dùng chip gì" → thiếu thông tin, agent nên hỏi lại.

## Usecase kết hợp nhiều điều kiện
- Top n với điều kiện: "cho tôi 5 laptop Acer dưới 20 triệu"
- Top n ghép điều kiện: "cho tôi 4 laptop Acer từ 20 đến 30 triệu"
- Top n theo dòng + thông số: "cho a 5 dòng mac air dưới 30 triệu, thông số từng dòng là gì"
- Top n theo dòng: "cho a 5 laptop macbook air dưới 20 triệu gồm những dòng nào"
- Top n dòng OR: "cho a 7 dòng laptop macbook air hoặc pro dưới 35 triệu"

## Usecase multi-turn

### Hội thoại 1
- "Cho a hỏi mk có laptop mỏng nhẹ pin trâu giá dưới 30 triệu k e, a đang cần tìm 1 con"
- "Cho a về 5 sản phẩm chip khủng trên 20 triệu và dưới 30 triệu đi e"
- "Cho a về 5 sản phẩm có card đồ họa khủng trên 20 triệu và dưới 30 triệu đi e"
- "Cho a hỏi nữa về mình có các loại macbook nào e nhỉ"
- "Giúp a so sánh giữa macbook pro và macbook air m5"
- "Giúp a so sánh giữa macbook pro và macbook air m5 và m4 thử e"
- "a đang tính tậu 1 con mac về để chạy ai local cho đỡ ngốn tiền, em tư vấn a con nào nhiều ram với"

### Hội thoại 2
- "Cho a hỏi mình có các dòng samsung s nào e nhỉ"
- "Cho a các mẫu dòng s dưới 30 triệu đi e"
- "cho a thông số của các dòng s25 và s26 đi e"
- "các dòng trên dùng con chip gì vậy"

## Usecase khó
- "Tôi mua máy tuần trước, đang dùng mã giảm giá sinh viên, muốn đổi sang bản RAM 32GB nhưng vẫn giữ ưu đãi, nếu hết hàng thì gợi ý giúp tôi sản phẩm tương đương"