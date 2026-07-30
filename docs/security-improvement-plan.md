# Kế Hoạch Cải Thiện Bảo Mật - User Authentication

## Phân Tích Hiện Tại

### Flow Lấy User_ID
```
Frontend (Next.js)
    ↓ gửi user_token (Supabase JWT) qua body
FastAPI /chat endpoint (main.py)
    ↓ request.user_token
verify_supabase_jwt() (security.py)
    ↓ supabase_client.auth.get_user(token)
Supabase Auth API
    ↓ trả về user object
user_id
    ↓ truyền cho tools
Tools query dữ liệu theo user_id
```

### Vấn Đề Bảo Mật

| Vấn đề | Mức độ | Chi tiết |
|--------|--------|----------|
| **Service Role Key dùng cho verify** | 🔴 Cao | Admin key bypass RLS, nếu leak → toàn quyền DB |
| **Token gửi qua body** | 🟡 Trung | Thường nên gửi qua header `Authorization: Bearer <token>` |
| **Không cache verify result** | 🟡 Trung | Mỗi request gọi API Supabase → chậm, tốn tiền |
| **Không rate limiting** | 🟡 Trung | Có thể DoS bằng verify spam |
| **Không input validation** | 🟢 Thấp | Token format không validate trước khi gọi API |
| **Guest access không rõ ràng** | 🟢 Thấp | Không document guest có thể làm gì |

---

## Kế Hoạch Cải Thiện

### Phase 1: Cơ Bản (Ưu tiên cao)

#### 1.1 Tách Supabase Client
**File:** `configs/setting.py`
```python
# 2. Supabase Connection
SUPABASE_URL: str
SUPABASE_SERVICE_ROLE_KEY: str  # Admin key - chỉ dùng cho backend operations
SUPABASE_ANON_KEY: str  # Public key - dùng cho verify token (quyền hạn thấp)
SUPABASE_JWT_SECRET: str = ""
```

**File:** `app/core/security.py`
```python
# Client cho verify token (dùng ANON KEY - quyền hạn thấp)
supabase_anon_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

# Client cho admin operations (dùng SERVICE ROLE KEY - quyền admin)
supabase_admin_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
```

**Lợi ích:**
- Verify token dùng ANON KEY (quyền thấp, an toàn hơn)
- Admin operations dùng Service Key (chọn nơi dùng)
- Nếu ANON KEY leak → chỉ có thể verify token, không bypass RLS

#### 1.2 Thêm JWT Format Validation
**File:** `app/core/security.py`
```python
def verify_supabase_jwt(token: str) -> Optional[str]:
    if not token:
        return None
    
    # Remove "Bearer " prefix if present
    if token.startswith("Bearer "):
        token = token[7:]
    
    # Basic validation: JWT format (3 parts separated by dots)
    if len(token.split('.')) != 3:
        return None
    
    # ... rest of code
```

**Lợi ích:**
- Tránh gọi API với invalid input
- Giảm load cho Supabase API

#### 1.3 Token qua Authorization Header
**File:** `app/main.py`
```python
from fastapi import FastAPI, HTTPException, Header

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    # Xóa user_token

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest, authorization: Optional[str] = Header(None)):
    user_id = None
    if authorization:
        user_id = verify_supabase_jwt(authorization)
```

**Lợi ích:**
- Chuẩn HTTP authentication
- Dễ dàng tích hợp với các auth middleware khác
- Frontend: `headers: { "Authorization": "Bearer <token>" }`

---

### Phase 2: Tối Ưu (Ưu tiên trung)

#### 2.1 Token Cache (TTL 5 phút)
**File:** `app/core/security.py`
```python
import time

_token_cache = {}
CACHE_TTL = 300  # 5 phút

def verify_supabase_jwt(token: str) -> Optional[str]:
    # Check cache first
    current_time = time.time()
    if token in _token_cache:
        cached_data = _token_cache[token]
        if current_time - cached_data["timestamp"] < CACHE_TTL:
            return cached_data["user_id"]
        else:
            del _token_cache[token]
    
    # ... call Supabase API
    
    # Cache kết quả
    _token_cache[token] = {
        "user_id": user_id,
        "timestamp": current_time
    }
    return user_id
```

**Lợi ích:**
- Giảm API calls đến Supabase (~90% cho active users)
- Tăng tốc độ response
- Tiết kiệm tiền (Supabase charge theo API calls)

#### 2.2 Rate Limiting
**File:** `app/main.py`
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/chat", response_model=ChatResponse)
@limiter.limit("10/minute")  # 10 requests/phút
async def chat_endpoint(request: ChatRequest, authorization: Optional[str] = Header(None)):
    # ...
```

**Lợi ích:**
- Ngăn chặn DoS attack
- Giảm load cho Supabase API

---

### Phase 3: Nâng Cao (Ưu tiên thấp)

#### 3.1 Document Guest Access Policy
**File:** `docs/security-policy.md`
```markdown
## Guest Access Policy
- Guest users (không có token) có thể:
  - Tư vấn sản phẩm công khai
  - So sánh thông số sản phẩm
- Guest users KHÔNG thể:
  - Tra cứu đơn hàng cá nhân
  - Xem lịch sử mua hàng
  - Thực hiện các operations cần user_id
```

#### 3.2 Log Failed Verify Attempts
**File:** `app/core/security.py`
```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def verify_supabase_jwt(token: str) -> Optional[str]:
    # ...
    except Exception as e:
        logger.warning(f"Failed verify attempt: {str(e)}")
        return None
```

**Lợi ích:**
- Monitor suspicious activity
- Detect brute force attacks

---

## Cấu Hình .env

Cần thêm:
```bash
SUPABASE_ANON_KEY=your_anon_key_here
```

Lấy từ Supabase Dashboard → Project Settings → API

---

## Frontend Changes

### Thay đổi cách gửi token
```javascript
// Cũ (body)
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    message: "...",
    user_token: supabaseToken
  })
})

// Mới (header)
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabaseToken}`
  },
  body: JSON.stringify({
    message: "..."
  })
})
```

---

## Checklist Implement

- [ ] Phase 1.1: Tách Supabase Client (settings.py + security.py)
- [ ] Phase 1.2: Thêm JWT validation (security.py)
- [ ] Phase 1.3: Token qua Authorization header (main.py)
- [ ] Phase 2.1: Token cache (security.py)
- [ ] Phase 2.2: Rate limiting (main.py)
- [ ] Phase 3.1: Document guest policy (docs/)
- [ ] Phase 3.2: Log failed attempts (security.py)
- [ ] Cấu hình .env (thêm SUPABASE_ANON_KEY)
- [ ] Frontend update (Authorization header)

---

## Testing Checklist

- [ ] Test với valid token → lấy được user_id
- [ ] Test với invalid token → trả về None (guest)
- [ ] Test với malformed token → trả về None (không gọi API)
- [ ] Test cache → lần 2 không gọi API
- [ ] Test rate limit → vượt 10 req/phút → 429 error
- [ ] Test guest access → không thể truy cập user data
