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


from src.d_tools import(
    product_search,
    product_compare,
    check_stock,
    policy_search,
    order_lookup
)

from src.d_tools import (
    PRODUCT_SEARCH_SCHEMA,
    PRODUCT_COMPARE_SCHEMA,
    CHECK_STOCK_SCHEMA,
    POLICY_SEARCH_SCHEMA,
    ORDER_LOOKUP_SCHEMA
)

from src.f_prompts import (
    FULL_MASTER_PROMPT,
    FULL_REJECTION_PROMPT
)

from app.core.security import verify_supabase_jwt

llm_service = LLMService(settings, config)
guardrail_call = GuardrailCall(llm_service, config)
master_agent = MasterAgent(llm_service, config)


class RetrievedChunk(TypedDict):
    content: str
    source: str
    score: float
    chunk_type: str

class AgentState(TypedDict):

    # 1. INput user
    user_input: str
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
    tool_calls_used: Annotated[list[str], operator.add]  # ⚡ Reducer cộng dồn tool đã gọi
    iteration_count: int                     # Đếm số lần lặp chống infinite loop

    # 6. Hội thoại
    messages: Annotated[list, add_messages]  # ⚡ Reducer cộng dồn tin nhắn
    conversation_state: dict

    # 7. Output
    final_answer: Optional[str]
    cited_sources: list[str]
    ticket_id: Optional[str]

    # 8. Thống kê
    input_tokens: Annotated[int, operator.add]
    output_tokens: Annotated[int, operator.add]
    latency: Annotated[float, operator.add]
    total_tokens: Annotated[int, operator.add]
    



def receive_node(state: AgentState) -> dict:
    """
    [NODE 1] Receive & Auth Check:
    Nhận request, giải mã JWT Token thực tế qua Supabase Auth API.
    """
    query = state.get("user_query", "").strip()
    token = state.get("user_token")
    user_id = None

    if token:
        user_id = verify_supabase_jwt(token)

    if user_id:
        return {
            "user_id": user_id,
            "is_authenticated": True,
            "messages": [
                {
                    "role": "user",
                    "content": query
                }
            ]
        }
    else:
        return {
            "user_id": None,
            "is_authenticated": False,
            "messages": [
                {
                    "role": "user",
                    "content": query
                }
            ]
        }

def guardrail_node(state: AgentState) -> dict:

    query = state["user_query"].lower()

    result = guardrail_call.invoke(query)
    
    risk_level  = result["risk_level"]
    latency = result["latency"]
    input_tokens = result["token"]['input']
    output_tokens = result["token"]['output']
    total_tokens = input_tokens + output_tokens

    return {
        "risk_level": risk_level,
        "latency": latency,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens
    }

def master_node(state: AgentState) -> dict:
    """
    [NODE 3] Master Agent (Tư duy):
    """

    risk_level = state["risk_level"]

    if 
    