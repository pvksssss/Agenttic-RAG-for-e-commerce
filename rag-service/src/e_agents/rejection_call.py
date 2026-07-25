import time
import json
from typing import List, Dict, Any, Optional

from configs.setting import settings
from configs.GetConfig import config
from src.LLMService import LLMService
from src.f_prompts import FULL_REJECTION_PROMPT


class RejectionCall:
    
    def __init__(self, llm_service: LLMService, config: Any):
        self.llm_service = llm_service
        self.config = config
        self.model = config.llm.google.available[2]

    def invoke(self, messages: Any) -> Dict[str, Any]:
        start_time = time.time()
        input_tokens = 0
        output_tokens = 0

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
        
        response = self.llm_service.call_gemini(
            model=self.model,
            messages=rejection_messages
        )
        
        raw_text = ""
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

        latency = time.time() - start_time
        
        return {
            "content": raw_text,
            "latency": latency,
            "tokens": {
                "input": input_tokens,
                "output": output_tokens
            }
        }