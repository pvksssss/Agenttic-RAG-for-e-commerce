import time
import json
from typing import List, Dict, Any, Optional

from configs.setting import settings
from configs.GetConfig import config
from src.LLMService import LLMService
from src.f_prompts import FULL_MASTER_PROMPT


class MasterAgent:
    def __init__(self, llm_service: LLMService, config):
        self.llm_service = llm_service
        self.model = config.llm.google.available[0]

        # Danh sách tool cần authentication - chỉ cần tên tool
        # Thêm tool mới: chỉ append vào list, KHÔNG sửa logic invoke()
        self.AUTH_TOOLS = ["order_lookup", "cart_lookup", "wishlist_update"]

    def invoke(
        self,
        messages: List[Dict[str, Any]],
        available_tools: Dict[str, Any] = None,
        tools_schema: List[Dict[str, Any]] = None,
        auth_context: dict = None,
        skill: str = None
        ):
        """
        auth_context (dict, optional): Chứa thông tin xác thực để inject vào tools cần auth
            - user_id: UUID của user đã xác thực (verify từ JWT token)
            - user_token: JWT access token gốc (để tạo Supabase client với RLS)
        skill (str, optional): Nội dung skill markdown nối thêm vào system prompt.
        """

        # Inject skill as an extra system message (right after the first system prompt)
        if skill:
            messages = list(messages)
            insert_at = 0
            for i, m in enumerate(messages):
                if isinstance(m, dict) and m.get("role") == "system":
                    insert_at = i + 1
                    break
            messages.insert(insert_at, {"role": "system", "content": skill})

        start_time = time.time()
        first_token_time = None
        total_input_tokens = 0
        total_output_tokens = 0
        # Lưu lịch sử tool calls (args + output) để master_node inject vào lượt sau
        tool_context = []

        max_turns = config.agent.max_turns
        for turn in range(max_turns):
            turn_start_time = time.time()
            first_token_time = None
            turn_input_tokens = 0
            turn_output_tokens = 0

            # Gọi API Gemini với streaming — LUÔN True
            response_stream = self.llm_service.call_gemini(
                model=self.model,
                messages=messages,
                tools=tools_schema,
                stream=True
            )

            text_content = ""
            fn_accum = {}          # idx-part -> {"name","args","thought_signature"}
            fn_order = []
            is_tool_turn = None
            first_token_time = None

            # Parse STREAMING response: đọc từng chunk
            for chunk in response_stream:
                if first_token_time is None:
                    first_token_time = time.time() - turn_start_time

                if getattr(chunk, "usage_metadata", None):
                    if chunk.usage_metadata.prompt_token_count:
                        turn_input_tokens = chunk.usage_metadata.prompt_token_count
                    if chunk.usage_metadata.candidates_token_count:
                        turn_output_tokens = chunk.usage_metadata.candidates_token_count

                if not (chunk.candidates and chunk.candidates[0].content and chunk.candidates[0].content.parts):
                    continue

                parts = chunk.candidates[0].content.parts

                if is_tool_turn is None:
                    is_tool_turn = any(getattr(p, "function_call", None) for p in parts)

                for idx, p in enumerate(parts):
                    fc = getattr(p, "function_call", None)
                    sig = getattr(p, "thought_signature", None)

                    if fc and fc.name:
                        if idx not in fn_accum:
                            fn_accum[idx] = {"name": fc.name, "args": fc.args, "thought_signature": None}
                            fn_order.append(idx)
                        if sig:
                            fn_accum[idx]["thought_signature"] = sig
                    elif getattr(p, "text", None):
                        text_content += p.text
                    elif sig and fn_order:
                        # Signature "mồ côi" đến ở part riêng -> gán bù cho function_call gần nhất
                        last_idx = fn_order[-1]
                        if fn_accum[last_idx]["thought_signature"] is None:
                            fn_accum[last_idx]["thought_signature"] = sig

            # Build tool_calls_dict SAU KHI đã đọc hết stream của turn
            tool_calls_dict = {}
            for i, idx in enumerate(fn_order):
                v = fn_accum[idx]
                tool_calls_dict[i] = {
                    "id": f"call_gemini_{turn}_{i}",
                    "name": v["name"],
                    "arguments": json.dumps(v["args"]) if isinstance(v["args"], dict) else str(v["args"]),
                    "thought_signature": v["thought_signature"]
                }

            if first_token_time is None:
                first_token_time = time.time() - turn_start_time

            turn_elapsed = time.time() - turn_start_time
            total_input_tokens += turn_input_tokens
            total_output_tokens += turn_output_tokens

            # Format lại tool_calls thành cấu trúc chuẩn OpenAI để lưu history
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

            # Lưu message của assistant vào history
            agent_msg = {
                "role": "assistant",
                "content": text_content if text_content else None
            }
            if formatted_tool_calls:
                agent_msg["tool_calls"] = formatted_tool_calls

            messages.append(agent_msg)

            # Thực thi Tools nếu LLM yêu cầu
            if formatted_tool_calls:
                tool_start_time = time.time()

                for tc in formatted_tool_calls:
                    func_name = tc["function"]["name"]
                    func_args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}
                    func_args = self._sanitize_tool_args(func_name, func_args)

                    # Inject auth cho tool trong danh sách AUTH_TOOLS
                    if func_name in self.AUTH_TOOLS and auth_context:
                        func_args["current_user_id"] = auth_context.get("user_id")
                        func_args["user_token"] = auth_context.get("user_token")

                    if func_name in available_tools:
                        real_function = available_tools[func_name]
                        result = real_function(**func_args)

                        # Lưu lại args + output vào tool_context để truyền sang lượt sau
                        tool_context.append({
                            "tool": func_name,
                            "args": self._sanitize_tool_args(func_name, func_args),
                            "output": str(result),
                        })

                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "name": func_name,
                            "content": str(result)
                        })
                    else:
                        # Tool không tồn tại trong available_tools - bỏ qua
                        pass

                tool_elapsed = time.time() - tool_start_time

                # Nghỉ 1s trước khi sang lượt mới
                time.sleep(1)
                continue
            else:
                total_elapsed = time.time() - start_time

                return {
                    "content": text_content if text_content else None,
                    "tool_context": tool_context,
                    "latency": total_elapsed,
                    "tokens": {
                        "input": total_input_tokens,
                        "output": total_output_tokens,
                    }
                }

    # ==================================================================
    # HELPER: Chuẩn hóa tool args từ LLM (tách riêng để invoke() dễ đọc)
    # ==================================================================
    def _sanitize_tool_args(self, name, args):
        """Chuẩn hóa và chỉ giữ các key hợp lệ trong tool args để debug/dùng lại."""

        def _try_parse_object_string(s):
            """Thử parse chuỗi dạng { ... } thành dict. Không bắt buộc PyYAML."""
            if not isinstance(s, str):
                return None
            s = s.strip()
            if len(s) < 2 or not (s[0] == '{' and s[-1] == '}'):
                return None
            # 1. JSON chuẩn
            try:
                import json
                parsed = json.loads(s)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass
            # 2. YAML nếu có
            try:
                import yaml
                parsed = yaml.safe_load(s)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass
            # 3. Fallback: thêm dấu ngoặc kép cho key không có dấu ngoặc, rồi json.loads
            try:
                import json
                import re as _re
                normalized = _re.sub(r'([a-zA-Z_]\w*)\s*:', r'"\1":', s)
                parsed = json.loads(normalized)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass
            return None

        # ====================================================================================================================

        if name == "product_search":
            allowed_query_keys = {"keyword", "brand", "category", "min_price", "max_price", "name_contains", "mode", "limit", "include_details", "need_price_info"}

            # Args top-level có thể là string object, list queries, hoặc dict
            if isinstance(args, str):
                parsed = _try_parse_object_string(args)
                if isinstance(parsed, dict):
                    args = parsed
                else:
                    args = {"queries": [args]}
            elif isinstance(args, list):
                args = {"queries": args}
            elif not isinstance(args, dict):
                args = {}

            # Giá trị mặc định từ top-level (để merge vào các query thiếu)
            top_defaults = {k: args[k] for k in allowed_query_keys if k in args}
            top_limit = args.get("limit")
            default_limit = top_limit if top_limit is not None else 3

            # Nếu LLM gọi dạng flat (không có queries, keyword ở top-level) hoặc dùng 'query'
            if "queries" not in args:
                if "query" in args:
                    args = {"queries": [args["query"]]}
                elif "keyword" in args:
                    args = {"queries": [top_defaults]}
                else:
                    args = {"queries": []}

            queries = args.get("queries") or []
            if isinstance(queries, str):
                queries = [queries]

            clean_queries = []
            if isinstance(queries, list):
                for q in queries:
                    # Nếu q là string object, parse trước
                    if isinstance(q, str):
                        parsed_q = _try_parse_object_string(q)
                        if isinstance(parsed_q, dict):
                            q = parsed_q
                        else:
                            q = {"keyword": q}

                    if isinstance(q, dict):
                        # Nếu keyword là object-string (model copy JSON vào keyword), parse và merge
                        merged = top_defaults.copy()
                        kw = q.get("keyword")
                        parsed_kw = _try_parse_object_string(kw) if isinstance(kw, str) else None
                        if isinstance(parsed_kw, dict):
                            merged.update(parsed_kw)
                            for k, v in q.items():
                                if k != "keyword":
                                    merged[k] = v
                        else:
                            merged.update(q)

                        if not merged.get("keyword"):
                            merged["keyword"] = f"{merged.get('brand','')} {merged.get('category','')}".strip() or "sản phẩm"

                        # Tránh name_contains quá ngắn/gây nhiễu (vd chỉ 'S')
                        nc = merged.get("name_contains")
                        if nc is not None and len(str(nc).strip()) <= 2:
                            merged["name_contains"] = merged.get("keyword")

                        if "limit" not in merged or merged.get("limit") is None:
                            if merged.get("mode") == "lines":
                                merged["limit"] = 30
                            else:
                                merged["limit"] = default_limit
                        clean = {k: v for k, v in merged.items() if k in allowed_query_keys}
                        clean_queries.append(clean)

            result = {"queries": clean_queries}
            if top_limit is not None:
                result["limit"] = top_limit
            return result

        if name == "product_compare":
            if not isinstance(args, dict):
                args = {}
            product_names = args.get("product_names") or args.get("products") or args.get("product_name")
            if isinstance(product_names, str):
                product_names = [product_names]
            if not isinstance(product_names, list):
                product_names = []
            return {"product_names": [p for p in product_names if isinstance(p, str)]}

        if name == "policy_search":
            if not isinstance(args, dict):
                args = {}
            return {k: v for k, v in args.items() if k in {"key_word", "limit"}}

        if name == "order_lookup":
            if not isinstance(args, dict):
                args = {}
            return {k: v for k, v in args.items() if k in {"order_id"}}

        return args if isinstance(args, dict) else {}