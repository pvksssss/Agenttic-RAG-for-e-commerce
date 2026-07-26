import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Thư mục gốc của RAG service (rag-service/) nơi chứa file .env
BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    # 1. FastAPI Config
    PORT: int = 8080
    HOST: str = "0.0.0.0"
    DEBUG: bool = True

    # 2. Supabase Connection
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_ANON_KEY: str = ""  # Public key - dùng cho verify token (quyền hạn thấp)
    SUPABASE_JWT_SECRET: str = ""  # Sử dụng để giải mã JWT Token của Supabase offline

    # 3. LLM API Keys
    GEMINI_API_KEY: str = ""
    GEMINI_API_KEY_2: str = ""
    GEMINI_API_KEY_3: str = ""
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # 4. Vector Database Config
    VECTOR_DB_DIR: str = "../database/chroma_db"
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8000

    @property
    def vector_db_absolute_path(self) -> str:
        """Tự động phân giải đường dẫn tương đối thành tuyệt đối dựa trên BASE_DIR (rag-service/)"""
        p = Path(self.VECTOR_DB_DIR)
        if p.is_absolute():
            return str(p)
        return str((BASE_DIR / p).resolve())

    # Đọc cấu hình từ file .env nằm ở thư mục gốc của rag-service/
    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env"),
        env_file_encoding="utf-8",
        extra="ignore"  # Bỏ qua các biến môi trường thừa khác trên hệ thống
    )

# Khởi tạo instance settings toàn cục
settings = Settings()
