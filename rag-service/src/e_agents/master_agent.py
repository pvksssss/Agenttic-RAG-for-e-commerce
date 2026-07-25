import time
import json
from typing import List, Dict, Any, Optional

from configs.setting import settings
from configs.GetConfig import config
from src.LLMService import LLMService
from src.f_prompts import FULL_MASTER_PROMPT


class MasterAgent:
    """
    MasterAgent - Nút thực thi AI Agent chính trong hệ thống Agentic RAG.
    Được thiết kế theo chuẩn Single-Turn Node cho LangGraph:
    - Nhận vào danh sách messages + tools_schema nạp động.
    - Thực thi 1 lượt suy luận với LLM (Streaming & Token measurement).
    - Trả về kết quả văn bản, danh sách tool_calls yêu cầu và các chỉ số Latency/Tokens.
    """

    def __init__(self, llm_service: LLMService, config: Any):
        self.llm_service = llm_service
        self.config = config
        self.model = config.llm.google.available[0]

    def invoke(
        self, 
        messages: List[Dict[str, Any]],
        available_tools: Dict[str, Any] = None,
        tools_schema: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Thực thi 1 lượt suy luận của Master Agent.
        
        Args:
            messages: Lịch sử hội thoại dạng List[Dict] chuẩn OpenAI/LangGraph.
            available_tools: Từ điển các hàm Python thực thi thật (Dùng khi chạy standalone).
            tools_schema: Danh sách JSON Schema mô tả Tool cấp cho LLM lượt này.
            
        Returns:
            Dict chứa content, tool_calls, latency, ttft và token metrics.
        """
        start_time = time.time()
        first_token_time = None
        input_tokens = 0
        output_tokens = 0

        # 1. Gọi API LLM qua LLMService với streaming
        response = self.llm_service.call_gemini(
            model=self.model,
            messages=messages,
            tools=tools_schema
        )

        text_content = ""
        tool_calls_dict = {}

        # 2. Vòng lặp duyệt Stream chunks
        for chunk in response:
            # A. Trích xuất Token Usage từ chunk cuối
            if getattr(chunk, "usage_metadata", None):
                input_tokens = chunk.usage_metadata.prompt_token_count or 0
                output_tokens = chunk.usage_metadata.candidates_token_count or 0

            # B. Đấm giờ TTFT (Time to First Token)
            if first_token_time is None and (chunk.text or chunk.function_calls):
                first_token_time = time.time() - start_time

            # C. Tích lũy nội dung văn bản
            if chunk.text:
                text_content += chunk.text

            # D. Tích lũy các yêu cầu gọi Tool (kèm thought_signature nếu có)
            if chunk.function_calls:
                for idx, call in enumerate(chunk.function_calls):
                    sig = None
                    if chunk.candidates and chunk.candidates[0].content and chunk.candidates[0].content.parts:
                        for p in chunk.candidates[0].content.parts:
                            if getattr(p, 'function_call', None) and getattr(p, 'thought_signature', None):
                                sig = p.thought_signature

                    tool_calls_dict[idx] = {
                        "id": f"call_gemini_{idx}",
                        "name": call.name,
                        "arguments": json.dumps(call.args) if isinstance(call.args, dict) else str(call.args),
                        "thought_signature": sig
                    }

        latency = time.time() - start_time

        # 3. Định dạng lại tool_calls theo chuẩn OpenAI / LangGraph
        formatted_tool_calls = []
        for idx, tc in tool_calls_dict.items():
            item = {
                "id": tc["id"],
                "type": "function",
                "function": {
                    "name": tc["name"],
                    "arguments": tc["arguments"]
                }
            }
            if tc.get("thought_signature"):
                item["thought_signature"] = tc["thought_signature"]
            formatted_tool_calls.append(item)

        # 4. Trả về kết quả cho Nút Graph điều phối tiếp
        return {
            "content": text_content if text_content else None,
            "tool_calls": formatted_tool_calls,
            "has_tool_calls": bool(formatted_tool_calls),
            "latency": latency,
            "ttft": first_token_time or latency,
            "tokens": {
                "input": input_tokens,
                "output": output_tokens,
                "total": input_tokens + output_tokens
            }
        }
    