"""
====================================================================
📌 LANGGRAPH WORKFLOW (PHIÊN BẢN THỰC TẾ - PRODUCTION READY BASE)
====================================================================
File này lắp ráp Đồ thị Trạng thái (StateGraph) tích hợp trực tiếp với
các Tools thực tế trong src/d_tools và xử lý luồng xác thực JWT Supabase,
Guardrail UI Handover và lưu trữ bộ nhớ phiên chat (MemorySaver).
"""

import uuid
import operator
from typing import TypedDict, Literal, Optional, Annotated
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver

# Import các Tools thực tế từ d_tools
from src.d_tools import (
    product_search,
    product_compare,
    check_stock,
    policy_search,
    order_lookup
)
from app.core.security import verify_supabase_jwt


# ====================================================================
# 1. ĐỊNH NGHĨA AGENT STATE (Bộ nhớ dùng chung chuẩn Doanh nghiệp)
# ====================================================================
class RetrievedChunk(TypedDict):
    content: str
    source: str
    score: float
    chunk_type: str


class AgentState(TypedDict):
    # 1. Input
    user_query: str
    session_id: str

    # 2. Auth (Thông tin xác thực)
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


# ====================================================================
# 2. ĐỊNH NGHĨA CÁC NÚT THỰC TẾ (REAL WORKFLOW NODES)
# ====================================================================

def receive_node(state: AgentState) -> dict:
    """
    [NODE 1] Receive & Auth Check:
    Nhận request, giải mã JWT Token thực tế qua Supabase Auth API.
    """
    print("\n===== 📥 [NODE 1] RECEIVE & AUTH CHECK =====")
    query = state.get("user_query", "").strip()
    token = state.get("user_token")
    user_id = None

    if token:
        # Xác thực Token trực tuyến qua Supabase API
        user_id = verify_supabase_jwt(token)
        # Hỗ trợ Mock Token cho môi trường test offline
        if not user_id and "mock" in token.lower():
            user_id = "usr_test_offline_123"

    if user_id:
        print(f"🔑 Auth Success: Valid User ID = '{user_id}'")
        return {
            "is_authenticated": True,
            "user_id": user_id,
            "messages": [{"role": "user", "content": query}]
        }
    else:
        print("👤 Anonymous User: Accessing public flow.")
        return {
            "is_authenticated": False,
            "user_id": None,
            "messages": [{"role": "user", "content": query}]
        }


def guardrail_node(state: AgentState) -> dict:
    """
    [NODE 2] Guardrail Assessment:
    Đánh giá mức độ rủi ro của câu hỏi (khiếu nại, lỗi phần cứng, hoàn tiền).
    """
    print("\n===== 🛡️ [NODE 2] GUARDRAIL ASSESSMENT =====")
    query = state["user_query"].lower()

    # Từ khóa rủi ro cao cần chuyển giao sang Nút UI Ticket
    high_risk_keywords = ["lỗi màn hình", "hoàn tiền", "khiếu nại", "đổi trả gấp", "hỏng máy", "lừa đảo"]
    if any(k in query for k in high_risk_keywords):
        print("⚠️ Risk Level: HIGH ➡️ Trigger UI Ticket Handover!")
        return {"risk_level": "high"}
    
    print("✅ Risk Level: LOW ➡️ Proceeding to Router Node.")
    return {"risk_level": "low"}


def router_node(state: AgentState) -> dict:
    """
    [NODE 3] Intent Router:
    Phân loại ý định khách hàng và chuyển giao sang Nút chuyên trách.
    """
    print("\n===== 🔀 [NODE 3] INTENT ROUTER =====")
    query = state["user_query"].lower()
    risk = state.get("risk_level", "low")

    # 1. Rủi ro cao ➡️ Chuyển giao sang Nút UI Ticket
    if risk == "high":
        return {"intent": "support", "selected_agent": "ui_ticket"}

    # 2. Ý định tra cứu đơn hàng cá nhân
    if any(k in query for k in ["đơn hàng", "tôi đã mua", "lịch sử mua", "đơn của tôi", "vận chuyển"]):
        return {"intent": "account", "selected_agent": "account"}

    # 3. Ý định hỏi về sản phẩm, tồn kho, so sánh
    if any(k in query for k in ["giá", "còn hàng", "tồn kho", "so sánh", "cấu hình", "laptop", "điện thoại", "iphone", "samsung", "asus", "oppo"]):
        return {"intent": "product", "selected_agent": "product"}

    # 4. Ý định hỏi về chính sách, thủ tục
    return {"intent": "policy", "selected_agent": "policy"}


def product_node(state: AgentState) -> dict:
    """
    [NODE 4A] Product Agent Node:
    Tích hợp thực tế các Tools: check_stock, product_compare, product_search.
    """
    print("\n===== 🛒 [NODE 4A] PRODUCT AGENT NODE =====")
    query = state["user_query"]
    query_lower = query.lower()
    tools_used = []
    sources = []
    answer = ""

    # Kịch bản 1: Khách hỏi Tồn kho / Giá thời gian thực
    if "còn hàng" in query_lower or "tồn kho" in query_lower:
        print("▶️ Calling Tool: check_stock")
        # Giả định bóc tách từ khóa sản phẩm từ câu hỏi
        search_kw = query.replace("còn hàng", "").replace("tồn kho", "").replace("không", "").replace("shop", "").strip()
        kw_list = [search_kw] if search_kw else ["iPhone 16"]
        
        tool_res = check_stock(product_names=kw_list)
        tools_used.append("check_stock")
        sources.append("Supabase Postgres: products table (real-time stock)")
        answer = f"Kết quả tra cứu tồn kho thực tế cho bạn:\n{tool_res}"

    # Kịch bản 2: Khách hỏi So sánh sản phẩm
    elif "so sánh" in query_lower:
        print("▶️ Calling Tool: product_compare")
        tool_res = product_compare(query=query)
        tools_used.append("product_compare")
        sources.append("Supabase Postgres: products specs JSONB")
        answer = f"Dưới đây là thông tin so sánh chi tiết:\n{tool_res}"

    # Kịch bản 3: Tìm kiếm sản phẩm theo nhu cầu (Default Product Search)
    else:
        print("▶️ Calling Tool: product_search")
        tool_res = product_search(query=query)
        tools_used.append("product_search")
        sources.append("ChromaDB: products_collection + Reranker")
        answer = f"Danh sách sản phẩm phù hợp với nhu cầu của bạn:\n{tool_res}"

    return {
        "final_answer": answer,
        "tool_calls_used": tools_used,
        "cited_sources": sources,
        "relevance_score": 0.95
    }


def policy_node(state: AgentState) -> dict:
    """
    [NODE 4B] Policy Agent Node:
    Tích hợp thực tế Tool: policy_search.
    """
    print("\n===== 📜 [NODE 4B] POLICY AGENT NODE =====")
    print("▶️ Calling Tool: policy_search")
    
    query = state["user_query"]
    tool_res = policy_search(query=query)
    
    return {
        "final_answer": f"Thông tin chính sách của shop:\n{tool_res}",
        "tool_calls_used": ["policy_search"],
        "cited_sources": ["ChromaDB: policies_collection"],
        "relevance_score": 0.90
    }


def account_node(state: AgentState) -> dict:
    """
    [NODE 4C] Account Agent Node:
    Kiểm tra xác thực & Tích hợp thực tế Tool: order_lookup.
    """
    print("\n===== 🔒 [NODE 4C] ACCOUNT AGENT NODE =====")
    
    # Chốt chặn Auth: Nếu chưa đăng nhập ➡️ Từ chối & Nhắc đăng nhập
    if not state.get("is_authenticated"):
        return {
            "final_answer": "Bạn vui lòng đăng nhập tài khoản để tra cứu thông tin đơn hàng cá nhân nhé!",
            "tool_calls_used": [],
            "cited_sources": []
        }

    print(f"▶️ Calling Tool: order_lookup for user_id='{state['user_id']}'")
    user_id = state["user_id"]
    token = state.get("user_token")
    
    tool_res = order_lookup(current_user_id=user_id, user_token=token)
    
    return {
        "final_answer": f"Thông tin đơn hàng của bạn:\n{tool_res}",
        "tool_calls_used": ["order_lookup"],
        "cited_sources": ["Supabase Postgres: orders table (RLS Enforcement)"],
        "relevance_score": 1.0
    }


def ui_ticket_node(state: AgentState) -> dict:
    """
    [NODE 4D] UI Ticket Handover Node:
    Guardrail hướng dẫn người dùng bấm nút [Tạo Ticket Hỗ Trợ] trên Web UI.
    """
    print("\n===== 🎫 [NODE 4D] UI TICKET HANDOVER NODE =====")
    answer = (
        "Yêu cầu khiếu nại/lỗi của bạn cần sự hỗ trợ trực tiếp từ bộ phận CSKH. "
        "Bạn vui lòng nhấn nút **[Tạo Ticket Hỗ Trợ]** ngay bên cạnh màn hình chat để đội ngũ kỹ thuật tiếp nhận và xử lý ngay nhé!"
    )
    return {
        "final_answer": answer,
        "tool_calls_used": [],
        "cited_sources": ["System Guardrail Policy"],
        "relevance_score": 1.0
    }


# ====================================================================
# 3. ĐỊNH NGHĨA HÀM DẪN ĐƯỜNG RẼ NHÁNH (CONDITIONAL ROUTER)
# ====================================================================
def route_decision(state: AgentState) -> str:
    """Đọc selected_agent trong State để quyết định Nút thực thi tiếp theo."""
    return state.get("selected_agent", "policy")


# ====================================================================
# 4. LẮP RÁP STATEGRAPH VÀ COMPILE VỚI CHECKPOINTER
# ====================================================================
builder = StateGraph(AgentState)

# A. Thêm các Nút (Nodes)
builder.add_node("receive", receive_node)
builder.add_node("guardrail", guardrail_node)
builder.add_node("router", router_node)
builder.add_node("product", product_node)
builder.add_node("policy", policy_node)
builder.add_node("account", account_node)
builder.add_node("ui_ticket", ui_ticket_node)

# B. Thêm Cạnh cố định (Fixed Edges)
builder.add_edge(START, "receive")
builder.add_edge("receive", "guardrail")
builder.add_edge("guardrail", "router")

# C. Thêm Cạnh rẽ nhánh điều kiện (Conditional Edges)
builder.add_conditional_edges(
    "router",
    route_decision,
    {
        "product": "product",
        "policy": "policy",
        "account": "account",
        "ui_ticket": "ui_ticket"
    }
)

# D. Thêm Cạnh kết thúc (Edges to END)
builder.add_edge("product", END)
builder.add_edge("policy", END)
builder.add_edge("account", END)
builder.add_edge("ui_ticket", END)

# E. Khởi tạo MemorySaver để quản lý bộ nhớ phiên chat qua thread_id
memory_checkpointer = MemorySaver()

# F. Biên dịch Đồ thị thành Runnable Graph App
app_graph = builder.compile(checkpointer=memory_checkpointer)


# ====================================================================
# 5. KHỐI CHẠY KHỞI THỦY KIỂM THỬ TỰ ĐỘNG (OFFLINE DEMO)
# ====================================================================
if __name__ == "__main__":
    print("==========================================================")
    print("🚀 RUNNING REAL PRODUCTION-READY LANGGRAPH WORKFLOW DEMO")
    print("==========================================================")

    # Cấu hình thread_id cho phiên chat
    thread_config = {"configurable": {"thread_id": "session_demo_999"}}

    # Test Case 1: Hỏi Tồn kho (Khách vãng lai)
    print("\n--- 🧪 TEST CASE 1: HỎI TỒN KHO (KHÁCH VÃNG LAI) ---")
    res1 = app_graph.invoke(
        {
            "user_query": "iPhone 16 Pro Max còn hàng không shop?",
            "session_id": "session_demo_999",
            "user_token": None,
            "tool_calls_used": [],
            "messages": []
        },
        config=thread_config
    )
    print(f"\n💡 FINAL ANSWER:\n{res1['final_answer']}")
    print(f"🛠️ TOOLS USED: {res1['tool_calls_used']}")

    # Test Case 2: Tra đơn hàng khi ĐÃ đăng nhập (Mock JWT)
    print("\n--- 🧪 TEST CASE 2: TRA ĐƠN HÀNG (AUTHENTICATED USER) ---")
    res2 = app_graph.invoke(
        {
            "user_query": "Đơn hàng của tôi đến đâu rồi?",
            "session_id": "session_demo_999",
            "user_token": "bearer_mock_jwt_token_123",
            "tool_calls_used": [],
            "messages": []
        },
        config=thread_config
    )
    print(f"\n💡 FINAL ANSWER:\n{res2['final_answer']}")
    print(f"🛠️ TOOLS USED: {res2['tool_calls_used']}")