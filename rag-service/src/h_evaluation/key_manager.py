"""
Quản lý và xoay vòng API key cho Gemini, OpenRouter, Groq.
Hỗ trợ chạy benchmark/tạo dataset khi dùng nhiều key free tier.
"""
import os
import time
from typing import List, Optional


class RotatingKeyManager:
    """Base class quản lý danh sách API key, xoay vòng khi gặp lỗi."""

    def __init__(self, keys: List[str]):
        # Lọc bỏ placeholder/rỗng, giữ thứ tự và loại trùng
        seen = set()
        clean = []
        for k in keys:
            if k and k not in seen and not k.lower().startswith("your-"):
                clean.append(k)
                seen.add(k)
        self.keys = clean
        if not self.keys:
            raise ValueError(f"{self.__class__.__name__}: không có API key hợp lệ.")
        self._index = 0
        self._retry_counts = {i: 0 for i in range(len(self.keys))}

    @property
    def current_key(self) -> str:
        return self.keys[self._index]

    @property
    def current_index(self) -> int:
        return self._index

    def rotate(self) -> str:
        """Chuyển sang key tiếp theo. Trả về key mới."""
        self._index = (self._index + 1) % len(self.keys)
        print(f"🔄 Xoay sang key {self._index + 1}/{len(self.keys)}")
        return self.current_key

    def __len__(self):
        return len(self.keys)


class GeminiKeyManager(RotatingKeyManager):
    """Quản lý nhiều Gemini API key."""

    def create_client(self):
        """Tạo google.genai.Client từ key hiện tại."""
        from google import genai
        return genai.Client(api_key=self.current_key)


class OpenRouterKeyManager(RotatingKeyManager):
    """Quản lý nhiều OpenRouter API key."""

    def create_client(self):
        """Tạo OpenAI client trỏ tới OpenRouter."""
        from openai import OpenAI
        return OpenAI(
            api_key=self.current_key,
            base_url="https://openrouter.ai/api/v1",
        )


class GroqKeyManager(RotatingKeyManager):
    """Quản lý nhiều Groq API key (qua OpenAI-compatible endpoint)."""

    def create_client(self):
        from openai import OpenAI
        return OpenAI(
            api_key=self.current_key,
            base_url="https://api.groq.com/openai/v1",
        )


def load_keys_from_settings(settings, prefix: str) -> List[str]:
    """
    Đọc key từ settings theo thứ tự ưu tiên:
      1. <PREFIX>_API_KEY (key chính)
      2. <PREFIX>_API_KEYS (comma-separated)
      3. <PREFIX>_API_KEY_2, <PREFIX>_API_KEY_3, ... (nếu settings cho phép)
    """
    keys = []
    main_key = getattr(settings, f"{prefix}_API_KEY", "")
    if main_key and "your-" not in main_key.lower():
        keys.append(main_key)

    multi_key = getattr(settings, f"{prefix}_API_KEYS", "")
    if multi_key:
        for k in multi_key.split(","):
            k = k.strip()
            if k and k not in keys and "your-" not in k.lower():
                keys.append(k)

    # Hỗ trợ GEMINI_API_KEY_2, OPENROUTER_API_KEY_2, ... từ env nếu pydantic extra='allow'
    for i in range(2, 10):
        extra_key = getattr(settings, f"{prefix}_API_KEY_{i}", "")
        if extra_key and extra_key not in keys and "your-" not in extra_key.lower():
            keys.append(extra_key)

    return keys
