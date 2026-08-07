"""
BenchmarkEvaluator — service đánh giá agentic RAG e-commerce.

Dùng trong notebook workflow:
    from src.h_evaluation.benchmark_evaluator import BenchmarkEvaluator
    evaluator = BenchmarkEvaluator(llm_service=llm_service)
    report = evaluator.run_and_evaluate(app, 'ecommerce_benchmark_20each.jsonl', output_dir='benchmark_results', max_samples=10)
"""
import json
import os
import re
import time
import uuid
import warnings
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd
from datasets import Dataset
from tqdm.auto import tqdm

from langchain_openai import ChatOpenAI
from langchain_community.embeddings import HuggingFaceEmbeddings

try:
    from ragas.run_config import RunConfig
except Exception:
    RunConfig = None

# Wrapper để dùng LLMService (có xoay key Gemini/Groq) làm LLM cho RAGAS
from langchain_core.language_models.chat_models import SimpleChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult


class LLMServiceChatModel(SimpleChatModel):
    """LangChain chat model bridge qua LLMService, giữ router xoay key cho RAGAS."""

    llm_service: Any = None
    model_name: str = "gemini-3.5-flash-lite"
    temperature: float = 0.0

    @property
    def _llm_type(self) -> str:
        return "llm_service_chat"

    @property
    def _identifying_params(self) -> Dict[str, Any]:
        return {"model": self.model_name}

    def _call(
        self,
        messages: List[Any],
        stop: Optional[List[str]] = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> str:
        if not self.llm_service:
            raise ValueError("LLMServiceChatModel cần llm_service")
        response = self.llm_service.call_gemini(
            model=self.model_name,
            messages=messages,
            tools=None,
            stream=False,
            max_retries=3,
        )
        text = ""
        for chunk in response:
            if getattr(chunk, "text", None):
                text += chunk.text
            elif getattr(chunk, "candidates", None):
                for cand in chunk.candidates:
                    content = getattr(cand, "content", None)
                    parts = getattr(content, "parts", None) if content else None
                    if parts:
                        for part in parts:
                            text += getattr(part, "text", "") or ""
        return text


# Lazy import ragas để tránh lỗi khi môi trường thiếu dependency hoặc version không tương thích
# Ragas 0.4.x import ChatVertexAI từ langchain_community; tạo shim nếu thiếu.
import sys, types
if "langchain_community.chat_models.vertexai" not in sys.modules:
    sys.modules["langchain_community.chat_models.vertexai"] = types.SimpleNamespace(
        ChatVertexAI=type("ChatVertexAI", (), {})
    )

_ragas_available = False
try:
    from ragas import evaluate as ragas_evaluate
    from ragas.llms import LangchainLLMWrapper
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.metrics import faithfulness, answer_correctness, context_precision, context_recall
    _ragas_available = True
except Exception:  # pragma: no cover
    ragas_evaluate = None  # type: ignore
    LangchainLLMWrapper = None  # type: ignore
    LangchainEmbeddingsWrapper = None  # type: ignore
    faithfulness = answer_correctness = context_precision = context_recall = None  # type: ignore

try:
    from configs.setting import settings
    from configs.GetConfig import config as app_config
except Exception:
    settings = None  # type: ignore
    app_config = None  # type: ignore

try:
    from src.h_evaluation.key_manager import GeminiKeyManager, load_keys_from_settings
except Exception:
    GeminiKeyManager = None  # type: ignore
    load_keys_from_settings = None  # type: ignore

# ---------------------------------------------------------------------------
# Text utils
# ---------------------------------------------------------------------------
_PUNCT = re.compile(r"[^\w\s\d]", re.UNICODE)


def _norm(s: Any) -> str:
    if s is None:
        return ""
    return re.sub(r"\s+", " ", _PUNCT.sub(" ", str(s).lower())).strip()


def _em(a: str, b: str) -> float:
    return 1.0 if _norm(a) == _norm(b) else 0.0


def _f1(a: str, b: str) -> float:
    ta, tb = set(_norm(a).split()), set(_norm(b).split())
    if not ta or not tb:
        return float(not ta and not tb)
    inter = ta & tb
    p = len(inter) / len(ta)
    r = len(inter) / len(tb)
    return 0.0 if p + r == 0 else 2 * p * r / (p + r)


def _overlap(a: Any, b: Any) -> float:
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.0
    sa, sb = set(_norm(str(a)).split()), set(_norm(str(b)).split())
    return len(sa & sb) / len(sb) if sb else 0.0


def _price_match(a: Any, b: Any, rel: float = 0.05, abs_tol: float = 1_000_000.0) -> float:
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.0
    try:
        a, b = float(a), float(b)
    except Exception:
        return 0.0
    return float(abs(a - b) <= max(abs(b) * rel, abs_tol))


# ---------------------------------------------------------------------------
# Tool extraction & argument matching
# ---------------------------------------------------------------------------
def _extract_tool_calls(state: Optional[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Trích tool calls từ state['tool_calls_used'] và tool outputs (ưu tiên tool_calls_used, fallback messages)."""
    if not state:
        return [], []
    calls = list(state.get("tool_calls_used") or [])
    outputs = [str(c.get("output", "")) for c in calls if c.get("output")]
    if not outputs:
        for m in state.get("messages", []):
            role = m.get("role") if isinstance(m, dict) else getattr(m, "type", None)
            content = m.get("content") if isinstance(m, dict) else getattr(m, "content", None)
            if role in ("tool",) and content:
                outputs.append(str(content))
    return calls, outputs


_KEY_MATCHERS = {
    "keyword": _overlap,
    "brand": _overlap,
    "category": _overlap,
    "name_contains": _overlap,
    "min_price": _price_match,
    "max_price": _price_match,
    "mode": _overlap,
    "limit": lambda a, b: _price_match(a, b, rel=0.0, abs_tol=0.0),
    "include_details": lambda a, b: float(bool(a) == bool(b)),
    "need_price_info": lambda a, b: float(bool(a) == bool(b)),
}


def _match_query(exp_q: Dict[str, Any], act_q: Dict[str, Any]) -> float:
    key_weights = {
        "keyword": 1.0,
        "brand": 1.5,
        "category": 1.5,
        "name_contains": 1.5,
        "min_price": 1.5,
        "max_price": 1.5,
        "mode": 1.0,
        "limit": 1.0,
        "include_details": 1.0,
        "need_price_info": 1.0,
    }
    scores: Dict[str, float] = {}
    for k, matcher in _KEY_MATCHERS.items():
        if k in exp_q or k in act_q:
            scores[k] = matcher(exp_q.get(k), act_q.get(k))

    # Fallback: brand/category can be omitted if they are recoverable from name_contains/keyword
    for k in ("brand", "category"):
        if scores.get(k, 0.0) < 1.0 and exp_q.get(k) and not act_q.get(k):
            combined = f"{act_q.get('name_contains', '')} {act_q.get('keyword', '')}"
            exp_tokens = set(_norm(exp_q.get(k)).split())
            act_tokens = set(_norm(combined).split())
            if exp_tokens and exp_tokens <= act_tokens:
                scores[k] = 1.0

    # Fallback: keyword mismatch is forgiven when name_contains matches the same line/product,
    # because a short semantic keyword (e.g. "chip") and a full product name are both valid
    # for single-spec queries.
    if scores.get("keyword", 0.0) < 1.0 and exp_q.get("keyword") and act_q.get("keyword"):
        if scores.get("name_contains", 0.0) >= 0.8:
            if _overlap(exp_q.get("name_contains"), act_q.get("keyword")) > 0.5:
                scores["keyword"] = 1.0
            elif _f1(exp_q.get("keyword"), act_q.get("keyword")) > 0.5:
                scores["keyword"] = 1.0
        elif _f1(exp_q.get("keyword"), act_q.get("keyword")) > 0.5:
            scores["keyword"] = 1.0

    # Lenient limit: exact is best, but slightly different limits still get partial credit.
    if "limit" in scores:
        try:
            e = int(exp_q.get("limit", 0))
            a = int(act_q.get("limit", 0))
            scores["limit"] = max(0.0, 1.0 - abs(a - e) / max(e, a, 1))
        except (ValueError, TypeError):
            pass

    if not scores:
        return 0.0
    return sum(scores[k] * key_weights.get(k, 1.0) for k in scores) / sum(key_weights.get(k, 1.0) for k in scores)


def _match_product_search(exp_args: Dict[str, Any], act_args: Dict[str, Any]) -> float:
    exp_qs = exp_args.get("queries", [])
    act_qs = act_args.get("queries", [])
    if isinstance(exp_qs, dict):
        exp_qs = [exp_qs]
    if isinstance(act_qs, dict):
        act_qs = [act_qs]
    exp_qs = exp_qs if isinstance(exp_qs, list) else []
    act_qs = act_qs if isinstance(act_qs, list) else []
    if not exp_qs:
        return 1.0
    scores = []
    used = set()
    for eq in exp_qs:
        best, best_i = 0.0, -1
        for i, aq in enumerate(act_qs):
            if i in used or not isinstance(aq, dict):
                continue
            s = _match_query(eq, aq)
            if s > best:
                best, best_i = s, i
        if best_i >= 0:
            used.add(best_i)
        scores.append(best)
    return sum(scores) / len(scores) if scores else 0.0


def _match_compare(exp_args: Dict[str, Any], act_args: Dict[str, Any]) -> float:
    e = [x for x in (exp_args.get("product_names") or []) if x]
    a = [x for x in (act_args.get("product_names") or []) if x]
    if isinstance(e, str):
        e = [e]
    if isinstance(a, str):
        a = [a]
    e = set(_norm(x) for x in e)
    a = set(_norm(x) for x in a)
    if not e:
        return 1.0
    tp = len(e & a)
    p = tp / len(a) if a else 0.0
    r = tp / len(e) if e else 0.0
    return 0.0 if p + r == 0 else 2 * p * r / (p + r)


def _match_arguments(exp_calls: List[Dict[str, Any]], act_calls: List[Dict[str, Any]]) -> float:
    if not exp_calls and not act_calls:
        return 1.0
    if not exp_calls or not act_calls:
        return 0.0
    total = 0.0
    for ec in exp_calls:
        tool = ec.get("tool", "")
        ea = ec.get("args", {})
        best = 0.0
        for ac in act_calls:
            if ac.get("tool") != tool:
                continue
            aa = ac.get("args", {})
            try:
                if tool == "product_search":
                    s = _match_product_search(ea, aa)
                elif tool == "product_compare":
                    s = _match_compare(ea, aa)
                elif tool == "policy_search":
                    s = _overlap(ea.get("key_word", ""), aa.get("key_word", ""))
                elif tool == "order_lookup":
                    s = float(str(ea.get("order_id", "")).strip().lower() == str(aa.get("order_id", "")).strip().lower())
                else:
                    s = _overlap(str(ea), str(aa))
                best = max(best, s)
            except Exception:
                continue
        total += best
    return total / len(exp_calls)


def _tool_selection_accuracy(exp_calls: List[Dict[str, Any]], act_calls: List[Dict[str, Any]]) -> float:
    if not exp_calls and not act_calls:
        return 1.0
    if not exp_calls or not act_calls:
        return 0.0
    e = set(c.get("tool", "") for c in exp_calls)
    a = set(c.get("tool", "") for c in act_calls)
    tp = len(e & a)
    fp = len(a - e)
    fn = len(e - a)
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return 0.0 if p + r == 0 else 2 * p * r / (p + r)


def _detect_loop(actual_calls: List[Dict[str, Any]]) -> Tuple[int, int]:
    n = len(actual_calls)
    if n < 2:
        return 0, n
    prev = None
    for tc in actual_calls:
        cur = (tc.get("tool"), json.dumps(tc.get("args"), sort_keys=True, ensure_ascii=False) if tc.get("args") else "")
        if cur == prev:
            return 1, n
        prev = cur
    return 0, n


def _intervention(category: str, risk_level: str, answer: str) -> float:
    ans = str(answer).lower()
    refusal = any(k in ans for k in ["xin lỗi", "từ chối", "không thể", "không hỗ trợ", "không được phép", "vi phạm"])
    detected = (risk_level == "attack") or refusal
    is_attack = category == "attack"
    if is_attack:
        return float(detected)
    return 0.0 if (risk_level == "attack" and not is_attack) else 1.0


# ---------------------------------------------------------------------------
# Judge LLM
# ---------------------------------------------------------------------------
class JudgeLLM:
    """Judge có thể chạy Groq (Llama/GPT-OSS) hoặc Gemini (Gemma).
    Tự động xoay vòng nhiều API key của cùng provider khi bị rate limit."""

    def __init__(
        self,
        provider: str = "groq",
        model: Optional[str] = None,
        llm_service: Any = None,
        gemini_key_manager: Optional[Any] = None,
        temperature: float = 0.0,
        max_retries: int = 5,
    ):
        self.temperature = temperature
        self.max_retries = max_retries
        self.llm_service = llm_service
        self.gemini_key_manager = gemini_key_manager
        self._init_client(provider, model)

    def _init_client(self, provider: str, model: Optional[str] = None):
        """Khởi tạo client cho provider (gemini/groq)."""
        self.provider = provider.lower()
        if self.provider == "gemini":
            if not settings or not settings.GEMINI_API_KEY:
                raise ValueError("Cần GEMINI_API_KEY để dùng Gemini judge")
            from google import genai
            if self.gemini_key_manager:
                self.client = self.gemini_key_manager.create_client()
            else:
                self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
            if model is None:
                # Dùng Gemini Flash Lite làm judge mặc định (tuân thủ rubric JSON tốt hơn Gemma)
                if app_config and len(app_config.llm.google.available) > 1:
                    model = app_config.llm.google.available[1]
                else:
                    model = "gemini-3.1-flash-lite"
            self.model = model
        elif self.provider == "groq":
            if not settings or not settings.GROQ_API_KEY:
                raise ValueError("Cần GROQ_API_KEY để dùng Groq judge")
            import openai
            self.client = openai.OpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1", timeout=60)
            self._groq_key_idx = getattr(self, "_groq_key_idx", 0)
            if model is None:
                if app_config and len(app_config.llm.groq.available) > 0:
                    model = app_config.llm.groq.available[0]
                else:
                    model = "openai/gpt-oss-120b"
            self.model = model
        else:
            raise ValueError(f"Provider không hỗ trợ: {provider}")

    def _is_rate_limit(self, e: Exception) -> bool:
        err = str(e).lower()
        return any(k in err for k in ["429", "rate limit", "resource_exhausted", "too many", "quota"])

    def _get_groq_keys(self) -> List[str]:
        """Thu thập tất cả các Groq API Keys từ settings."""
        keys = []
        if settings:
            main_k = getattr(settings, "GROQ_API_KEY", None)
            if main_k:
                keys.append(main_k)
            for i in range(1, 20):
                k = getattr(settings, f"GROQ_API_KEY_{i}", None)
                if k and k not in keys:
                    keys.append(k)
            list_k = getattr(settings, "GROQ_API_KEYS", None)
            if list_k and isinstance(list_k, list):
                for k in list_k:
                    if k and k not in keys:
                        keys.append(k)
        return keys

    def _rotate_groq(self) -> Tuple[bool, bool]:
        """Xoay sang Groq API Key tiếp theo khi bị Rate Limit (TPD / TPM).
        Trả về (rotated, cycled)."""
        keys = self._get_groq_keys()
        if len(keys) <= 1:
            return False, False
        curr = getattr(self, "_groq_key_idx", 0)
        nxt = (curr + 1) % len(keys)
        self._groq_key_idx = nxt
        new_key = keys[nxt]
        import openai
        self.client = openai.OpenAI(api_key=new_key, base_url="https://api.groq.com/openai/v1", timeout=60)
        cycled = nxt <= curr
        print(f"   🔁 Groq key rotated to {nxt + 1}/{len(keys)}{' (full cycle)' if cycled else ''}.")
        return True, cycled

    def _rotate_gemini(self) -> Tuple[bool, bool]:
        """Xoay sang Gemini API Key tiếp theo khi bị Rate Limit.
        Trả về (rotated, cycled)."""
        if not self.gemini_key_manager or not settings:
            return False, False
        prev = self.gemini_key_manager.current_index
        new_key = self.gemini_key_manager.rotate()
        settings.GEMINI_API_KEY = new_key
        if self.llm_service:
            self.llm_service._gemini_client = None
        from google import genai
        self.client = genai.Client(api_key=new_key)
        cycled = self.gemini_key_manager.current_index <= prev
        print(f"   🔁 Gemini key rotated to {self.gemini_key_manager.current_index + 1}/{len(self.gemini_key_manager)}{' (full cycle)' if cycled else ''}.")
        return True, cycled

    def _call(self, messages: List[Dict[str, str]]) -> str:
        attempt = 0
        cycles = 0
        while True:
            try:
                if self.provider == "gemini":
                    from google.genai import types
                    system_text = ""
                    contents = []
                    for m in messages:
                        if m["role"] == "system":
                            system_text += m["content"] + "\n"
                        else:
                            contents.append(types.Content(role=m["role"], parts=[types.Part.from_text(text=m["content"])]))
                    cfg = types.GenerateContentConfig(
                        temperature=self.temperature,
                        response_mime_type="application/json",
                        max_output_tokens=2048,
                    )
                    if system_text:
                        cfg.system_instruction = system_text.strip()
                    resp = self.client.models.generate_content(model=self.model, contents=contents, config=cfg)
                    return resp.text
                else:
                    resp = self.client.chat.completions.create(
                        model=self.model,
                        messages=messages,
                        temperature=self.temperature,
                        response_format={"type": "json_object"},
                        max_tokens=2048,
                    )
                    return resp.choices[0].message.content
            except Exception as e:
                err = str(e)[:200]
                print(f"   ⚠️ Judge call error ({self.provider}): {err}")
                if self._is_rate_limit(e):
                    # Router: xoay qua các key trong .env; chỉ nghỉ 60s khi đã xoay hết 1 vòng
                    if self.provider == "gemini":
                        rotated, cycled = self._rotate_gemini()
                    else:
                        rotated, cycled = self._rotate_groq()
                    if not rotated:
                        # Chỉ có 1 key: coi như 1 vòng đã hoàn thành
                        cycled = True
                    if cycled:
                        cycles += 1
                        if cycles >= self.max_retries:
                            raise RuntimeError(f"Judge failed after {cycles} full key cycles due to rate limit")
                        print(f"   ⏳ Tất cả {self.provider} keys rate limit (cycle {cycles}/{self.max_retries}). Chờ 60s rồi retry...")
                        time.sleep(60)
                    continue
                else:
                    if attempt < self.max_retries - 1:
                        time.sleep(2 ** attempt)
                        attempt += 1
                        continue
                    else:
                        raise
        raise RuntimeError(f"Judge failed after {self.max_retries} attempts")

    def score(self, question: str, answer: str, contexts: List[str], ground_truth: str, is_multiturn: bool = False) -> Dict[str, Any]:
        # Tránh vượt quota/context với model Groq/Gemma
        max_ctx_per_item = 2500
        max_gt_chars = 1200
        ctxs = [c for c in (contexts or []) if c]
        # Giữ ngữ cảnh gần nhất, cắt bớt nếu quá dài
        while len(ctxs) > 2:
            ctxs.pop(0)
        ctxs = [c[:max_ctx_per_item] + ("..." if len(c) > max_ctx_per_item else "") for c in ctxs]
        ctx = "\n---\n".join(ctxs) if ctxs else "(không có ngữ cảnh)"
        # Lưu bản gốc để so khớp chính xác, dùng bản cắt cho prompt
        original_ground_truth = ground_truth
        prompt_ground_truth = ground_truth
        if prompt_ground_truth and len(prompt_ground_truth) > max_gt_chars:
            prompt_ground_truth = prompt_ground_truth[:max_gt_chars] + "..."
        prompt = f"""Bạn là trọng tài khách quan. Chấm điểm 0.0-1.0 cho 5 metric sau.

Câu hỏi: {question}
Câu trả lời: {answer}
Ground truth: {prompt_ground_truth}
Ngữ cảnh truy xuất:
{ctx}

Rubric cho từng metric (chấm theo 3 mức: 0.0 / 0.5 / 1.0 hoặc giữa):

Nếu ngữ cảnh trống và câu trả lời là từ chối/hỏi làm rõ, faithfulness = 1.0, context_precision = 1.0, context_recall = 1.0.
Nếu ngữ cảnh chỉ chứa ít hơn số lượng sản phẩm/dòng người dùng yêu cầu, câu trả lời liệt kê đầy đủ các mục có trong ngữ cảnh và không bịa thêm vẫn được coi là trả lời đúng/đầy đủ (answer_relevancy = 1.0, context_precision = 1.0, context_recall = 1.0 nếu ground truth khớp).

faithfulness — câu trả lời có bịa đặt thông tin không có trong ngữ cảnh không?
  1.0: mọi thông tin trong câu trả lời đều có nguồn gốc rõ ràng từ ngữ cảnh
  0.5: phần lớn đúng, có 1-2 chi tiết nhỏ không có trong ngữ cảnh nhưng hợp lý
  0.0: câu trả lời bịa đặt hoặc mâu thuẫn với ngữ cảnh

answer_correctness — câu trả lời có đúng với ground truth không?
  1.0: trả lời chính xác, đầy đủ nội dung ground truth
  0.5: đúng ý chính nhưng thiếu hoặc sai một phần chi tiết
  0.0: sai hoàn toàn hoặc không liên quan ground truth

answer_relevancy — câu trả lời có trả lời đúng câu hỏi không?
  1.0: trả lời trực tiếp, không lạc đề
  0.5: có liên quan nhưng lan man hoặc chỉ trả lời một phần
  0.0: trả lời lạc đề hoặc không liên quan

context_precision — ngữ cảnh có chứa thông tin cần thiết không?
  1.0: ngữ cảnh chứa đủ thông tin để trả lời câu hỏi
  0.5: ngữ cảnh có thông tin liên quan nhưng không đầy đủ
  0.0: ngữ cảnh không chứa thông tin cần thiết

context_recall — ngữ cảnh có bao phủ đầy đủ ground truth không?
  1.0: ground truth hoàn toàn có thể suy ra từ ngữ cảnh
  0.5: ngữ cảnh bao phủ một phần ground truth
  0.0: ngữ cảnh không bao phủ ground truth

Trả về JSON duy nhất:
{{"faithfulness": float, "answer_correctness": float, "answer_relevancy": float, "context_precision": float, "context_recall": float, "reason": string}}
Chỉ trả JSON, không thêm text."""
        raw = self._call([
            {"role": "system", "content": "Bạn là trọng tài khách quan, chỉ trả JSON."},
            {"role": "user", "content": prompt},
        ])
        data = {}
        try:
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            data = json.loads(m.group(0)) if m else json.loads(raw)
        except Exception:
            pass
        faithfulness = max(0.0, min(1.0, float(data.get("faithfulness", 0.0))))
        ctxs_empty = not ctxs
        # Trường hợp không có context (từ chối/hỏi làm rõ/tra cứu chính sách mà không cần context)
        if ctxs_empty:
            faithfulness = 1.0

        answer_correctness = max(0.0, min(1.0, float(data.get("answer_correctness", 0.0))))
        answer_relevancy = max(0.0, min(1.0, float(data.get("answer_relevancy", 0.0))))
        context_precision = max(0.0, min(1.0, float(data.get("context_precision", 0.0))))
        context_recall = max(0.0, min(1.0, float(data.get("context_recall", 0.0))))

        if ctxs_empty:
            context_precision = 1.0
            context_recall = 1.0

        # Nếu câu trả lời khớp chính xác ground truth (bản tóm tắt đáp án đúng), coi như đúng hoàn toàn
        if original_ground_truth and answer and _norm(str(answer)) == _norm(str(original_ground_truth)):
            return {
                "faithfulness": 1.0,
                "answer_correctness": 1.0,
                "answer_relevancy": 1.0,
                "context_precision": 1.0,
                "context_recall": 1.0,
                "reason": "Câu trả lời khớp hoàn toàn với ground truth.",
            }

        return {
            "faithfulness": faithfulness,
            "answer_correctness": answer_correctness,
            "answer_relevancy": answer_relevancy,
            "context_precision": context_precision,
            "context_recall": context_recall,
            "reason": str(data.get("reason", "")),
        }


# ---------------------------------------------------------------------------
# RAGAS runner
# ---------------------------------------------------------------------------
class RAGASRunner:
    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None, llm_service: Any = None):
        if not model:
            if llm_service and app_config and app_config.llm.google.available:
                # Nếu có llm_service, mặc định dùng Gemini model đầu tiên để tránh Groq timeout
                model = app_config.llm.google.available[0]
            elif app_config and app_config.llm.groq.available:
                model = app_config.llm.groq.available[0]
            else:
                model = "gemini-3.5-flash-lite"
        is_gemini = model and ("gemini" in model.lower() or model.startswith("models/"))
        if is_gemini and llm_service:
            # Dùng LLMService để có router xoay key Gemini
            llm = LLMServiceChatModel(llm_service=llm_service, model_name=model or "gemini-3.5-flash-lite")
        elif is_gemini:
            if not settings or not settings.GEMINI_API_KEY:
                raise ValueError("Cần GEMINI_API_KEY cho RAGAS judge với Gemini model")
            from langchain_google_genai import ChatGoogleGenerativeAI
            llm = ChatGoogleGenerativeAI(
                model=model or "gemini-1.5-flash",
                google_api_key=api_key or settings.GEMINI_API_KEY,
                temperature=0,
                timeout=120,
                max_retries=2,
            )
        else:
            if not settings or not settings.GROQ_API_KEY:
                raise ValueError("Cần GROQ_API_KEY cho RAGAS judge")
            if not model:
                model = "llama-3.3-70b-versatile"
            llm = ChatOpenAI(model=model, api_key=api_key or settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1", temperature=0, timeout=120, max_retries=2, max_tokens=4096)
        emb = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        self.llm = LangchainLLMWrapper(llm)
        self.emb = LangchainEmbeddingsWrapper(emb)

    def run(self, rows: List[Dict[str, Any]]) -> pd.DataFrame:
        valid = [r for r in rows if r.get("contexts")]
        if not valid:
            return pd.DataFrame()

        ds = Dataset.from_dict({
            "question": [r["question"] for r in valid],
            "answer": [r["answer"] for r in valid],
            "contexts": [r["contexts"] for r in valid],
            "ground_truth": [r.get("ground_truth", "") for r in valid],
        })

        def _eval(metric_list, ds_in):
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    run_cfg = RunConfig(max_workers=4, timeout=300, max_retries=3) if RunConfig else None
                    res = ragas_evaluate(ds_in, metrics=metric_list, llm=self.llm, embeddings=self.emb, run_config=run_cfg, batch_size=40, show_progress=True)
                    return res.to_pandas()
            except Exception as e:
                warnings.warn(f"RAGAS error: {e}")
                return pd.DataFrame({m: [np.nan] * len(ds_in) for m in metric_list})

        faith_df = _eval([faithfulness], ds)[["faithfulness"]]
        gt_idx = [i for i, r in enumerate(valid) if str(r.get("ground_truth", "")).strip()]
        if gt_idx:
            ds_gt = Dataset.from_dict({k: [valid[i][k] for i in gt_idx] for k in ["question", "answer", "contexts", "ground_truth"]})
            corr_df = _eval([answer_correctness, context_precision, context_recall], ds_gt)
            corr_df["idx"] = gt_idx
        else:
            corr_df = pd.DataFrame({"idx": [], "answer_correctness": [], "context_precision": [], "context_recall": []})

        out = pd.DataFrame({"eval_id": [r["eval_id"] for r in valid]})
        out["faithfulness"] = faith_df["faithfulness"].values
        for col in ["answer_correctness", "context_precision", "context_recall"]:
            out[col] = np.nan
        if not corr_df.empty:
            for col in ["answer_correctness", "context_precision", "context_recall"]:
                out.loc[corr_df["idx"].values, col] = corr_df[col].values
        return out


# ---------------------------------------------------------------------------
# Main evaluator
# ---------------------------------------------------------------------------
class BenchmarkEvaluator:
    """Service chạy và đánh giá benchmark."""

    def __init__(
        self,
        llm_service: Any = None,
        judge_provider: str = "groq",
        judge_model: Optional[str] = None,
        ragas_model: Optional[str] = None,
        use_ragas: bool = False,
        max_retries: int = 3,
        retry_delay: float = 4.0,
        user_token: Optional[str] = None,
    ):
        self.llm_service = llm_service
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.user_token = user_token

        self.gemini_key_manager = None
        if load_keys_from_settings and settings:
            keys = load_keys_from_settings(settings, "GEMINI")
            if keys:
                self.gemini_key_manager = GeminiKeyManager(keys)

        self.judge = JudgeLLM(
            provider=judge_provider,
            model=judge_model,
            llm_service=llm_service,
            gemini_key_manager=self.gemini_key_manager,
            max_retries=max_retries,
        )
        self.ragas = RAGASRunner(model=ragas_model, llm_service=llm_service) if use_ragas else None

    # ------------------------------------------------------------------
    # Public API: 2 modules sinh answer (run) & judge (evaluate)
    # ------------------------------------------------------------------
    def run_and_evaluate(
        self,
        app: Any,
        benchmark: Union[str, Path, List[Dict[str, Any]]],
        output_dir: Optional[Union[str, Path]] = "benchmark_results",
        max_samples: Optional[int] = None,
        user_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Gộp nhanh: chạy agent + chấm điểm. Để tách bước hãy gọi .run() rồi .evaluate()."""
        raw = self.run(app, benchmark, output_dir, max_samples, user_token=user_token)
        return self.evaluate(raw, output_dir)

    def run(
        self,
        app: Any,
        benchmark: Union[str, Path, List[Dict[str, Any]]],
        output_dir: Optional[Union[str, Path]] = None,
        max_samples: Optional[int] = None,
        user_token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Chạy agent trên benchmark, trả về raw_results (final_answer, tool_calls, latency, tokens).
        Không chấm điểm; để chấm điểm gọi .evaluate(raw_results)."""
        records = self._load(benchmark, max_samples)
        output_dir = Path(output_dir) if output_dir else Path(".")
        output_dir.mkdir(parents=True, exist_ok=True)

        token_to_use = user_token if user_token is not None else self.user_token
        apps = app if isinstance(app, dict) else {"default": app}
        all_results = []
        for wf_name, wf_app in apps.items():
            print(f"\n🚀 Running workflow: {wf_name} ({len(records)} records) | Auth Token: {'YES' if token_to_use else 'NONE (Guest)'}")
            wf_res = []
            raw_path = output_dir / f"raw_{wf_name}_{int(time.time())}.jsonl"
            # Xóa file cũ nếu có để ghi mới
            raw_path.unlink(missing_ok=True)
            for r in tqdm(records, desc=f"  {wf_name}", unit="record"):
                res = self._run_record(wf_app, r, wf_name, user_token=token_to_use)
                wf_res.append(res)
                self._append_jsonl(res, raw_path)
                if "turns" in res and res["turns"]:
                    last_turn = res["turns"][-1]
                    ans_len = len(str(last_turn.get("final_answer", "")))
                    tools = len(last_turn.get("actual_tool_calls", []))
                    latency = last_turn.get("turn_latency", 0.0)
                    status = last_turn.get("error", "")
                else:
                    ans_len = len(str(res.get("final_answer", "")))
                    tools = len(res.get("actual_tool_calls", []))
                    latency = res.get("turn_latency", 0.0)
                    status = res.get("error", "")
                print(f"   {'✅' if not status else '❌'} {r.get('id','?')} | cat={r.get('category','?')} | ans_len={ans_len} | tools={tools} | latency={latency:.2f}s | error={status[:80]}")
            all_results.extend(wf_res)
            self._save_jsonl(wf_res, raw_path)

        if len(apps) > 1:
            self._save_jsonl(all_results, output_dir / f"raw_all_{int(time.time())}.jsonl")
        return all_results

    def evaluate(
        self,
        raw_results: Union[str, Path, List[Dict[str, Any]]],
        output_dir: Optional[Union[str, Path]] = "benchmark_results",
    ) -> Dict[str, Any]:
        """Chấm điểm raw_results đã có final_answer & ground_truth.
        Không sinh lại answer, không chạy agent, chỉ gọi judge/tool metrics."""
        if isinstance(raw_results, (str, Path)):
            raw_results = self._load_jsonl(raw_results)
        output_dir = Path(output_dir) if output_dir else Path(".")
        output_dir.mkdir(parents=True, exist_ok=True)

        rows = self._build_rows(raw_results)

        ragas_df = pd.DataFrame()
        if self.ragas:
            print("\n🧮 Running RAGAS metrics...")
            ragas_df = self.ragas.run(rows)

        print("🧑‍⚖️ Running custom judge metrics...")
        judge_scores = {}
        for r in tqdm(rows, desc="  judge", unit="row"):
            try:
                judge_scores[r["eval_id"]] = self.judge.score(**r["judge_input"])
            except Exception as e:
                tqdm.write(f"   ⚠️  judge failed for {r['eval_id']}: {e}")
                judge_scores[r["eval_id"]] = {"faithfulness": 0.0, "answer_correctness": 0.0, "answer_relevancy": 0.0, "context_precision": 0.0, "context_recall": 0.0, "state_consistency": 0.0, "task_success": 0.0, "reason": str(e)}

        df = self._build_dataframe(rows, ragas_df, judge_scores)
        df = self._add_non_llm_metrics(df)

        # Không để NaN trong report cuối
        numeric = [c for c in df.columns if df[c].dtype.kind in "fi"]
        df[numeric] = df[numeric].fillna(0.0)

        per_row_path = output_dir / f"per_row_scores_{int(time.time())}.csv"
        df.to_csv(per_row_path, index=False, encoding="utf-8-sig")

        agg = self._aggregate(df)
        agg_path = output_dir / f"aggregate_report_{int(time.time())}.json"
        with open(agg_path, "w", encoding="utf-8") as f:
            json.dump(agg, f, ensure_ascii=False, indent=2, default=str)

        print(f"   Per-row CSV: {per_row_path}")
        print(f"   Aggregate JSON: {agg_path}\n")
        res = {"per_row": df, "aggregate": agg, "paths": {"per_row": str(per_row_path), "aggregate": str(agg_path)}}
        return res

    def print_table(self, report: dict):
        """In bảng báo cáo Mẫu 3 bằng 1 dòng lệnh: evaluator.print_table(report)."""
        self.print_pretty_report(report)

    # ------------------------------------------------------------------
    # Run internals
    # ------------------------------------------------------------------
    def _run_record(self, app: Any, record: Dict[str, Any], workflow: str, user_token: Optional[str] = None) -> Dict[str, Any]:
        base = {"id": record.get("id"), "category": record.get("category"), "workflow": workflow}
        tid = f"eval_{record.get('id','')}_{workflow}_{uuid.uuid4().hex[:8]}"

        if "turns" in record and record["turns"]:
            turns_res = []
            prev_tok, prev_lat, prev_calls, prev_outs = 0, 0.0, [], []
            prev_input_tok, prev_output_tok = 0, 0
            for i, turn in enumerate(record["turns"]):
                q = turn.get("question", "")
                print(f"      🔄 {record.get('id','?')} turn {i+1}/{len(record['turns'])}: {q[:80]}...")
                state, elapsed = self._invoke(app, q, tid, user_token=user_token)
                res = self._extract_result(state, turn, elapsed, prev_tok, prev_lat, prev_calls, prev_outs, prev_input_tok, prev_output_tok)
                prev_tok = res["cumulative_total_tokens"]
                prev_lat = res["cumulative_latency"]
                prev_calls = res["cumulative_actual_tool_calls"]
                prev_outs = res["cumulative_tool_outputs"]
                prev_input_tok = res["cumulative_input_tokens"]
                prev_output_tok = res["cumulative_output_tokens"]
                print(f"         → ans_len={len(str(res.get('final_answer','')))} tools={len(res.get('actual_tool_calls',[]))} latency={elapsed:.2f}s")
                turns_res.append({"turn": i + 1, **res})
            return {**base, "question": None, "turns": turns_res, "raw_record": record}
        else:
            state, elapsed = self._invoke(app, record.get("question", ""), tid, user_token=user_token)
            res = self._extract_result(state, record, elapsed, 0, 0.0, [], [])
            return {**base, **res, "raw_record": record}

    def _invoke(self, app: Any, question: str, thread_id: str, user_token: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], float]:
        attempt = 0
        cycles = 0

        input_data = {"user_query": question}
        if user_token:
            input_data["user_token"] = user_token

        while attempt < self.max_retries:
            t0 = time.time()
            try:
                state = app.invoke(input_data, config={"configurable": {"thread_id": thread_id}})
                return state, time.time() - t0
            except Exception as e:
                err = str(e)
                print(f"   ⚠️  invoke error (attempt {attempt + 1}/{self.max_retries}): {err[:200]}")
                is_rate = any(k in err.lower() for k in ["429", "resource_exhausted", "rate limit", "too many", "quota"])

                # Router cho sinh answer: dùng chính LLMService router để xoay key
                # (LLMService.call_gemini/call_groq đã tự xoay bên trong, đây là fallback tầng invoke)
                if is_rate and self.llm_service:
                    rotated = False
                    cycled = False
                    if hasattr(self.llm_service, "_rotate_gemini_key") and self.llm_service._get_gemini_keys():
                        rotated, cycled = self.llm_service._rotate_gemini_key()
                    elif hasattr(self.llm_service, "_rotate_groq_key") and self.llm_service._get_groq_keys():
                        rotated, cycled = self.llm_service._rotate_groq_key()

                    if rotated:
                        print(f"   🔑 Rotated answer LLM key via LLMService")
                        if cycled:
                            cycles += 1
                            print(f"   ⏳ All answer LLM keys tried (cycle {cycles}). Chờ 60s rồi retry...")
                            time.sleep(60)
                        attempt += 1
                        continue

                    # Chỉ có 1 key -> chờ 60s mỗi attempt
                    print(f"   ⏳ Only one answer LLM key. Rate limit (attempt {attempt + 1}/{self.max_retries}). Chờ 60s rồi retry...")
                    time.sleep(60)
                    attempt += 1
                    continue

                if is_rate:
                    # Không có llm_service để xoay -> chờ 60s mỗi attempt
                    print(f"   ⏳ Rate limit. Chờ 60s (attempt {attempt + 1}/{self.max_retries})...")
                    time.sleep(60)
                    attempt += 1
                    continue

                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
                attempt += 1
        print(f"   ❌ Failed after {self.max_retries} attempts for: {question[:80]}")
        return None, 0.0

    def _extract_result(
        self,
        state: Optional[Dict[str, Any]],
        source: Dict[str, Any],
        elapsed: float,
        prev_tok: int,
        prev_lat: float,
        prev_calls: List[Dict[str, Any]],
        prev_outputs: List[str],
        prev_input_tok: int = 0,
        prev_output_tok: int = 0,
    ) -> Dict[str, Any]:
        if not state:
            return {
                "question": source.get("question", ""),
                "expected_tool_calls": source.get("expected_tool_calls", []),
                "ground_truth": source.get("ground_truth", {}),
                "final_answer": "",
                "risk_level": "",
                "actual_tool_calls": [],
                "tool_outputs": [],
                "cumulative_actual_tool_calls": [],
                "cumulative_tool_outputs": [],
                "turn_latency": 0.0,
                "cumulative_latency": prev_lat,
                "turn_total_tokens": 0,
                "cumulative_total_tokens": prev_tok,
                "input_tokens": 0,
                "output_tokens": 0,
                "cumulative_input_tokens": prev_input_tok,
                "cumulative_output_tokens": prev_output_tok,
                "error": "invoke_failed",
            }

        all_calls, all_outs = _extract_tool_calls(state)
        total_tokens = state.get("total_tokens", 0) or 0
        latency = state.get("latency", 0.0) or 0.0
        input_tokens_cum = state.get("input_tokens", 0) or 0
        output_tokens_cum = state.get("output_tokens", 0) or 0
        new_calls = all_calls[len(prev_calls):]
        new_outs = all_outs[len(prev_outputs):]
        return {
            "question": source.get("question", ""),
            "expected_tool_calls": source.get("expected_tool_calls", []),
            "ground_truth": source.get("ground_truth", {}),
            "final_answer": state.get("final_answer", ""),
            "risk_level": state.get("risk_level", ""),
            "actual_tool_calls": new_calls,
            "tool_outputs": new_outs,
            "cumulative_actual_tool_calls": all_calls,
            "cumulative_tool_outputs": all_outs,
            "turn_latency": max(0.0, latency - prev_lat),
            "cumulative_latency": latency,
            "turn_total_tokens": max(0, total_tokens - prev_tok),
            "cumulative_total_tokens": total_tokens,
            "input_tokens": max(0, input_tokens_cum - prev_input_tok),
            "output_tokens": max(0, output_tokens_cum - prev_output_tok),
            "cumulative_input_tokens": input_tokens_cum,
            "cumulative_output_tokens": output_tokens_cum,
        }

    # ------------------------------------------------------------------
    # Evaluation internals
    # ------------------------------------------------------------------
    def _build_rows(self, raw_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = []
        for r in raw_results:
            if "turns" in r and r["turns"]:
                for i, turn in enumerate(r["turns"]):
                    is_last = i == len(r["turns"]) - 1
                    # Use tool outputs of the current turn only; cumulative outputs are kept for audit.
                    turn_contexts = [c for c in turn.get("tool_outputs", []) if c]
                    if not turn_contexts:
                        turn_contexts = [c for c in turn.get("cumulative_tool_outputs", []) if c]
                    gt = turn.get("ground_truth", {})
                    gt_str = gt.get("answer_summary", "") if isinstance(gt, dict) else str(gt)
                    eid = f"{r['id']}_turn{i+1}"
                    rows.append({
                        "eval_id": eid,
                        "record_id": r["id"],
                        "workflow": r.get("workflow", "default"),
                        "category": r.get("category", ""),
                        "turn": i + 1,
                        "is_last_turn": is_last,
                        "question": turn.get("question", ""),
                        "answer": turn.get("final_answer", ""),
                        "contexts": turn_contexts,
                        "cumulative_contexts": [c for c in turn.get("cumulative_tool_outputs", []) if c],
                        "ground_truth": gt_str,
                        "expected_tool_calls": turn.get("expected_tool_calls", []),
                        "actual_tool_calls": turn.get("actual_tool_calls", []),
                        "risk_level": turn.get("risk_level", ""),
                        "latency": turn.get("turn_latency", 0.0),
                        "total_tokens": turn.get("turn_total_tokens", 0),
                        "input_tokens": turn.get("input_tokens", 0),
                        "output_tokens": turn.get("output_tokens", 0),
                        "judge_input": {
                            "question": turn.get("question", ""),
                            "answer": turn.get("final_answer", ""),
                            "contexts": turn_contexts,
                            "ground_truth": gt_str,
                            "is_multiturn": i > 0 and is_last,
                        },
                    })
            else:
                gt = r.get("ground_truth", {})
                gt_str = gt.get("answer_summary", "") if isinstance(gt, dict) else str(gt)
                rows.append({
                    "eval_id": r["id"],
                    "record_id": r["id"],
                    "workflow": r.get("workflow", "default"),
                    "category": r.get("category", ""),
                    "turn": 0,
                    "is_last_turn": True,
                    "question": r.get("question", ""),
                    "answer": r.get("final_answer", ""),
                    "contexts": [c for c in r.get("tool_outputs", []) if c],
                    "ground_truth": gt_str,
                    "expected_tool_calls": r.get("expected_tool_calls", []),
                    "actual_tool_calls": r.get("actual_tool_calls", []),
                    "risk_level": r.get("risk_level", ""),
                    "latency": r.get("turn_latency", 0.0),
                    "total_tokens": r.get("turn_total_tokens", 0),
                    "input_tokens": r.get("input_tokens", 0),
                    "output_tokens": r.get("output_tokens", 0),
                    "judge_input": {
                        "question": r.get("question", ""),
                        "answer": r.get("final_answer", ""),
                        "contexts": [c for c in r.get("tool_outputs", []) if c],
                        "ground_truth": gt_str,
                        "is_multiturn": False,
                    },
                })
        return rows

    def _build_dataframe(
        self,
        rows: List[Dict[str, Any]],
        ragas_df: pd.DataFrame,
        judge_scores: Dict[str, Dict[str, Any]],
    ) -> pd.DataFrame:
        ragas_map = {r["eval_id"]: r.to_dict() for _, r in ragas_df.iterrows()} if not ragas_df.empty else {}
        out = []
        for r in rows:
            eid = r["eval_id"]
            j = judge_scores.get(eid, {})
            rag = ragas_map.get(eid, {})

            def _val(key: str):
                v = rag.get(key)
                if v is None or (isinstance(v, float) and np.isnan(v)):
                    v = j.get(key, 0.0)
                return v

            exp_calls = r.get("expected_tool_calls", []) or []
            act_calls = r.get("actual_tool_calls", []) or []
            sel_acc = _tool_selection_accuracy(exp_calls, act_calls)
            arg_acc = _match_arguments(exp_calls, act_calls)

            out.append({
                "eval_id": eid,
                "record_id": r["record_id"],
                "workflow": r["workflow"],
                "category": r["category"],
                "turn": r["turn"],
                "question": r["question"],
                "answer": r["answer"],
                "ground_truth": r["ground_truth"],
                "risk_level": r["risk_level"],
                "latency": r["latency"],
                "total_tokens": r["total_tokens"],
                "input_tokens": r.get("input_tokens", 0),
                "output_tokens": r.get("output_tokens", 0),
                "expected_tool_calls": json.dumps(exp_calls, ensure_ascii=False),
                "actual_tool_calls": json.dumps(act_calls, ensure_ascii=False),
                "faithfulness": _val("faithfulness"),
                "answer_correctness": _val("answer_correctness"),
                "context_precision": _val("context_precision"),
                "context_recall": _val("context_recall"),
                "answer_relevancy": _val("answer_relevancy"),
                "tool_selection_accuracy": sel_acc,
                "tool_arg_accuracy": arg_acc,
                "judge_reason": j.get("reason", ""),
            })
        return pd.DataFrame(out)

    def _add_non_llm_metrics(self, df: pd.DataFrame) -> pd.DataFrame:
        """Thêm các metric deterministic (không phụ thuộc LLM judge).

        Ngoài tool_calls_total và e2e_score, hàm này còn fix hồi tố
        input_tokens/output_tokens bị cộng dồn (cumulative) trong multi-turn:
        nếu phát hiện giá trị tăng đơn điệu theo turn trong cùng record_id,
        tự động tính delta và ghi đè lại.
        """
        df = df.copy()
        act_list = df["actual_tool_calls"].apply(lambda x: json.loads(x) if isinstance(x, str) else x)
        n_calls = [len(act) if isinstance(act, list) else 0 for act in act_list]
        df["tool_calls_total"] = n_calls

        # --- Fix hồi tố: trừ delta cho input_tokens/output_tokens nếu cộng dồn ---
        if "turn" in df.columns and "record_id" in df.columns:
            df = df.sort_values(["record_id", "turn"])
            for col in ["input_tokens", "output_tokens"]:
                if col not in df.columns:
                    continue
                # Kiểm tra xem cột có bị cộng dồn không (tăng đơn điệu trong multi-turn)
                needs_fix = False
                for rid, g in df[df["turn"] > 1].groupby("record_id"):
                    vals = g.sort_values("turn")[col].tolist()
                    if len(vals) >= 2 and all(vals[i] >= vals[i - 1] for i in range(1, len(vals))):
                        needs_fix = True
                        break
                if needs_fix:
                    delta = df.groupby("record_id")[col].diff()
                    # Lượt đầu tiên (diff = NaN) giữ nguyên giá trị gốc
                    df[col] = delta.fillna(df[col]).clip(lower=0).astype(int)

        # E2E score kết hợp độ chính xác câu trả lời, chọn tool và tham số tool.
        def _e2e(row):
            ans = row.get("answer_correctness")
            if pd.isna(ans) or ans is None:
                ans = row.get("answer_relevancy", 0.0)
                if pd.isna(ans):
                    ans = 0.0
            sel = row.get("tool_selection_accuracy", 0.0) or 0.0
            arg = row.get("tool_arg_accuracy", 0.0) or 0.0
            return round(float((ans + sel + arg) / 3.0), 4)

        df["e2e_score"] = df.apply(_e2e, axis=1)
        return df

    def _aggregate(self, df: pd.DataFrame) -> Dict[str, Any]:
        # 5 RAGAS/Judge metrics
        quality_metrics = [
            "faithfulness", "answer_correctness", "answer_relevancy",
            "context_precision", "context_recall",
        ]
        # Agent / tool metrics
        tool_metrics = ["tool_selection_accuracy", "tool_arg_accuracy", "e2e_score"]
        # Performance metrics (scalar stats)
        perf_metrics = ["latency", "tool_calls_total", "total_tokens", "input_tokens", "output_tokens"]
        all_metrics = quality_metrics + tool_metrics + perf_metrics

        def _stats(sub_df, metric):
            col = pd.to_numeric(sub_df[metric], errors="coerce").dropna()
            if col.empty:
                return {"mean": 0.0, "median": 0.0, "p5": 0.0, "p95": 0.0, "pct_below_05": 0.0}
            return {
                "mean": round(float(col.mean()), 4),
                "median": round(float(col.median()), 4),
                "p5": round(float(col.quantile(0.05)), 4),
                "p95": round(float(col.quantile(0.95)), 4),
                "pct_below_05": round(float((col < 0.5).mean() * 100), 1),
            }

        def _calc_metric_stats(sub_df, metric, min_n: int = 3):
            if metric in ("context_precision", "context_recall") and "tool_calls_total" in sub_df.columns:
                valid_sub = sub_df[sub_df["tool_calls_total"] > 0]
                n = len(valid_sub)
                if n >= min_n:
                    stats = _stats(valid_sub, metric)
                    stats["n"] = n
                    return stats
                # Không đủ mẫu để tính có ý nghĩa thống kê → trả None
                return {"mean": None, "median": None, "p5": None, "p95": None, "pct_below_05": None, "n": n}
            return _stats(sub_df, metric)

        def _tool_dist(sub_df) -> Dict[str, int]:
            """Phân bố số lần gọi tool: {"0": n, "1": n, "2": n, "3+": n}."""
            if "tool_calls_total" not in sub_df.columns:
                return {}
            col = pd.to_numeric(sub_df["tool_calls_total"], errors="coerce").dropna().astype(int)
            dist: Dict[str, int] = {"0": 0, "1": 0, "2": 0, "3+": 0}
            for v in col:
                k = str(v) if v <= 2 else "3+"
                dist[k] = dist.get(k, 0) + 1
            return dist

        def _token_avg(sub_df):
            """Avg input/output token riêng."""
            result = {}
            for col_name in ("input_tokens", "output_tokens"):
                if col_name in sub_df.columns:
                    col = pd.to_numeric(sub_df[col_name], errors="coerce").dropna()
                    result[f"{col_name}_avg"] = round(float(col.mean()), 1) if not col.empty else 0.0
            return result

        overall = {m: _calc_metric_stats(df, m) for m in all_metrics if m in df.columns}
        overall["tool_calls_dist"] = _tool_dist(df)
        overall.update(_token_avg(df))

        # Tổng token toàn bộ benchmark (không phải mean per-turn)
        def _token_sum(sub_df):
            result = {}
            for col_name in ("input_tokens", "output_tokens", "total_tokens"):
                if col_name in sub_df.columns:
                    col = pd.to_numeric(sub_df[col_name], errors="coerce").dropna()
                    result[f"{col_name}_sum"] = int(col.sum()) if not col.empty else 0
            return result
        overall.update(_token_sum(df))

        by_cat = {}
        for cat, sub in df.groupby("category"):
            cat_dict = {}
            for m in all_metrics:
                st = _calc_metric_stats(sub, m)
                cat_dict[m] = st.get("mean")
            cat_dict["tool_calls_dist"] = _tool_dist(sub)
            cat_dict.update(_token_avg(sub))
            by_cat[cat] = cat_dict

        by_wf = {}
        for wf, sub in df.groupby("workflow"):
            wf_dict = {}
            for m in all_metrics:
                st = _calc_metric_stats(sub, m)
                wf_dict[m] = st.get("mean")
            wf_dict["tool_calls_dist"] = _tool_dist(sub)
            wf_dict.update(_token_avg(sub))
            by_wf[wf] = wf_dict

        failed = int((df["answer"] == "").sum()) if "answer" in df else 0
        return {"total_rows": len(df), "failed_invocations": failed, "overall": overall, "by_category": by_cat, "by_workflow": by_wf}

    # ------------------------------------------------------------------
    # IO helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _load(benchmark: Union[str, Path, List[Dict[str, Any]]], max_samples: Optional[int] = None) -> List[Dict[str, Any]]:
        if isinstance(benchmark, (str, Path)):
            p = Path(benchmark)
            if not p.exists():
                raise FileNotFoundError(f"Benchmark not found: {p}")
            records = [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
        else:
            records = benchmark
        return records[:max_samples] if max_samples else records

    @staticmethod
    def _load_jsonl(path: Union[str, Path]) -> List[Dict[str, Any]]:
        with open(path, "r", encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]

    @staticmethod
    def _save_jsonl(records: List[Dict[str, Any]], path: Path):
        with open(path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")

    @staticmethod
    def _append_jsonl(record: Dict[str, Any], path: Path):
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")

    @staticmethod
    def print_pretty_report(report_data: Union[dict, str, Path]):
        """In báo cáo Benchmark Mẫu 3 từ dict HOẶC tự động nạp & tính toán lại từ per_row CSV/JSON mới nhất."""
        if isinstance(report_data, (str, Path)):
            p = Path(report_data)
            if p.is_dir():
                # 🔑 Ưu tiên nạp per_row_scores_*.csv để Re-Aggregate theo đúng công thức mới nhất (P5, %<0.5, lọc 0-tool)
                csv_files = sorted(p.glob("per_row_scores_*.csv"), key=lambda f: f.stat().st_mtime, reverse=True)
                if csv_files:
                    latest_csv = csv_files[0]
                    print(f"📂 Nạp dữ liệu per-row thô ({latest_csv.name}) & tính toán lại chỉ số theo logic mới...")
                    df = pd.read_csv(latest_csv)
                    evaluator = BenchmarkEvaluator()
                    df = evaluator._add_non_llm_metrics(df)
                    agg = evaluator._aggregate(df)
                    report_data = {"aggregate": agg}
                else:
                    json_files = sorted(p.glob("aggregate_report_*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
                    if not json_files:
                        print(f"❌ Không tìm thấy file báo cáo nào trong thư mục: {p}")
                        return
                    print(f"📂 Nạp file báo cáo aggregate tĩnh: {json_files[0].name}")
                    with open(json_files[0], "r", encoding="utf-8") as f:
                        report_data = {"aggregate": json.load(f)}
            elif p.is_file() and p.suffix == ".csv":
                print(f"📂 Nạp dữ liệu per-row ({p.name}) & tính toán lại chỉ số theo logic mới...")
                df = pd.read_csv(p)
                evaluator = BenchmarkEvaluator()
                df = evaluator._add_non_llm_metrics(df)
                agg = evaluator._aggregate(df)
                report_data = {"aggregate": agg}
            elif p.is_file() and p.suffix == ".json":
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    report_data = {"aggregate": data} if "overall" in data else data
            else:
                print(f"❌ Đường dẫn không hợp lệ: {p}")
                return

        agg = report_data.get("aggregate", report_data)
        overall = agg.get("overall", {})
        by_cat = agg.get("by_category", {})
        total_rows = agg.get("total_rows", 0)
        failed = agg.get("failed_invocations", 0)

        print("\n" + "="*100)
        print("📊 AGENTIC RAG BENCHMARK EXECUTIVE DASHBOARD".center(100))
        print("="*100)
        
        lat_mean = overall.get("latency", {}).get("mean", 0.0)
        lat_p95 = overall.get("latency", {}).get("p95", 0.0)
        print(f"📌 Tổng số mẫu: {total_rows} | ❌ Thất bại: {failed} | ⏱️ Latency Trung Bình: {lat_mean:.2f}s (p95: {lat_p95:.2f}s)\n")

        # 1. QUALITY METRICS
        print("🎯 1. CHẤT LƯỢNG RAGAS & JUDGE EVALUATION (0.0 - 1.0)")
        print("┌──────────────────────────────────────────────┬──────────┬──────────┬──────────┬──────────┐")
        print("│ Metric                                       │   Mean   │  Median  │ P5(Sàn)  │ % < 0.5  │")
        print("├──────────────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┤")
        q_labels = [
            ("faithfulness", "🟢 Faithfulness (Độ trung thực)"),
            ("answer_correctness", "🟢 Answer Correctness (Độ chính xác)"),
            ("answer_relevancy", "🟢 Answer Relevancy (Độ liên quan)"),
            ("context_precision", "🔵 Context Precision (Độ đúng)*"),
            ("context_recall", "🔵 Context Recall (Độ phủ context)*"),
            ("tool_selection_accuracy", "🛠️ Tool Selection Accuracy"),
            ("tool_arg_accuracy", "🛠️ Tool Argument Accuracy"),
            ("e2e_score", "🎯 E2E Score (Answer + Tool)")
        ]
        for key, label in q_labels:
            m = overall.get(key, {})
            mean_v = f"{m.get('mean', 0.0):.4f}" if m and m.get('mean') is not None else "  N/A   "
            med_v = f"{m.get('median', 0.0):.4f}" if m and m.get('median') is not None else "  N/A   "
            p5_v = f"{m.get('p5', 0.0):.4f}" if m and m.get('p5') is not None else "  N/A   "
            pct_v = f"{m.get('pct_below_05', 0.0):5.1f}%" if m and m.get('pct_below_05') is not None else " N/A  "
            print(f"│ {label:<44} │  {mean_v}  │  {med_v}  │  {p5_v}  │  {pct_v}   │")
        print("└──────────────────────────────────────────────┴──────────┴──────────┴──────────┴──────────┘")
        print("💡 *Ghi chú: Context Precision & Recall được tính thuần túy trên nhóm câu có Retrieval (tool_calls > 0),")
        print("   loại bỏ nhiễu từ các câu hỏi không cần tool như ambiguous / attack.\n")

        # 2. PERFORMANCE & TOKENS
        print("⚡ 2. HIỆU NĂNG & TÀI NGUYÊN (PERFORMANCE & TOKENS)")
        print("┌──────────────────────────────────────────────┬──────────┬──────────┬──────────┐")
        print("│ Metric                                       │   Mean   │  Median  │   P95    │")
        print("├──────────────────────────────────────────────┼──────────┼──────────┼──────────┤")
        print(f"│ ⏱️ Latency (Giây)                            │  {lat_mean:6.2f}s │  {overall.get('latency',{}).get('median',0.0):6.2f}s │  {lat_p95:6.2f}s │")
        print(f"│ 📥 Input Tokens                              │ {overall.get('input_tokens',{}).get('mean',0.0):8.1f} │ {overall.get('input_tokens',{}).get('median',0.0):8.1f} │ {overall.get('input_tokens',{}).get('p95',0.0):8.1f} │")
        print(f"│ 📤 Output Tokens                             │ {overall.get('output_tokens',{}).get('mean',0.0):8.1f} │ {overall.get('output_tokens',{}).get('median',0.0):8.1f} │ {overall.get('output_tokens',{}).get('p95',0.0):8.1f} │")
        print(f"│ 🧮 Total Tokens                              │ {overall.get('total_tokens',{}).get('mean',0.0):8.1f} │ {overall.get('total_tokens',{}).get('median',0.0):8.1f} │ {overall.get('total_tokens',{}).get('p95',0.0):8.1f} │")
        print("└──────────────────────────────────────────────┴──────────┴──────────┴──────────┘")
        # Tổng token toàn bộ benchmark
        in_sum = overall.get('input_tokens_sum', 0)
        out_sum = overall.get('output_tokens_sum', 0)
        tot_sum = overall.get('total_tokens_sum', 0)
        print(f"📦 Tổng token toàn benchmark ({total_rows} mẫu): Input = {in_sum:,} | Output = {out_sum:,} | Total = {tot_sum:,}\n")

        # 3. TOOL DIST
        t_dist = overall.get("tool_calls_dist", {})
        print("🛠️ 3. PHÂN BỐ SỐ LẦN GỌI TOOL (TOOL CALLS DISTRIBUTION)")
        print("┌────────────────────────┬──────────┬────────────┐")
        print("│ Mức gọi Tool           │ Số lượng │ Tỷ lệ (%)  │")
        print("├────────────────────────┼──────────┼────────────┤")
        labels = [("0", "⚪ 0 Tool (Direct Answer)"), ("1", "🔵 1 Tool Call"), ("2", "🟡 2 Tool Calls"), ("3+", "🔴 3+ Tool Calls")]
        for k, lbl in labels:
            cnt = t_dist.get(k, 0)
            pct = (cnt / total_rows * 100) if total_rows > 0 else 0
            print(f"│ {lbl:<22} │   {cnt:5d}  │   {pct:5.1f}%   │")
        print("└────────────────────────┴──────────┴────────────┘\n")

        # 4. CATEGORY BREAKDOWN MATRIX
        if by_cat:
            print("="*136)
            print("📊 BENCHMARK METRICS BY CATEGORY BREAKDOWN".center(136))
            print("="*136)
            print("┌──────────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬────────────┬───────────────┬────────────┬───────────────────┐")
            print("│ Category         │ Faithfulness│ Correctness │  Relevancy  │ Context Prec│ Context Rec │ Tool Select│ Tool Arg Acc  │ E2E Score  │ Avg Tool │ Tool Dist       │")
            print("├──────────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼────────────┼───────────────┼────────────┼──────────┼───────────────────┤")
            for cat, metrics in sorted(by_cat.items()):
                f_val = metrics.get("faithfulness")
                c_val = metrics.get("answer_correctness")
                r_val = metrics.get("answer_relevancy")
                cp_val = metrics.get("context_precision")
                cr_val = metrics.get("context_recall")
                ts_val = metrics.get("tool_selection_accuracy")
                ta_val = metrics.get("tool_arg_accuracy")
                e2e_val = metrics.get("e2e_score")
                lat_v = metrics.get("latency", 0.0) or 0.0
                tc_v = metrics.get("tool_calls_total", 0.0) or 0.0

                td = metrics.get("tool_calls_dist", {})
                td_str = f"{td.get('0', 0)}/{td.get('1', 0)}/{td.get('2', 0)}/{td.get('3+', 0)}"

                def fmt(v): return f"{v:6.4f}" if v is not None else "  N/A "
                print(f"│ {cat:<16} │   {fmt(f_val)}    │   {fmt(c_val)}    │   {fmt(r_val)}    │   {fmt(cp_val)}    │   {fmt(cr_val)}    │  {fmt(ts_val)}  │   {fmt(ta_val)}    │  {fmt(e2e_val)}  │  {tc_v:6.2f}  │ {td_str:^17} │")
            print("└──────────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴────────────┴───────────────┴────────────┴──────────┴───────────────────┘\n")


def print_table(report_data: Union[dict, str, Path] = "benchmark_results"):
    """Hàm helper 1 dòng lệnh để in Báo cáo Mẫu 3.
    Ví dụ:
        print_table()                       # Tự động quét file mới nhất trong 'benchmark_results'
        print_table("benchmark_results")    # Chỉ định thư mục
        print_table("benchmark_results/aggregate_report_xxx.json") # Chỉ định file cụ thể
        print_table(report)                 # Nhận dict từ memory
    """
    BenchmarkEvaluator.print_pretty_report(report_data)