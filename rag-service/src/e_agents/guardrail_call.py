import time
import json
from typing import List, Dict, Any, Optional

from configs.setting import settings
from configs.GetConfig import config
from src.LLMService import LLMService
from src.f_prompts import FULL_SECURITY_PROMPT


class GuardrailCall:
    """
    GuardrailLLM - Phân loại an ninh siêu tốc (Plain Text Output).
    Mục tiêu: Trả về duy nhất 1 từ (safe / needs_ticket / attack) với độ trễ siêu thấp.
    """

    def __init__(self, llm_service: LLMService, config: Any):
        self.llm_service = llm_service
        self.config = config
        self.model = config.llm.google.available[2]
    
    def invoke(self, messages: str) -> Dict[str, Any]:
        """
        Thực thi kiểm tra an ninh trên tin nhắn user mới nhất.
        """
        start_time = time.time()
        input_tokens = 0
        output_tokens = 0

        # Đóng gói thành danh sách messages chuẩn kèm FULL_SECURITY_PROMPT
        security_messages = [
            {
                "role": "system",
                "content": FULL_SECURITY_PROMPT
            },
            {
                "role": "user",
                "content": messages
            }
        ]

        # 3. Gọi LLMService
        response = self.llm_service.call_gemini(
            model=self.model,
            messages=security_messages
        )
        
        raw_text = ""
        for chunk in response:
            if getattr(chunk, "usage_metadata", None):
                input_tokens = chunk.usage_metadata.prompt_token_count or 0
                output_tokens = chunk.usage_metadata.candidates_token_count or 0
            elif getattr(chunk, "usage", None):
                input_tokens = getattr(chunk.usage, "prompt_tokens", 0) or 0
                output_tokens = getattr(chunk.usage, "completion_tokens", 0) or 0

            # Text content (Gemini vs Groq/OpenAI)
            if hasattr(chunk, "text") and chunk.text:
                raw_text += chunk.text
            elif hasattr(chunk, "choices") and chunk.choices:
                delta = chunk.choices[0].delta
                content = getattr(delta, "content", None)
                if content:
                    raw_text += content

        latency = time.time() - start_time

        # 4. Trích xuất 1 từ phân loại (Plain Text: safe, needs_ticket, hoặc attack)
        clean_word = raw_text.strip().lower().replace('"', '').replace("'", "")
        
        if "attack" in clean_word:
            risk_level = "attack"
        elif "needs_ticket" in clean_word:
            risk_level = "needs_ticket"
        else:
            risk_level = "safe"

        return {
            "risk_level": risk_level,
            "latency": latency,
            "tokens": {
                "input": input_tokens,
                "output": output_tokens
            }
        }