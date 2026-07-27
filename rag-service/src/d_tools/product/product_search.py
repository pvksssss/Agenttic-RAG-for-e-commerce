import json
from configs.GetConfig import config
from configs.setting import settings
from src.c_retrieval.product_retriever import ProductRetriever
from app.core.security import supabase_anon_client


product_retriever = ProductRetriever(config=config, settings=settings)

def product_search(
    queries: list,
    limit: int = 3
) -> str:
    """
    Search for one or multiple products. Each item in `queries` is a dict:
      {"keyword": str, "include_details": bool (optional, default False), "need_price_info": bool (optional, default False),
       "brand": str (optional), "category": str (optional), "min_price": float (optional), "max_price": float (optional),
       "limit": int (optional, default 3)}

    Args:
        queries: List of query objects, e.g.
            [{"keyword": "laptop mỏng nhẹ pin trâu", "brand": "Asus", "category": "laptop", "max_price": 25000000, "need_price_info": True, "limit": 3},
             {"keyword": "Samsung S24", "category": "phone", "include_details": True, "limit": 2}]
        limit (int): Default max products per query keyword when not set inside a query item.
    """
    try:
        all_results = []

        for q in queries:
            keyword = q.get("keyword", "")
            include_details = q.get("include_details", False)
            need_price_info = q.get("need_price_info", False)
            brand = q.get("brand")
            category = q.get("category")
            min_price = q.get("min_price")
            max_price = q.get("max_price")
            q_limit = q.get("limit")
            item_limit = q_limit if q_limit is not None else limit

            if not keyword:
                keyword = f"{brand or ''} {category or ''}".strip()
                if not keyword:
                    continue

            # BƯỚC 1: Xác định có hard filter không
            has_hard_filter = any([brand, category, min_price, max_price])
            candidate_ids = []
            price_info_map = {}

            # BƯỚC 2: Query Supabase trước nếu có hard filter
            if has_hard_filter:
                query = supabase_anon_client.table("products").select("id")
                if brand:
                    query = query.ilike("brand", brand)
                if category:
                    query = query.ilike("category", category)
                if min_price is not None:
                    query = query.gte("final_price", min_price)
                if max_price is not None:
                    query = query.lte("final_price", max_price)
                
                response = query.execute()
                if response.data:
                    candidate_ids = [item["id"] for item in response.data]
                    # Query thêm price info luôn cho group này
                    price_response = (
                        supabase_anon_client.table("products")
                        .select("id, sku, stock, price, final_price, discount")
                        .in_("id", candidate_ids)
                        .execute()
                    )
                    if price_response.data:
                        for prod in price_response.data:
                            price_info_map[prod["id"]] = {
                                "sku": prod.get("sku", "N/A"),
                                "stock": prod.get("stock", 0),
                                "price": prod.get("price", 0),
                                "final_price": prod.get("final_price"),
                                "discount": prod.get("discount", 0)
                            }

            # BƯỚC 3: Semantic search trong Chroma
            if has_hard_filter and candidate_ids:
                # Search chỉ trong candidate_ids từ Supabase
                raw_products = product_retriever.retrieve(
                    query_text=keyword,
                    product_ids=candidate_ids,
                    limit=item_limit
                )
            else:
                # Không có filter hoặc candidate_ids rỗng -> search toàn catalog
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
            "Search for one or multiple electronic products. Each item in `queries` can "
            "have ITS OWN brand/category/min_price/max_price/limit filter — if the customer asks about "
            "multiple products with DIFFERENT conditions in one message (e.g. 'Dell laptop dưới "
            "20 triệu và Asus phone dưới 25 triệu'), split them into separate items in a SINGLE "
            "call rather than calling this tool multiple times. If brand/category/min_price/"
            "max_price are provided for an item, the system pre-filters candidates by "
            "these exact conditions FIRST via Supabase, then ranks semantically within that "
            "filtered set — always fill these fields when known instead of embedding them in the "
            "keyword text. `limit` is the number of products to return for that specific item (default 3 if omitted). Use include_details=True for technical specs (chip, RAM, "
            "display, battery...). Use need_price_info=True when asking about price, "
            "discount, stock, or SKU. Default both to False to save tokens."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "queries": {
                    "type": "array",
                    "description": "List of product queries. Each item must have 'keyword' and optionally 'brand', 'category', 'min_price', 'max_price', 'limit', 'include_details', 'need_price_info'.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "keyword": {
                                "type": "string",
                                "description": (
                                    "Chỉ chứa phần MÔ TẢ ngữ nghĩa (tên sản phẩm, đặc điểm định tính: mỏng nhẹ, "
                                    "pin trâu, chơi game...). KHÔNG lặp lại brand hoặc giá trong keyword — đã có "
                                    "field riêng cùng cấp (brand, min_price, max_price) NGAY TRONG ITEM NÀY. Ví "
                                    "dụ: 'laptop Asus mỏng nhẹ pin trâu dưới 25 triệu' -> keyword: 'laptop mỏng "
                                    "nhẹ pin trâu', brand: 'Asus', max_price: 25000000 (cùng trong 1 item)."
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
                                    "CHỈ áp dụng cho item này. Để trống nếu khách không nhắc rõ."
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
                                "description": "Max number of products to return for this specific query (default: 3 if omitted)."
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
