from configs.setting import settings
from configs.GetConfig import config
import uuid
import operator
from typing import TypedDict, Literal, Optional, Annotated
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver

from src.LLMService import LLMService
from src.e_agents.guardrail_call import GuardrailCall
from src.e_agents.rejection_call import RejectionCall
from src.e_agents.master_agent import MasterAgent

from src.d_tools import(
    product_search,
    product_compare,
    policy_search,
    order_lookup
)

from src.d_tools import (
    PRODUCT_SEARCH_SCHEMA,
    PRODUCT_COMPARE_SCHEMA,
    POLICY_SEARCH_SCHEMA,
    ORDER_LOOKUP_SCHEMA
)

from src.f_prompts import (
    FULL_MASTER_PROMPT,
    FULL_REJECTION_PROMPT
)

from app.core.security import verify_supabase_jwt

from src.f_prompts.skills import load_skill, list_skills

#=================================================

available_tools = {
    "product_search": product_search,
    "product_compare": product_compare,
    "policy_search": policy_search,
    "order_lookup": order_lookup
}

tools_schema = [
    PRODUCT_SEARCH_SCHEMA,
    PRODUCT_COMPARE_SCHEMA,
    POLICY_SEARCH_SCHEMA,
    ORDER_LOOKUP_SCHEMA
]

#=================================================

def select_skill(query: str) -> str:
    """Chọn skill markdown phù hợp với câu hỏi. Có thể thay bằng LLM-call nhẹ sau này."""
    q = (query or "").lower()
    # Order / account
    if any(k in q for k in ["đơn hàng", "order", "tra đơn", "mua hàng"]):
        return load_skill("account/order_lookup") or ""
    # Policy
    if any(k in q for k in ["chính sách", "đổi trả", "bảo hành", "trả góp", "giao hàng", "vận chuyển"]):
        return load_skill("policy/policy_search") or ""
    # Compare (named products)
    if any(k in q for k in ["so sánh", "nên chọn", "hay hơn"]):
        return load_skill("product/compare") or load_skill("product/single_spec") or ""
    # Ambiguous / vague
    if any(k in q for k in ["tư vấn", "gợi ý", "nên mua", "máy nào", "con nào", "tầm giá"]):
        return load_skill("product/ambiguous") or ""
    # Single specific spec / price / stock
    if any(k in q for k in ["bao nhiêu", "giá", "tồn kho", "chip", "ram", "pin", "màn hình", "camera", "bộ nhớ"]):
        return load_skill("product/single_spec") or ""
    # Default: ambiguous / general guidance
    return load_skill("product/ambiguous") or ""



#=================================================

llm_service = LLMService(settings, config)
guardrail_call = GuardrailCall(llm_service, config)
rejection_call = RejectionCall(llm_service, config)
master_agent = MasterAgent(llm_service, config)

#=================================================

class RetrievedChunk(TypedDict):
    content: str
    source: str
    score: float
    chunk_type: str

class AgentState(TypedDict):

    # 1. INput user
    user_query: str
    session_id: str

    # 2. Auth
    user_token: Optional[str]
    user_id: Optional[str]
    is_authenticated: bool

    # 3. Guardrail & Quality
    risk_level: Optional[str]               # "low" | "medium" | "high"
    relevance_score: float                   # Dùng cho self-check Corrective RAG

    # 4. Router (Định tuyến)
    intent: str                              # Kết quả phân loại: 'product', 'policy', 'account', 'support'
    selected_agent: Optional[str]            # Quyết định Nút xử lý tiếp theo

    # 5. Retrieval & Tools
    retrieved_context: list[RetrievedChunk]
    tool_calls_used: Annotated[list[dict], operator.add]  # ⚡ Reducer cộng dồn lịch sử tool calls (mỗi dict = {tool, args, response?})
    iteration_count: int                     # Đếm số lần lặp chống infinite loop

    # 6. Hội thoại
    messages: Annotated[list, add_messages]  # ⚡ Reducer cộng dồn tin nhắn
    conversation_state: dict

    # 7. Output
    final_answer: Optional[str]
    cited_sources: list[str]
    ticket_id: Optional[str]
    show_popup: bool

    # 8. Thống kê
    input_tokens: Annotated[int, operator.add]
    output_tokens: Annotated[int, operator.add]
    latency: Annotated[float, operator.add]
    total_tokens: Annotated[int, operator.add]
    

#=================================================

def receive_node(state: AgentState) -> dict:
    query = state.get("user_query", "").strip()
    token = state.get("user_token")
    user_id = None

    if token:
        user_id = verify_supabase_jwt(token)
    
    is_authenticated = True if user_id else False
 
    return {
        "user_id": user_id,
        "is_authenticated": is_authenticated,
        "user_query": query  
    }

#=================================================

def guardrail_node(state: AgentState) -> dict:
    query = state["user_query"]
    
    result = guardrail_call.invoke(query)
    risk_level = result["risk_level"]
    
    # Chỉ lưu tin nhắn khi KHÔNG phải attack
    if risk_level != "attack":
        return {
            "risk_level": risk_level,
            "show_popup": False,
            "messages": [
                {
                    "role": "user",
                    "content": query
                }
            ],
            "latency": result["latency"],
            "input_tokens": result["tokens"]["input"],
            "output_tokens": result["tokens"]["output"],
            "total_tokens": result["tokens"]["input"] + result["tokens"]["output"]
        }
    else:
        # Attack → KHÔNG lưu
        return {
            "risk_level": risk_level,
            "show_popup": True,
            "latency": result["latency"],
            "input_tokens": result["tokens"]["input"],
            "output_tokens": result["tokens"]["output"],
            "total_tokens": result["tokens"]["input"] + result["tokens"]["output"]
        }

#=================================================

def rejection_node(state: AgentState) -> dict:
    """
    [NODE] Rejection Agent (Từ chối):
    - Chỉ chạy khi risk_level == "needs_ticket"
    - Trả về câu từ chối lịch sự
    - KHÔNG lưu tin nhắn vào messages (đã lưu ở guardrail_node)
    """
    
    query = state["user_query"]

    result = rejection_call.invoke(query)

    return {
        "final_answer": result["content"],
        "show_popup": True,
        "input_tokens": result["tokens"]["input"],
        "output_tokens": result["tokens"]["output"],
        "total_tokens": result["tokens"]["input"] + result["tokens"]["output"],
        "latency": result["latency"]
    }
    

#=================================================

def master_node(state: AgentState) -> dict:
    """
    [NODE 3] Master Agent (Tư duy):
    - Chỉ chạy khi risk_level != "attack"
    - Build messages: system prompt + lịch sử tool calls được inject giữa các lượt hội thoại
      (mỗi lượt user sau lượt 1 sẽ nhìn thấy tool/tham số đã gọi ở lượt trước)
    - messages chỉ lưu user query và assistant final answer
    - tool_calls_used: list[dict] lưu lịch sử tool calls theo thứ tự lượt hội thoại
    """
    import json

    def _fmt_search_context(record):
        """Tóm tắt bộ lọc product_search đã dùng ở lượt trước, dùng skill common/multi_turn_context.md."""
        if not record or record.get("tool") != "product_search":
            return ""
        args = record.get("args", {})
        queries = args.get("queries", [])
        if not queries:
            return ""
        q = queries[0]
        out = str(record.get("output", ""))
        n_items = 0
        if "Dòng:" in out:
            n_items = out.count("Dòng:")
        elif "Product:" in out:
            n_items = out.count("Product:")
        summary = f"{n_items} dòng" if "Dòng:" in out else (f"{n_items} sản phẩm" if "Product:" in out else "kết quả")
        skill = load_skill("common/multi_turn_context") or ""
        return skill.format(
            previous_query=json.dumps(q, ensure_ascii=False),
            result_summary=summary
        )

    tool_history = state.get("tool_calls_used") or []
    last_search_record = None
    for rec in reversed(tool_history):
        if rec.get("tool") == "product_search":
            last_search_record = rec
            break

    full_messages = [{"role": "system", "content": FULL_MASTER_PROMPT}]
    user_count = 0
    for msg in state["messages"]:
        role = msg.get("role") if isinstance(msg, dict) else getattr(msg, "type", "")
        if role == "user":
            user_count += 1
            if user_count > 1 and last_search_record:
                note = _fmt_search_context(last_search_record)
                if note:
                    full_messages.append({"role": "system", "content": note})
        full_messages.append(msg)

    auth_context = {
        "user_id": state.get("user_id"),
        "user_token": state.get("user_token")
    }

    user_query = state.get("user_query", "")
    skill_text = select_skill(user_query)
    if skill_text:
        print(f"🧩 Injected skill for query: {user_query[:60]}...")

    result = master_agent.invoke(
        messages=full_messages,
        available_tools=available_tools,
        tools_schema=tools_schema,
        auth_context=auth_context,
        skill=skill_text
    )

    new_tool_records = result.get("tool_context") or []

    assistant_msg = {
        "role": "assistant",
        "content": result["content"]
    }

    conversation_state = state.get("conversation_state") or {}
    found_new_search = False
    for rec in reversed(new_tool_records):
        if rec.get("tool") == "product_search":
            conversation_state["last_product_search"] = rec
            found_new_search = True
            break
    if not found_new_search and last_search_record:
        conversation_state["last_product_search"] = last_search_record

    return {
        "final_answer": result["content"],
        "messages": [assistant_msg],
        "tool_calls_used": new_tool_records,
        "conversation_state": conversation_state,
        "input_tokens": result["tokens"]["input"],
        "output_tokens": result["tokens"]["output"],
        "total_tokens": result["tokens"]["input"] + result["tokens"]["output"],
        "latency": result["latency"]
    }


#=================================================  

builder = StateGraph(AgentState)

builder.add_node("receive_node", receive_node)
builder.add_node("guardrail_node", guardrail_node)
builder.add_node("rejection_node", rejection_node)
builder.add_node("master_node", master_node)

def route_after_guardrail(state: AgentState) -> str:
    """Hàm quyết định Nút tiếp theo dựa vào kết quả của Guardrail"""
    risk = state.get("risk_level", "safe")
    
    if risk == "attack":
        return "rejection_node"
    else:    
        return "master_node"


builder.add_edge(START, "receive_node")
builder.add_edge("receive_node", "guardrail_node")
builder.add_conditional_edges(
    "guardrail_node",
    route_after_guardrail,
    {
        "rejection_node": "rejection_node", 
        "master_node": "master_node"       
    }
)
builder.add_edge("rejection_node", END)
builder.add_edge("master_node", END)

memory = MemorySaver()
app = builder.compile(checkpointer=memory)
