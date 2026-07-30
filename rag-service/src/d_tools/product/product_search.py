import re
from typing import Optional
import json
from configs.GetConfig import config
from configs.setting import settings
from src.c_retrieval.product_retriever import ProductRetriever
from app.core.security import supabase_anon_client
 
 
 
 
def _parse_doc_specs(doc: str) -> dict:
    """Rút trích các thông số quan trọng từ nội dung Chroma document."""
    if not doc:
        return {}
    spec_map = [
        ("cpu", [r"Bộ vi xử lý \(CPU/Chipset\)"]),
        ("ram", [r"Dung lượng RAM"]),
        ("storage", [r"Dung lượng lưu trữ"]),
        ("display_size", [r"Kích thước màn hình"]),
        ("battery", [r"Dung lượng Pin"]),
    ]
    result = {}
    for key, labels in spec_map:
        for label in labels:
            pattern = re.compile(
                rf"^-\s*{label}\s*:\s*(.+?)(?=\n^- |\n\n|\Z)",
                re.IGNORECASE | re.MULTILINE | re.DOTALL
            )
            m = pattern.search(doc)
            if m:
                result[key] = m.group(1).strip().replace("\n", " ")
                break
    return result
 
 
_UNITS = {"inch", "W", "Hz", "GB", "TB", "MB", "CPU", "GPU"}
_STOP_WORDS = {"Chính", "hãng", "Việt", "Nam"}
_YEAR = re.compile(r'^20\d{2}$')
_PRICE = re.compile(r'^(\d+\.?\d*)\s*(triệu|VNĐ|VND)$', re.IGNORECASE)
_SPEC_SUFFIX = re.compile(r'^\d+(CPU|GPU|GB|TB|MB|Hz|W)$', re.IGNORECASE)
# Mã SKU/mã model như A2NL6PA, 14IPH11, 15-FD0235TU
_MODEL_CODE = re.compile(r'^[A-Z0-9][A-Z0-9/-]*[A-Z0-9]$')
 
 
def _is_stop_token(token: str, next_token: Optional[str] = None) -> bool:
    """Kiểm tra token có phải bắt đầu thông số/mã model để cắt tên dòng máy không."""
    if token in _STOP_WORDS:
        return True
    if _YEAR.match(token):
        return True
    if _SPEC_SUFFIX.match(token):
        return True
    if token.isdigit() and next_token and next_token in _UNITS:
        return True
    if _PRICE.match(token):
        return True
    # Mã model/SKU: toàn ký tự in hoa/số/hyphen, dài ít nhất 5, không chứa chữ thường
    if len(token) >= 5 and _MODEL_CODE.match(token) and any(c.isdigit() for c in token) and not any('a' <= c <= 'z' for c in token):
        return True
    return False
 
 
def _extract_product_line(name: str) -> str:
    """Rút trích dòng máy từ tên sản phẩm (phần trước thông số/mã model)."""
    name = re.sub(r'\s*\|\s*Chính hãng.*$', '', name)
    name = re.sub(r'\s*[-|]\s*$', '', name).strip()
 
    tokens = name.split()
    parts = []
    for i, token in enumerate(tokens):
        next_token = tokens[i + 1] if i + 1 < len(tokens) else None
        if _is_stop_token(token, next_token):
            break
        parts.append(token)
 
    line = ' '.join(parts).strip()
    return line or name
 
 
def _format_price(price) -> str:
    if price is None:
        return "Liên hệ"
    try:
        p = float(price)
        return f"{p:,.0f} VND"
    except (ValueError, TypeError):
        return str(price)
 
 
_fmt_price = _format_price
 
product_retriever = ProductRetriever(config=config, settings=settings)
 
 
def product_search(
    queries: list,
    limit: int = 3
) -> str:
    """
    Search for one or multiple products. Each item in `queries` is a dict:
      {
        "keyword": str,
        "brand": str (optional),
        "category": str (optional),
        "min_price": float (optional),
        "max_price": float (optional),
        "name_contains": str (optional),   # SQL pre-filter on product name, e.g. 'MacBook Air'
        "mode": "rank" | "lines" (optional, default "rank"),
        "include_details": bool (optional, default False),
        "need_price_info": bool (optional, default False),
        "limit": int (optional, default 3)
      }
 
    mode="rank"  -> top-N semantic products (default).
    mode="lines" -> group results by product line/series and return one representative per line.
    """
    try:
        all_results = []
 
        for q in queries:
            keyword = q.get("keyword", "")
            include_details = q.get("include_details", False)
            need_price_info = q.get("need_price_info", False)
            mode = q.get("mode", "rank")
            brand = q.get("brand")
            category = q.get("category")
            min_price = q.get("min_price")
            max_price = q.get("max_price")
            name_contains = q.get("name_contains")
            q_limit = q.get("limit")
            if q_limit is not None:
                item_limit = q_limit
            else:
                # Mặc định: rank trả vài sản phẩm top, lines cần nhiều dòng hơn
                item_limit = 30 if mode == "lines" else limit
 
            if not keyword:
                keyword = f"{brand or ''} {name_contains or ''} {category or ''}".strip()
                if not keyword:
                    continue
 
            # BƯỚC 1: Xác định có hard filter không
            has_hard_filter = any([brand, category, min_price, max_price, name_contains])
            candidate_ids = []
            price_info_map = {}
 
            # BƯỚC 2: Query Supabase trước nếu có hard filter
            if has_hard_filter:
                query = supabase_anon_client.table("products").select("id")
                if brand:
                    query = query.ilike("brand", brand)
                if category:
                    query = query.ilike("category", category)
                if name_contains:
                    query = query.ilike("name", f"%{name_contains}%")
                if min_price is not None:
                    query = query.gte("final_price", min_price)
                if max_price is not None:
                    query = query.lte("final_price", max_price)
 
                response = query.execute()
                if response.data:
                    candidate_ids = [item["id"] for item in response.data]
                    # Lấy thêm thông tin cơ bản (giá, tên, SKU, stock, discount) cho mọi candidate
                    price_response = (
                        supabase_anon_client.table("products")
                        .select("id, name, sku, stock, price, final_price, discount")
                        .in_("id", candidate_ids)
                        .execute()
                    )
                    if price_response.data:
                        for prod in price_response.data:
                            price_info_map[prod["id"]] = {
                                "id": prod["id"],
                                "name": prod.get("name", ""),
                                "sku": prod.get("sku", "N/A"),
                                "stock": prod.get("stock", 0),
                                "price": prod.get("price", 0),
                                "final_price": prod.get("final_price"),
                                "discount": prod.get("discount", 0),
                            }
 
            # BƯỚC 3: Semantic search trong Chroma (trong candidate_ids nếu có)
            if has_hard_filter and candidate_ids:
                if mode == "lines":
                    # Cần pool lớn hơn để đảm bảo đủ đại diện mỗi dòng
                    pool_limit = min(len(candidate_ids), max(item_limit * 5, 20))
                else:
                    pool_limit = item_limit
 
                raw_products = product_retriever.retrieve(
                    query_text=keyword,
                    product_ids=candidate_ids,
                    limit=pool_limit
                )
            else:
                raw_products = product_retriever.retrieve(
                    query_text=keyword,
                    limit=item_limit
                )
 
            if not raw_products:
                if has_hard_filter and not candidate_ids:
                    all_results.append(f'["{keyword}"]: No matching products found for the specified filters.')
                else:
                    all_results.append(f'["{keyword}"]: No matching products found.')
                continue
 
            # ------------------- MODE: LINES -------------------
            if mode == "lines":
                docs_by_id = {}
                for item in raw_products:
                    pid = item["metadata"].get("product_id")
                    if pid:
                        docs_by_id[str(pid)] = item
 
                # Nhóm các candidate theo dòng máy
                lines = {}
                for pid, info in price_info_map.items():
                    line = _extract_product_line(info["name"])
                    if not line:
                        continue
                    key = line.lower()
                    current = lines.get(key)
                    current_price = current[1]["final_price"] if current else None
                    candidate_price = info["final_price"]
                    if current is None or (candidate_price is not None and (current_price is None or candidate_price < current_price)):
                        lines[key] = (line, info)
 
                sorted_lines = sorted(
                    lines.values(),
                    key=lambda x: (x[1]["final_price"] if x[1]["final_price"] is not None else float("inf"))
                )[:item_limit]
 
                if not sorted_lines:
                    all_results.append(f'["{keyword}"]: Không thể nhóm sản phẩm thành dòng máy rõ ràng.')
                    continue
 
                formatted_list = []
                for line, info in sorted_lines:
                    pid_str = str(info.get("id")) if info.get("id") else ""
                    doc_item = docs_by_id.get(pid_str)
 
                    # Nếu cần chi tiết nhưng chưa có doc, thử retrieve trực tiếp theo product_id
                    if include_details and not doc_item and info.get("id"):
                        try:
                            doc_res = product_retriever.retrieve(
                                query_text=keyword,
                                product_ids=[info["id"]],
                                limit=1
                            )
                            if doc_res:
                                doc_item = doc_res[0]
                        except Exception:
                            pass
 
                    specs = []
                    if include_details and doc_item:
                        parsed = _parse_doc_specs(doc_item["document"])
                        if parsed.get("cpu"):
                            specs.append(f"- Chip: {parsed['cpu']}")
                        if parsed.get("ram"):
                            specs.append(f"- RAM: {parsed['ram']}")
                        if parsed.get("storage"):
                            specs.append(f"- Bộ nhớ: {parsed['storage']}")
                        if parsed.get("display_size"):
                            specs.append(f"- Màn hình: {parsed['display_size']}")
                        if parsed.get("battery"):
                            specs.append(f"- Pin: {parsed['battery']}")
 
                    price_str = _fmt_price(info.get("final_price"))
                    stock_str = "Còn hàng" if info.get("stock", 0) > 0 else "Hết hàng"
 
                    entry = (
                        f"Dòng: {line}\n"
                        f"Đại diện: {info['name']}\n"
                        f"Giá: {price_str} | Tình trạng: {stock_str} | SKU: {info.get('sku', 'N/A')}"
                    )
                    if specs:
                        entry += "\n" + "\n".join(specs)
 
                    # include_details đã được xử lý qua _parse_doc_specs ở trên
 
                    formatted_list.append(entry)
 
                all_results.append(f'["{keyword}"] - {len(formatted_list)} dòng máy:\n' + "\n\n".join(formatted_list))
                continue
 
            # ------------------- MODE: RANK (default) -------------------
            formatted_list = []
            product_ids = []
            for item in raw_products[:item_limit]:
                doc_content = item["document"]
                metadata = item["metadata"]
                score = item["score"]
 
                product_name = doc_content.split('\n')[0].replace("Sản phẩm:", "").strip()
                product_id = metadata.get("product_id")
                brand_name = metadata.get("brand", "Unknown")
 
                if product_id:
                    product_ids.append(product_id)
 
                entry = (
                    f"Product: {product_name}\n"
                    f"- ID: {product_id}\n"
                    f"- Brand: {brand_name}\n"
                    f"- Score: {score:.4f}"
                )
 
                if include_details:
                    entry += f"\n- Details:\n{doc_content}"
 
                formatted_list.append(entry)
 
            # BƯỚC 5: Query Supabase cho price info nếu cần và chưa có từ bước 2
            if need_price_info and product_ids and not price_info_map:
                response = (
                    supabase_anon_client.table("products")
                    .select("id, sku, stock, price, final_price, discount")
                    .in_("id", product_ids)
                    .execute()
                )
                if response.data:
                    for prod in response.data:
                        price_info_map[prod["id"]] = {
                            "sku": prod.get("sku", "N/A"),
                            "stock": prod.get("stock", 0),
                            "price": prod.get("price", 0),
                            "final_price": prod.get("final_price"),
                            "discount": prod.get("discount", 0)
                        }
 
            # Merge price info vào formatted_list
            if need_price_info and price_info_map:
                for i, entry in enumerate(formatted_list):
                    lines = entry.split('\n')
                    for j, line in enumerate(lines):
                        if line.startswith("- ID:") and price_info_map:
                            product_id = line.split(":")[1].strip()
                            if product_id.isdigit() and int(product_id) in price_info_map:
                                info = price_info_map[int(product_id)]
                                display_price = info["final_price"] if info["final_price"] else info["price"]
                                price_str = f"{display_price:,.0f} VND" if display_price else "Contact for price"
                                price_line = f"- Price: {price_str}"
                                if info["final_price"] and info["final_price"] != info["price"]:
                                    price_line += f" | Original: {info['price']:,.0f} VND"
                                if info["discount"] > 0:
                                    price_line += f" | Discount: {info['discount']:.2f}%"
                                status = f"In Stock ({info['stock']} available)" if info["stock"] > 0 else "Out of Stock"
                                lines.insert(j + 1, f"- SKU: {info['sku']}")
                                lines.insert(j + 2, f"- {status}")
                                lines.insert(j + 3, price_line)
                                break
                    formatted_list[i] = "\n".join(lines)
 
            all_results.append(f'["{keyword}"]:\n' + "\n\n".join(formatted_list))
 
        return "\n\n---\n\n".join(all_results)
 
    except Exception as e:
        return f"Error occurred during product retrieval: {str(e)}"
 
 
 
PRODUCT_SEARCH_SCHEMA = {
    "type": "function",
    "function": {
        "name": "product_search",
        "description": (
            "Use this when the user wants to FIND, BUY, COMPARE, LIST LINES/SERIES, or get TOP-N RECOMMENDATIONS for products. "
            "Choose `mode='lines'` when the user asks to LIST/SEE models or variants of a product LINE/SERIES, even with price filters "
            "(e.g. 'có những dòng nào', 'các loại/dòng máy', 'các mẫu dòng S dưới 30 triệu'). "
            "Choose default `mode='rank'` ONLY when the user asks for TOP-N, cheapest, best, or a specific single recommendation "
            "(e.g. 'cho a 5 cái rẻ nhất', 'nên mua nào', 'máy nào rẻ nhất', 'máy nào mạnh nhất'). "
            "Each item in `queries` can have ITS OWN brand/category/min_price/max_price/limit/name_contains/mode filter. "
            "If the customer asks about multiple products with DIFFERENT conditions in one message, split them into separate items in a SINGLE call. "
            "`name_contains` is an SQL pre-filter on product name (case-insensitive), e.g. 'MacBook Air' to only include MacBook Air products. "
            "Use include_details=True for technical specs (chip, RAM, display, battery...). "
            "Use need_price_info=True when asking about price, discount, stock, or SKU."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "queries": {
                    "type": "array",
                    "description": "List of product queries. Each item has 'keyword' and optionally 'brand', 'category', 'min_price', 'max_price', 'name_contains', 'mode', 'limit', 'include_details', 'need_price_info'.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "keyword": {
                                "type": "string",
                                "description": (
                                    "Chỉ chứa phần MÔ TẢ ngữ nghĩa (tên sản phẩm, đặc điểm định tính: mỏng nhẹ, "
                                    "pin trâu, chơi game...). KHÔNG lặp lại brand, giá, hoặc tên dòng cụ thể nếu đã dùng name_contains. "
                                    "Ví dụ: 'laptop Asus mỏng nhẹ pin trâu dưới 25 triệu' -> keyword: 'mỏng nhẹ pin trâu', brand: 'Asus', max_price: 25000000. "
                                    "Với 'các dòng MacBook Air dưới 30 triệu': keyword: 'MacBook Air', name_contains: 'MacBook Air', brand: 'Apple', max_price: 30000000, mode: 'lines'."
                                )
                            },
                            "brand": {
                                "type": "string",
                                "description": (
                                    "Thương hiệu để lọc chính xác trước khi tìm ngữ nghĩa, CHỈ áp dụng cho "
                                    "item này (khác item có thể khác brand). Để trống nếu khách không nhắc rõ."
                                )
                            },
                            "category": {
                                "type": "string",
                                "description": (
                                    "Danh mục sản phẩm để lọc chính xác trước khi tìm ngữ nghĩa (ví dụ: 'laptop', 'phone', 'tablet'). "
                                    "CHỈ áp đụng cho item này. Để trống nếu khách không nhắc rõ."
                                )
                            },
                            "name_contains": {
                                "type": "string",
                                "description": (
                                    "Lọc SQL trên cột name (không phân biệt hoa thường). Dùng khi cần giới hạn đúng một dòng máy, "
                                    "ví dụ 'MacBook Air', 'iPhone 15', 'ThinkPad'. KHÔNG thay thế keyword."
                                )
                            },
                            "min_price": {
                                "type": "number",
                                "description": (
                                    "Giá tối thiểu (VNĐ) lọc trước, CHỈ áp dụng cho item này."
                                )
                            },
                            "max_price": {
                                "type": "number",
                                "description": (
                                    "Giá tối đa (VNĐ) lọc trước, CHỈ áp dụng cho item này (vd 'dưới 20 "
                                    "triệu' -> 20000000)."
                                )
                            },
                            "mode": {
                                "type": "string",
                                "enum": ["rank", "lines"],
                                "description": (
                                    "'rank' (default): trả top-N sản phẩm phù hợp nhất. Use ONLY for 'rẻ nhất', 'nên mua', 'top 5', 'máy nào ... nhất', 'cho a X sản phẩm (rẻ/ngon)'. "
                                    "'lines': nhóm theo dòng máy và trả 1 đại diện mỗi dòng. Use when the user asks 'có những dòng nào', 'các loại', 'dòng máy', 'series nào', 'các mẫu dòng X', even with a price filter."
                                )
                            },
                            "include_details": {
                                "type": "boolean",
                                "description": (
                                    "Set True only when the customer asks for technical specs (chip, RAM, display, battery...). "
                                    "Set False (default) when customer only asks about general info."
                                )
                            },
                            "need_price_info": {
                                "type": "boolean",
                                "description": (
                                    "Set True when customer asks about price, discount, stock, or SKU. "
                                    "Set False (default) when customer only asks about general info."
                                )
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Max number of products/lines to return for this specific query. If omitted, default is 3 for mode='rank' and 30 for mode='lines'."
                            }
                        },
                        "required": ["keyword"]
                    }
                }
            },
            "required": ["queries"]
        }
    }
}