from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self, settings, config):
        self.settings = settings
        self.config = config
        self._groq_client = None
        self._gemini_client = None
        self._gemini_keys = None
        self._groq_keys = None
        self._gemini_key_index = 0
        self._groq_key_index = 0

    def _get_groq_client(self):
        """Khởi tạo lười (Lazy) Groq client với key hiện tại trong router."""
        if self._groq_client is None:
            from groq import Groq
            keys = self._get_groq_keys()
            idx = getattr(self, "_groq_key_index", 0)
            key = keys[idx] if keys else self.settings.GROQ_API_KEY
            self._groq_client = Groq(api_key=key)
        return self._groq_client

    def _get_gemini_client(self):
        """Khởi tạo lười (Lazy) Gemini client với key hiện tại trong router."""
        if self._gemini_client is None:
            from google import genai
            keys = self._get_gemini_keys()
            idx = getattr(self, "_gemini_key_index", 0)
            key = keys[idx] if keys else self.settings.GEMINI_API_KEY
            self._gemini_client = genai.Client(api_key=key)
        return self._gemini_client

    # ------------------------------------------------------------------
    # Groq key router
    # ------------------------------------------------------------------
    def _get_groq_keys(self) -> List[str]:
        """Thu thập các Groq API Key từ settings (cache 1 lần)."""
        if self._groq_keys is not None:
            return self._groq_keys
        keys = []
        if hasattr(self.settings, "GROQ_API_KEYS") and isinstance(self.settings.GROQ_API_KEYS, list):
            keys.extend([k for k in self.settings.GROQ_API_KEYS if k])
        main_key = getattr(self.settings, "GROQ_API_KEY", None)
        if main_key and main_key not in keys:
            keys.append(main_key)
        for i in range(1, 20):
            k = getattr(self.settings, f"GROQ_API_KEY_{i}", None)
            if k and k not in keys:
                keys.append(k)
        self._groq_keys = keys
        return keys

    def _rotate_groq_key(self) -> tuple:
        """Xoay sang Groq API Key tiếp theo khi bị Rate Limit.
        Trả về (rotated, cycled)."""
        keys = self._get_groq_keys()
        if len(keys) <= 1:
            return False, False
        curr = self._groq_key_index
        nxt = (curr + 1) % len(keys)
        self._groq_key_index = nxt
        new_key = keys[nxt]
        self.settings.GROQ_API_KEY = new_key
        self._groq_client = None
        cycled = nxt <= curr
        print(f"   🔁 LLMService Groq key rotated to {nxt + 1}/{len(keys)}{' (full cycle)' if cycled else ''}.")
        return True, cycled

    def call_groq(self, model, messages: list, tools: list = None, max_retries: int = 3):
        import time

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

        cycles = 0
        prev_idx = self._groq_key_index
        attempt_non_rate = 0
        max_non_rate_retries = 3

        while True:
            client = self._get_groq_client()
            try:
                completion = client.chat.completions.create(**kwargs)
                return completion
            except Exception as e:
                err_str = str(e).lower()
                is_rate_limit = any(k in err_str for k in ["429", "rate limit", "quota", "too many requests", "rate_limit", "quotaexceeded"])
                is_retryable = any(k in err_str for k in ["500", "503", "internal", "unavailable", "temporarily unavailable", "high demand"])

                if is_rate_limit:
                    rotated, cycled = self._rotate_groq_key()
                    if rotated:
                        if cycled:
                            cycles += 1
                            if cycles >= max_retries:
                                raise RuntimeError(f"LLMService Groq failed after {cycles} full key cycles due to rate limit")
                            print(f"   ⏳ All Groq keys rate limit (cycle {cycles}/{max_retries}). Chờ 60s rồi retry...")
                            time.sleep(60)
                        continue
                    else:
                        cycles += 1
                        if cycles >= max_retries:
                            raise
                        print(f"   ⏳ Only one Groq key available. Rate limit (cycle {cycles}/{max_retries}). Chờ 60s rồi retry...")
                        time.sleep(60)
                        continue

                if is_retryable and attempt_non_rate < max_non_rate_retries:
                    attempt_non_rate += 1
                    print(f"   ⚠️ LLMService Groq retryable error, attempt {attempt_non_rate}/{max_non_rate_retries}: {str(e)[:120]}")
                    time.sleep(2 ** attempt_non_rate)
                    continue

                raise e

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

    # ------------------------------------------------------------------
    # Gemini key router
    # ------------------------------------------------------------------
    def _get_gemini_keys(self) -> List[str]:
        """Tự động thu thập các Gemini API Key từ settings (cache 1 lần)."""
        if self._gemini_keys is not None:
            return self._gemini_keys
        keys = []
        if hasattr(self.settings, "GEMINI_API_KEYS") and isinstance(self.settings.GEMINI_API_KEYS, list):
            keys.extend([k for k in self.settings.GEMINI_API_KEYS if k])

        # Quét các biến GEMINI_API_KEY, GEMINI_API_KEY_1, GEMINI_API_KEY_2...
        main_key = getattr(self.settings, "GEMINI_API_KEY", None)
        if main_key and main_key not in keys:
            keys.append(main_key)

        for i in range(1, 20):
            k = getattr(self.settings, f"GEMINI_API_KEY_{i}", None)
            if k and k not in keys:
                keys.append(k)
        self._gemini_keys = keys
        return keys

    def _rotate_gemini_key(self) -> tuple:
        """Xoay sang Gemini API Key tiếp theo khi bị Rate Limit.
        Trả về (rotated, cycled)."""
        keys = self._get_gemini_keys()
        if len(keys) <= 1:
            return False, False
        current_index = self._gemini_key_index
        next_index = (current_index + 1) % len(keys)
        self._gemini_key_index = next_index
        new_key = keys[next_index]
        self.settings.GEMINI_API_KEY = new_key
        from google import genai
        self._gemini_client = genai.Client(api_key=new_key)
        cycled = next_index <= current_index
        print(f"   🔁 LLMService Gemini key rotated to {next_index + 1}/{len(keys)}{' (full cycle)' if cycled else ''}.")
        return True, cycled

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
        cycles = 0
        prev_idx = self._gemini_key_index
        attempt_non_rate = 0
        max_non_rate_retries = 3

        while True:
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
                is_rate_limit = any(k in err_str for k in ["429", "resource_exhausted", "quota", "rate limit", "too many requests", "rate_limit", "quotaexceeded"])
                is_retryable = any(k in err_str for k in ["500", "503", "internal", "unavailable", "temporarily unavailable", "high demand"])

                if is_rate_limit:
                    rotated, cycled = self._rotate_gemini_key()
                    if rotated:
                        if cycled:
                            cycles += 1
                            if cycles >= max_retries:
                                raise RuntimeError(f"LLMService Gemini failed after {cycles} full key cycles due to rate limit")
                            print(f"   ⏳ All Gemini keys rate limit (cycle {cycles}/{max_retries}). Chờ 60s rồi retry...")
                            time.sleep(60)
                        continue
                    else:
                        cycles += 1
                        if cycles >= max_retries:
                            raise
                        print(f"   ⏳ Only one Gemini key available. Rate limit (cycle {cycles}/{max_retries}). Chờ 60s rồi retry...")
                        time.sleep(60)
                        continue

                if is_retryable and attempt_non_rate < max_non_rate_retries:
                    attempt_non_rate += 1
                    print(f"   ⚠️ LLMService Gemini retryable error, attempt {attempt_non_rate}/{max_non_rate_retries}: {str(e)[:120]}")
                    time.sleep(2 ** attempt_non_rate)
                    continue

                raise e
