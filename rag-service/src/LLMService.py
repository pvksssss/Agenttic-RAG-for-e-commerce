from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self, settings, config):
        self.settings = settings
        self.config = config
        self._groq_client = None
        self._gemini_client = None

    def _get_groq_client(self):
        """Khởi tạo lười (Lazy) Groq client và giữ kết nối socket bền vững."""
        if self._groq_client is None:
            from groq import Groq
            self._groq_client = Groq(api_key=self.settings.GROQ_API_KEY)
        return self._groq_client

    def _get_gemini_client(self):
        """Khởi tạo lười (Lazy) Gemini client và giữ kết nối socket bền vững."""
        if self._gemini_client is None:
            from google import genai
            self._gemini_client = genai.Client(api_key=self.settings.GEMINI_API_KEY)
        return self._gemini_client

    def call_groq(self, model, messages: list, tools: list = None):
        client = self._get_groq_client()

        kwargs = {
            "model": model,
            "messages": messages,
            "temperature": self.config.generation.temperature,
            "max_completion_tokens": self.config.generation.max_tokens,
            "top_p": self.config.generation.top_p,
            "reasoning_effort": self.config.llm.groq.reasoning_effort,
            "stream": self.config.generation.stream,
            "stop": self.config.generation.stop
        }

        if tools:
            formatted_tools = []
            for tool in tools:
                if "type" not in tool:
                    formatted_tools.append({
                        "type": "function",
                        "function": tool
                    })
                else:
                    formatted_tools.append(tool)
            kwargs["tools"] = formatted_tools

        completion = client.chat.completions.create(**kwargs)
        return completion

    @staticmethod
    def _normalize_msg(msg) -> dict:
        """Chuẩn hóa cả Python dict và LangChain Message Object (HumanMessage, AIMessage...)."""
        if isinstance(msg, dict):
            return msg
        # LangChain Object: type = "human" | "ai" | "system" | "tool"
        role_map = {"human": "user", "ai": "assistant", "system": "system", "tool": "tool"}
        return {
            "role": role_map.get(getattr(msg, "type", ""), getattr(msg, "type", "")),
            "content": getattr(msg, "content", ""),
            "name": getattr(msg, "name", None),
            "tool_calls": getattr(msg, "tool_calls", None),
            "tool_call_id": getattr(msg, "tool_call_id", None),
        }

    def _extract_system_instruction(self, messages: list) -> Optional[str]:
        system_messages = [
            self._normalize_msg(m)["content"]
            for m in messages
            if self._normalize_msg(m).get("role") == "system"
            and self._normalize_msg(m).get("content")
        ]
        return "\n".join(system_messages) if system_messages else None

    def _to_gemini_contents(self, messages: list):
        """
        Convert lịch sử hội thoại chuẩn OpenAI (dùng chung cho Groq và Gemini)
        sang list[types.Content] cho Gemini, GIỮ NGUYÊN cả tool_calls và tool results
        - khắc phục triệt để bug lặp vô hạn.
        """
        import json
        from google.genai import types

        contents = []
        for raw in messages:
            msg = self._normalize_msg(raw)
            role = msg.get("role")

            if role == "system":
                continue

            if role == "user":
                text = msg.get("content")
                if not text:
                    continue
                contents.append(types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=text)],
                ))

            elif role == "assistant":
                parts = []
                text = msg.get("content")
                if text:
                    parts.append(types.Part.from_text(text=text))

                # Đọc đầy đủ các yêu cầu gọi tool của assistant
                for tc in (msg.get("tool_calls") or []):
                    fn = tc.get("function", {})
                    raw_args = fn.get("arguments", "{}")
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    part = types.Part.from_function_call(
                        name=fn.get("name"),
                        args=args,
                    )
                    # Giữ nguyên thought_signature nếu có (bắt buộc đối với các model Gemini 3.x/Thinking)
                    sig = tc.get("thought_signature") or fn.get("thought_signature")
                    if sig:
                        part.thought_signature = sig
                    parts.append(part)

                if not parts:
                    continue

                contents.append(types.Content(role="model", parts=parts))

            elif role == "tool":
                part = types.Part.from_function_response(
                    name=msg.get("name"),
                    response={"result": msg.get("content", "")},
                )
                # Trong Gemini SDK, FunctionResponse bắt buộc phải mang role="user"!
                # Nếu Content liền trước cũng chứa function_response (gọi song song), gộp part vào đó.
                if contents and contents[-1].role == "user" and contents[-1].parts and hasattr(contents[-1].parts[0], "function_response"):
                    contents[-1].parts.append(part)
                else:
                    contents.append(types.Content(role="user", parts=[part]))

            else:
                continue

        return contents

    def _map_thinking_level(self, reasoning_effort: Optional[str]) -> str:
        mapping = {
            "none":    "NONE",
            "default": "MINIMAL",
            "low":     "LOW",
            "medium":  "MEDIUM",
            "high":    "HIGH",
        }
        raw = (reasoning_effort or "default").strip().lower()
        return mapping.get(raw, "MINIMAL")

    def _get_gemini_keys(self) -> List[str]:
        """Tự động thu thập các Gemini API Key từ settings."""
        keys = []
        if hasattr(self.settings, "GEMINI_API_KEYS") and isinstance(self.settings.GEMINI_API_KEYS, list):
            keys.extend([k for k in self.settings.GEMINI_API_KEYS if k])
        
        # Quét các biến GEMINI_API_KEY, GEMINI_API_KEY_1, GEMINI_API_KEY_2...
        main_key = getattr(self.settings, "GEMINI_API_KEY", None)
        if main_key and main_key not in keys:
            keys.append(main_key)
            
        for i in range(1, 10):
            k = getattr(self.settings, f"GEMINI_API_KEY_{i}", None)
            if k and k not in keys:
                keys.append(k)
        return keys

    def _rotate_gemini_key(self) -> bool:
        """Xoay sang Gemini API Key tiếp theo trong danh sách khi bị Rate Limit."""
        keys = self._get_gemini_keys()
        if len(keys) > 1:
            current_index = getattr(self, "_gemini_key_index", 0)
            next_index = (current_index + 1) % len(keys)
            self._gemini_key_index = next_index
            new_key = keys[next_index]
            self.settings.GEMINI_API_KEY = new_key
            from google import genai
            self._gemini_client = genai.Client(api_key=new_key)
            logger.warning(f"[LLMService Router] Rate limit! Rotated Gemini Key to {next_index + 1}/{len(keys)}")
            return True
        return False

    def call_gemini(self, model, messages: list, tools: list = None, stream: bool = None, max_retries: int = 3):
        import time
        from google.genai import types

        contents = self._to_gemini_contents(messages)
        system_instruction = self._extract_system_instruction(messages)

        generate_content_config = types.GenerateContentConfig(
            temperature=self.config.generation.temperature,
            max_output_tokens=self.config.generation.max_tokens,
            top_p=self.config.generation.top_p,
            thinking_config=types.ThinkingConfig(
                thinking_level=self._map_thinking_level(self.config.llm.google.reasoning_effort)
            ),
        )

        if tools:
            gemini_function_declarations = []
            for t in tools:
                if isinstance(t, dict) and "function" in t and "type" in t:
                    gemini_function_declarations.append(t["function"])
                else:
                    gemini_function_declarations.append(t)
            generate_content_config.tools = [types.Tool(function_declarations=gemini_function_declarations)]

        if system_instruction:
            generate_content_config.system_instruction = system_instruction

        use_stream = stream if stream is not None else self.config.generation.stream
        keys = self._get_gemini_keys()
        effective_retries = max(max_retries, len(keys)) if keys else max_retries

        for attempt in range(effective_retries):
            try:
                client = self._get_gemini_client()
                if use_stream:
                    return client.models.generate_content_stream(
                        model=model,
                        contents=contents,
                        config=generate_content_config,
                    )
                return client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=generate_content_config,
                )
            except Exception as e:
                err_str = str(e).lower()
                is_rate_limit = any(k in err_str for k in ["429", "500", "503", "internal", "unavailable", "resource_exhausted", "quota", "rate limit", "too many requests", "high demand"])
                if is_rate_limit:
                    rotated = self._rotate_gemini_key()
                    if rotated:
                        # 🔑 Đã xoay sang Key mới thành công -> Cho phép thử ngay với Key mới!
                        continue
                    else:
                        logger.warning(f"[LLMService Router] Rate limit hit. Waiting 15s before retry (attempt {attempt + 1}/{effective_retries})...")
                        time.sleep(15)
                    if attempt < effective_retries - 1:
                        continue
                raise e