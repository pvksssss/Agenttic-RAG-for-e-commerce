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

from ragas import evaluate as ragas_evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.metrics import faithfulness, answer_correctness, context_precision, context_recall

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
    scores, weights = [], []
    for k, matcher in _KEY_MATCHERS.items():
        if k in exp_q or k in act_q:
            w = 1.5 if k in ("brand", "category", "name_contains", "min_price", "max_price") else 1.0
            scores.append(matcher(exp_q.get(k), act_q.get(k)))
            weights.append(w)
    return sum(s * w for s, w in zip(scores, weights)) / sum(weights) if scores else 0.0


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
    """Judge có thể chạy Groq (Llama/GPT-OSS) hoặc Gemini (Gemma)."""

    def __init__(
        self,
        provider: str = "groq",
        model: Optional[str] = None,
        llm_service: Any = None,
        gemini_key_manager: Optional[Any] = None,
        temperature: float = 0.0,
        max_retries: int = 5,
    ):
        self.provider = provider.lower()
        self.temperature = temperature
        self.max_retries = max_retries
        self.llm_service = llm_service
        self.gemini_key_manager = gemini_key_manager

        if self.provider == "gemini":
            if not settings or not settings.GEMINI_API_KEY:
                raise ValueError("Cần GEMINI_API_KEY để dùng Gemini judge")
            from google import genai
            self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
            if model is None:
                if app_config and len(app_config.llm.google.available) > 2:
                    model = app_config.llm.google.available[2]
                else:
                    model = "gemma-4-26b-a4b-it"
            self.model = model
        elif self.provider == "groq":
            if not settings or not settings.GROQ_API_KEY:
                raise ValueError("Cần GROQ_API_KEY để dùng Groq judge")
            import openai
            self.client = openai.OpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1", timeout=60)
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

    def _rotate_groq(self) -> bool:
        """Xoay sang Groq API Key tiếp theo khi bị Rate Limit (TPD / TPM)."""
        keys = self._get_groq_keys()
        if len(keys) > 1:
            curr = getattr(self, "_groq_key_idx", 0)
            nxt = (curr + 1) % len(keys)
            self._groq_key_idx = nxt
            new_key = keys[nxt]
            if settings:
                settings.GROQ_API_KEY = new_key
            import openai
            self.client = openai.OpenAI(api_key=new_key, base_url="https://api.groq.com/openai/v1", timeout=60)
            cycled = nxt <= curr
            if cycled:
                print(f"   🔁 Groq key rotated to {nxt + 1}/{len(keys)} (full cycle). Chờ 60s...")
                time.sleep(60)
            else:
                print(f"   🔁 Groq key rotated to {nxt + 1}/{len(keys)}.")
            return True
        return False

    def _rotate_gemini(self) -> bool:
        if not self.gemini_key_manager or not settings:
            return False
        prev = self.gemini_key_manager.current_index
        new_key = self.gemini_key_manager.rotate()
        settings.GEMINI_API_KEY = new_key
        if self.llm_service:
            self.llm_service._gemini_client = None
        from google import genai
        self.client = genai.Client(api_key=new_key)
        cycled = self.gemini_key_manager.current_index <= prev
        if cycled:
            print(f"   🔁 Gemini key rotated to {self.gemini_key_manager.current_index + 1}/{len(self.gemini_key_manager)} (full cycle). Chờ 60s...")
            time.sleep(60)
        else:
            print(f"   🔁 Gemini key rotated to {self.gemini_key_manager.current_index + 1}/{len(self.gemini_key_manager)}.")
        return True

    def _call(self, messages: List[Dict[str, str]]) -> str:
        attempt = 0
        while attempt < self.max_retries:
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
                    if self.provider == "gemini" and self.gemini_key_manager and len(self.gemini_key_manager) > 1:
                        if self._rotate_gemini():
                            attempt += 1
                            continue
                    elif self.provider == "groq":
                        if self._rotate_groq():
                            attempt += 1
                            continue
                    print(f"   ⏳ Judge rate limit ({self.provider}): {err}. Chờ 60s rồi retry...")
                    time.sleep(60)
                else:
                    if attempt < self.max_retries - 1:
                        time.sleep(2 ** attempt)
                    else:
                        raise
                attempt += 1
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
        if ground_truth and len(ground_truth) > max_gt_chars:
            ground_truth = ground_truth[:max_gt_chars] + "..."
        prompt = f"""Bạn là trọng tài khách quan. Chấm điểm 0.0-1.0 cho 5 metric sau.

Câu hỏi: {question}
Câu trả lời: {answer}
Ground truth: {ground_truth}
Ngữ cảnh truy xuất:
{ctx}

Rubric cho từng metric (chấm theo 3 mức: 0.0 / 0.5 / 1.0 hoặc giữa):

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
        return {
            "faithfulness": max(0.0, min(1.0, float(data.get("faithfulness", 0.0)))),
            "answer_correctness": max(0.0, min(1.0, float(data.get("answer_correctness", 0.0)))),
            "answer_relevancy": max(0.0, min(1.0, float(data.get("answer_relevancy", 0.0)))),
            "context_precision": max(0.0, min(1.0, float(data.get("context_precision", 0.0)))),
            "context_recall": max(0.0, min(1.0, float(data.get("context_recall", 0.0)))),
            "reason": str(data.get("reason", "")),
        }


# ---------------------------------------------------------------------------
# RAGAS runner
# ---------------------------------------------------------------------------
class RAGASRunner:
    def __init__(self, model: Optional[str] = None, api_key: Optional[str] = None):
        if not settings or not settings.GROQ_API_KEY:
            raise ValueError("Cần GROQ_API_KEY cho RAGAS judge")
        model = model or (app_config.llm.groq.available[0] if app_config and app_config.llm.groq.available else "llama-3.3-70b-versatile")
        llm = ChatOpenAI(model=model, api_key=api_key or settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1", temperature=0, timeout=120, max_retries=2)
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
                    res = ragas_evaluate(ds_in, metrics=metric_list, llm=self.llm, embeddings=self.emb)
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
        if llm_service and load_keys_from_settings and settings:
            keys = load_keys_from_settings(settings, "GEMINI")
            if keys:
                self.gemini_key_manager = GeminiKeyManager(keys)

        self.judge = JudgeLLM(
            provider=judge_provider,
            model=judge_model,
            llm_service=llm_service,
            gemini_key_manager=self.gemini_key_manager,
        )
        self.ragas = RAGASRunner(model=ragas_model) if use_ragas else None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def run_and_evaluate(
        self,
        app: Any,
        benchmark: Union[str, Path, List[Dict[str, Any]]],
        output_dir: Optional[Union[str, Path]] = "benchmark_results",
        max_samples: Optional[int] = None,
        user_token: Optional[str] = None,
    ) -> Dict[str, Any]:
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
        records = self._load(benchmark, max_samples)
        output_dir = Path(output_dir) if output_dir else Path(".")
        output_dir.mkdir(parents=True, exist_ok=True)

        token_to_use = user_token if user_token is not None else self.user_token
        apps = app if isinstance(app, dict) else {"default": app}
        all_results = []
        for wf_name, wf_app in apps.items():
            print(f"\n🚀 Running workflow: {wf_name} ({len(records)} records) | Auth Token: {'YES' if token_to_use else 'NONE (Guest)'}")
            wf_res = []
            for r in tqdm(records, desc=f"  {wf_name}", unit="record"):
                res = self._run_record(wf_app, r, wf_name, user_token=token_to_use)
                wf_res.append(res)
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
            self._save_jsonl(wf_res, output_dir / f"raw_{wf_name}_{int(time.time())}.jsonl")

        if len(apps) > 1:
            self._save_jsonl(all_results, output_dir / f"raw_all_{int(time.time())}.jsonl")
        return all_results

    def evaluate(
        self,
        raw_results: Union[str, Path, List[Dict[str, Any]]],
        output_dir: Optional[Union[str, Path]] = "benchmark_results",
    ) -> Dict[str, Any]:
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
            for i, turn in enumerate(record["turns"]):
                q = turn.get("question", "")
                print(f"      🔄 {record.get('id','?')} turn {i+1}/{len(record['turns'])}: {q[:80]}...")
                state, elapsed = self._invoke(app, q, tid, user_token=user_token)
                res = self._extract_result(state, turn, elapsed, prev_tok, prev_lat, prev_calls, prev_outs)
                prev_tok, prev_lat, prev_calls, prev_outs = (
                    res["cumulative_total_tokens"],
                    res["cumulative_latency"],
                    res["cumulative_actual_tool_calls"],
                    res["cumulative_tool_outputs"],
                )
                print(f"         → ans_len={len(str(res.get('final_answer','')))} tools={len(res.get('actual_tool_calls',[]))} latency={elapsed:.2f}s")
                turns_res.append({"turn": i + 1, **res})
            return {**base, "question": None, "turns": turns_res, "raw_record": record}
        else:
            state, elapsed = self._invoke(app, record.get("question", ""), tid, user_token=user_token)
            res = self._extract_result(state, record, elapsed, 0, 0.0, [], [])
            return {**base, **res, "raw_record": record}

    def _invoke(self, app: Any, question: str, thread_id: str, user_token: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], float]:
        attempt = 0
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
                if is_rate and self.gemini_key_manager and self.llm_service:
                    prev = self.gemini_key_manager.current_index
                    new_key = self.gemini_key_manager.rotate()
                    self.llm_service.settings.GEMINI_API_KEY = new_key
                    self.llm_service._gemini_client = None
                    cycled = self.gemini_key_manager.current_index <= prev
                    print(f"   🔑 Rotated Gemini key to {self.gemini_key_manager.current_index + 1}/{len(self.gemini_key_manager)}")
                    if cycled:
                        print("   ⏳ All Gemini keys tried. Chờ 60s...")
                        time.sleep(60)
                    continue
                if is_rate:
                    print("   ⏳ Rate limit. Chờ 60s...")
                    time.sleep(60)
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
                "error": "invoke_failed",
            }

        all_calls, all_outs = _extract_tool_calls(state)
        total_tokens = state.get("total_tokens", 0) or 0
        latency = state.get("latency", 0.0) or 0.0
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
            "input_tokens": state.get("input_tokens", 0) or 0,
            "output_tokens": state.get("output_tokens", 0) or 0,
        }

    # ------------------------------------------------------------------
    # Evaluation internals
    # ------------------------------------------------------------------
    def _build_rows(self, raw_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = []
        for r in raw_results:
            if "turns" in r and r["turns"]:
                cum_outs = []
                for i, turn in enumerate(r["turns"]):
                    is_last = i == len(r["turns"]) - 1
                    cum_outs.extend(turn.get("tool_outputs", []))
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
                        "contexts": [c for c in cum_outs if c],
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
                            "contexts": [c for c in cum_outs if c],
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
                "expected_tool_calls": json.dumps(r["expected_tool_calls"], ensure_ascii=False),
                "actual_tool_calls": json.dumps(r["actual_tool_calls"], ensure_ascii=False),
                "faithfulness": _val("faithfulness"),
                "answer_correctness": _val("answer_correctness"),
                "context_precision": _val("context_precision"),
                "context_recall": _val("context_recall"),
                "answer_relevancy": _val("answer_relevancy"),
                "judge_reason": j.get("reason", ""),
            })
        return pd.DataFrame(out)

    def _add_non_llm_metrics(self, df: pd.DataFrame) -> pd.DataFrame:
        """Thêm các metric deterministic (không phụ thuộc LLM judge)."""
        df = df.copy()
        act_list = df["actual_tool_calls"].apply(lambda x: json.loads(x) if isinstance(x, str) else x)
        n_calls = [len(act) if isinstance(act, list) else 0 for act in act_list]
        df["tool_calls_total"] = n_calls
        return df

    def _aggregate(self, df: pd.DataFrame) -> Dict[str, Any]:
        # 5 RAGAS/Judge metrics
        quality_metrics = [
            "faithfulness", "answer_correctness", "answer_relevancy",
            "context_precision", "context_recall",
        ]
        # Performance metrics (scalar stats)
        perf_metrics = ["latency", "tool_calls_total", "total_tokens", "input_tokens", "output_tokens"]
        all_metrics = quality_metrics + perf_metrics

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

        def _calc_metric_stats(sub_df, metric):
            if metric in ("context_precision", "context_recall") and "tool_calls_total" in sub_df.columns:
                valid_sub = sub_df[sub_df["tool_calls_total"] > 0]
                if not valid_sub.empty:
                    return _stats(valid_sub, metric)
                return {"mean": None, "median": None, "p5": None, "p95": None, "pct_below_05": None}
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
            ("context_recall", "🔵 Context Recall (Độ phủ context)*")
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
        print("└──────────────────────────────────────────────┴──────────┴──────────┴──────────┘\n")

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
            print("┌──────────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬────────────┬───────────────┬───────────────────┐")
            print("│ Category         │ Faithfulness│ Correctness │  Relevancy  │ Context Prec│ Context Rec │ Latency(s) │ Avg Tool Call │ Tool Dist(0/1/2/3+)│")
            print("├──────────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼────────────┼───────────────┼───────────────────┤")
            for cat, metrics in sorted(by_cat.items()):
                f_val = metrics.get("faithfulness")
                c_val = metrics.get("answer_correctness")
                r_val = metrics.get("answer_relevancy")
                cp_val = metrics.get("context_precision")
                cr_val = metrics.get("context_recall")
                lat_v = metrics.get("latency", 0.0) or 0.0
                tc_v = metrics.get("tool_calls_total", 0.0) or 0.0
                
                td = metrics.get("tool_calls_dist", {})
                td_str = f"{td.get('0', 0)}/{td.get('1', 0)}/{td.get('2', 0)}/{td.get('3+', 0)}"
                
                f_s = f"{f_val:6.4f}" if f_val is not None else "  N/A "
                c_s = f"{c_val:6.4f}" if c_val is not None else "  N/A "
                r_s = f"{r_val:6.4f}" if r_val is not None else "  N/A "
                cp_s = f"{cp_val:6.4f}" if cp_val is not None else "  N/A "
                cr_s = f"{cr_val:6.4f}" if cr_val is not None else "  N/A "
                print(f"│ {cat:<16} │   {f_s}    │   {c_s}    │   {r_s}    │   {cp_s}    │   {cr_s}    │  {lat_v:6.2f}s  │    {tc_v:6.2f}     │   {td_str:^15} │")
            print("└──────────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴────────────┴───────────────┴───────────────────┘\n")


def print_table(report_data: Union[dict, str, Path] = "benchmark_results"):
    """Hàm helper 1 dòng lệnh để in Báo cáo Mẫu 3.
    Ví dụ:
        print_table()                       # Tự động quét file mới nhất trong 'benchmark_results'
        print_table("benchmark_results")    # Chỉ định thư mục
        print_table("benchmark_results/aggregate_report_xxx.json") # Chỉ định file cụ thể
        print_table(report)                 # Nhận dict từ memory
    """
    BenchmarkEvaluator.print_pretty_report(report_data)