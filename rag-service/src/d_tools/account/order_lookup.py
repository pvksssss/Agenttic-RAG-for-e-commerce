from typing import Optional
import json
from app.core.security import supabase_admin_client, get_user_supabase_client

def order_lookup(
    current_user_id: str = None, 
    user_token: Optional[str] = None, 
    order_id: Optional[str] = None
) -> str:
    """
    Tra cứu chi tiết đơn hàng cho người dùng đã xác thực hiện tại.
    Sử dụng client người dùng động (RLS) nếu user_token được cung cấp.
    Fallback sang admin client với lọc user_id cấp ứng dụng nếu thiếu user_token.
    
    Args:
        current_user_id (str): UUID của người dùng đã xác thực (được tự động inject).
        user_token (str, optional): JWT access token của người dùng (được tự động inject).
        order_id (str, optional): UUID cụ thể của đơn hàng cần tra cứu.
    """
    try:
        if not current_user_id:
            return "System notification: The user is currently unauthenticated. Please politely instruct the user to log in or authenticate their account to view order details."
            
        # 1. Chọn Supabase Client dựa trên token xác thực
        # Bảo mật 2 lớp: 
        # - Nếu có user_token, dùng dynamic client (áp dụng RLS cấp database).
        # - Ngược lại, dùng admin client với bộ lọc cấp ứng dụng để fallback.
        if user_token:
            db_client = get_user_supabase_client(user_token)
        else:
            db_client = supabase_admin_client
            
        # ----------------------------------------------------
        # TRƯỜNG HỢP 1: Tra cứu chi tiết một đơn hàng cụ thể
        # ----------------------------------------------------
        if order_id:
            response = (
                db_client.table("orders")
                .select("*")
                .eq("id", order_id)
                .eq("user_id", current_user_id)  # Lớp bảo mật bổ sung (Cấp ứng dụng)
                .execute()
            )
            
            if not response.data:
                return f"No order found with ID '{order_id}' belonging to your account."
                
            order = response.data[0]
            
            # Đóng gói danh sách sản phẩm trong đơn hàng
            items_raw = order.get("items", [])
            items_str = ""
            if isinstance(items_raw, list):
                items_str = "\n".join([
                    f"  - {item.get('name', 'Unknown product')} (Quantity: {item.get('quantity', 1)} | Price: {item.get('price', 0):,.0f} VNĐ)"
                    for item in items_raw
                ])
            else:
                items_str = f"  - {str(items_raw)}"
                
            return (
                f"=== ORDER DETAILS ===\n"
                f"- Order ID: {order.get('id')}\n"
                f"- Order Date: {order.get('created_at')}\n"
                f"- Status: {order.get('status', 'Unknown').upper()}\n"
                f"- Shipping Address: {order.get('shipping_address', 'None')}\n"
                f"- Total Amount: {order.get('total', 0):,.0f} VNĐ\n"
                f"- Purchased Items:\n{items_str}"
            )
            
        # ----------------------------------------------------
        # TRƯỜNG HỢP 2: Lấy danh sách tất cả các đơn hàng gần đây
        # ----------------------------------------------------
        else:
            # Lấy thêm trường 'items' để AI Agent có thể kiểm tra danh sách sản phẩm bên trong
            # và tự động giải quyết các câu hỏi như "Đơn hàng Samsung S25 của tôi đâu?"
            response = (
                db_client.table("orders")
                .select("id", "status", "total", "created_at", "items")
                .eq("user_id", current_user_id)
                .order("created_at", desc=True)
                .limit(5)  # Lấy tối đa 5 đơn hàng gần đây nhất
                .execute()
            )
            
            if not response.data:
                return "You have not placed any orders yet."
                
            orders_list = []
            for i, order in enumerate(response.data):
                # Trích xuất và định dạng tên sản phẩm cho từng đơn hàng giúp LLM khớp thông tin
                items_raw = order.get("items", [])
                item_names = []
                if isinstance(items_raw, list):
                    item_names = [item.get('name', 'Unknown product') for item in items_raw]
                else:
                    item_names = [str(items_raw)]
                products_summary = ", ".join(item_names)
                
                orders_list.append(
                    f"{i+1}. Order ID: {order.get('id')}\n"
                    f"   - Date: {order.get('created_at')}\n"
                    f"   - Status: {order.get('status', 'Unknown').upper()}\n"
                    f"   - Total: {order.get('total', 0):,.0f} VNĐ\n"
                    f"   - Products: {products_summary}"
                )
                
            return (
                f"=== YOUR RECENT ORDERS ===\n\n"
                + "\n\n--------------------------\n\n".join(orders_list)
            )
            
    except Exception as e:
        return f"Error occurred during order lookup: {str(e)}"

# =====================================================================
# ĐỊNH NGHĨA SCHEMA CHO ĐĂNG KÝ API LLM
# =====================================================================
ORDER_LOOKUP_SCHEMA = {
    "type": "function",
    "function": {
        "name": "order_lookup",
        "description": (
            "Look up order status, shipment tracking, or transaction history. "
            "Use this tool when users ask: 'Where is my order?', 'Show my orders', or inquire about a specific order. "
            "IMPORTANT: If the user asks about a specific product they bought (e.g., 'Where is my Samsung S25?'), "
            "DO NOT guess the order_id. Leave order_id parameter empty to retrieve their recent orders, then "
            "search the returned list of products to find the correct order containing that product. "
            "If the user mentions a product name and asks about delivery/status, call this tool once with an empty order_id."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": (
                        "The specific UUID of the order to query (e.g., '3f8a9b2c-1234-5678-90ab-cdef12345678'). "
                        "Leave this empty if the user is asking generally or about a specific product name (e.g., 'Samsung S25') "
                        "instead of an order UUID. "
                        "Only fill this if the user explicitly provides a UUID/ORDER ID."
                    )
                }
            },
            # Lưu ý: current_user_id và user_token KHÔNG nằm trong thuộc tính JSON schema.
            # Chúng sẽ được tự động inject bởi Python agent trước khi thực thi tool.
            "required": []
        }
    }
}