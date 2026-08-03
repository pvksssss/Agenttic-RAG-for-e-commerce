from typing import List
import json
from configs.GetConfig import config
from configs.setting import settings
from src.c_retrieval.product_retriever import ProductRetriever
from app.core.security import supabase_anon_client

# INITIALIZE RETRIEVER FOR SHARED USE
product_retriever = ProductRetriever(config=config, settings=settings)


def product_compare(product_names: List[str]) -> str:
    """
    Compare technical specifications and details of multiple products.
    Prices are fetched from Supabase in real-time using the product_id from Chroma.
    
    Args:
        product_names (List[str]): List of specific product names to compare.
    """
    try:
        if not product_names:
            return "Please provide product names to compare."
            
        comparison_data = []
        
        # Query details for each product name in the list
        for name in product_names:
            # Call retrieve (limit is handled by slicing the first result [0])
            raw_products = product_retriever.retrieve(query_text=name)
            
            if raw_products:
                best_match = raw_products[0]  # Get the top 1 reranked match
                doc_content = best_match["document"]
                metadata = best_match["metadata"]
                
                product_name = doc_content.split('\n')[0].replace("Sản phẩm:", "").strip()
                brand = metadata.get("brand", "Unknown")
                
                # Get fresh price/stock info from Supabase using product_id
                price_str = "Unknown"
                stock_str = ""
                discount_str = ""
                sku_str = ""
                product_id = metadata.get("product_id")
                if product_id:
                    try:
                        pid_int = int(product_id)
                        price_response = (
                            supabase_anon_client.table("products")
                            .select("price, final_price, discount, stock, sku")
                            .eq("id", pid_int)
                            .execute()
                        )
                        if price_response.data:
                            prod = price_response.data[0]
                            final_price = prod.get("final_price")
                            original_price = prod.get("price", 0)
                            discount = prod.get("discount", 0)
                            stock = prod.get("stock", 0)
                            sku = prod.get("sku", "N/A")
                            display_price = final_price if final_price else original_price
                            if display_price:
                                price_str = f"{display_price:,.0f} VNĐ"
                                if final_price and original_price and final_price != original_price:
                                    price_str += f" | Original: {original_price:,.0f} VNĐ"
                            if discount:
                                discount_str = f" | Discount: {discount}%"
                            stock_str = f" | Stock: {stock}"
                            sku_str = f" | SKU: {sku}"
                    except (ValueError, TypeError):
                        pass
                
                if price_str == "Unknown":
                    # Fallback to vector metadata price if Supabase lookup fails
                    meta_price = metadata.get("price")
                    if meta_price:
                        try:
                            price_str = f"{float(meta_price):,.0f} VNĐ"
                        except (ValueError, TypeError):
                            price_str = str(meta_price)
                
                comparison_data.append(
                    f"Product: {product_name}\n"
                    f"- Brand: {brand}\n"
                    f"- Price: {price_str}{discount_str}{stock_str}{sku_str}\n"
                    f"- Specifications & Details:\n{doc_content}"
                )
            else:
                comparison_data.append(f"Product '{name}': No information found in the database.")
                
        return "\n\n=== COMPARISON DATA ===\n\n" + "\n\n====================\n\n".join(comparison_data)
        
    except Exception as e:
        return f"Error occurred during product comparison: {str(e)}"






# SCHEMA DEFINITION FOR LLM API REGISTRATION
PRODUCT_COMPARE_SCHEMA = {
    "type": "function",
    "function": {
        "name": "product_compare",
        "description": (
            "Compare technical specifications, prices, and features of specific, named products. "
            "Use this tool ONLY when the user specifies the exact names of two or more products to compare (e.g., 'Compare iPhone 15 and Galaxy S24'). "
            "Do NOT use this tool for general comparisons (e.g., 'Compare Samsung S24 with other iPhones' or 'Compare Dell and HP laptops'). For those, use product_search instead. "
            "If the user asks 'nên chọn con nào' between named models, this tool is appropriate."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product_names": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": (
                        "List of specific product names to compare. Each item in the array MUST be a specific, named product (e.g., 'iPhone 15 Pro', 'Dell XPS 13 9315'). "
                        "Preserve the brand and model exactly as the user wrote it. "
                        "Do NOT include generic terms like 'other iPhones' or 'HP laptops' in this list."
                    )
                }
            },
            "required": ["product_names"]
        }
    }
}