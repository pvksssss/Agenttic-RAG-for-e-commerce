import time
import json
from typing import List, Dict, Any, Optional

from configs.setting import settings
from configs.GetConfig import config
from src.LLMService import LLMService
from src.f_prompts import FULL_REJECTION_PROMPT


class RejectionCall:
    """
    Agent xử lý từ chối yêu cầu không an toàn hoặc vi phạm chính sách (Guardrail Rejection Node).
    Nhiệm vụ: Lịch sự từ chối các câu hỏi vi phạm an toàn, prompt injection, hoặc yêu cầu nằm ngoài phạm vi hỗ trợ của hệ thống e-commerce.
    """
    
    def __init__(self, llm_service: LLMService, config: Any):
        """Khởi tạo RejectionCall Agent với LLMService và cấu hình hệ thống."""
        self.llm_service = llm_service
        self.config = config
        # Lựa chọn mô hình mặc định từ cấu hình Google Gemini (gemma-4-26b-a4b-it)
        self.model = config.llm.google.available[2]

    def invoke(self, messages: Any) -> Dict[str, Any]:
        """
        Thực thi tạo câu phản hồi từ chối lịch sự dựa trên prompt từ chối chuẩn (FULL_REJECTION_PROMPT).
        
        Args:
            messages: Thông điệp yêu cầu người dùng hoặc ngữ cảnh câu hỏi vi phạm.
            
        Returns:
            Dict[str, Any]: Kết quả chứa nội dung phản hồi (content), độ trễ (latency), và lượng token tiêu thụ.
        """
        start_time = time.time()
        input_tokens = 0
        output_tokens = 0

        # Xây dựng danh sách tin nhắn gửi tới LLM với Prompt từ chối hệ thống
        rejection_messages = [
            {
                "role": "system",
                "content": FULL_REJECTION_PROMPT
            },
            {
                "role": "user",
                "content": messages
            }
        ]
        
        # Gọi Gemini LLM thông qua dịch vụ LLMService
        response = self.llm_service.call_gemini(
            model=self.model,
            messages=rejection_messages
        )
        
        raw_text = ""
        # Đọc từng chunk phản hồi phát trực tuyến (streaming response) và thống kê token
        for chunk in response:
            if getattr(chunk, "usage_metadata", None):
                input_tokens = chunk.usage_metadata.prompt_token_count or 0
                output_tokens = chunk.usage_metadata.candidates_token_count or 0
            elif getattr(chunk, "usage", None):
                input_tokens = getattr(chunk.usage, "prompt_tokens", 0) or 0
                output_tokens = getattr(chunk.usage, "completion_tokens", 0) or 0

            if hasattr(chunk, "text") and chunk.text:
                raw_text += chunk.text
            elif hasattr(chunk, "choices") and chunk.choices:
                delta = chunk.choices[0].delta
                content = getattr(delta, "content", None)
                if content:
                    raw_text += content

        # Tính tổng thời gian thực thi (latency)
        latency = time.time() - start_time
        
        # Trả về kết quả chuẩn hóa dạng dictionary
        return {
            "content": raw_text,
            "latency": latency,
            "tokens": {
                "input": input_tokens,
                "output": output_tokens
            }
        }