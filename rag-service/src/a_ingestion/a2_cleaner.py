import re
from typing import List, Dict, Any

class DataCleaner:
    """Bộ làm sạch chịu trách nhiệm làm sạch và chuẩn hóa dữ liệu thô trước khi nạp embedding"""

    @staticmethod
    def remove_html_tags(text: str) -> str:
        """Loại bỏ các thẻ HTML bị lẫn trong văn bản"""
        if not text:
            return ""
        # Loại bỏ thẻ HTML
        clean_text = re.sub(r'<[^>]+>', ' ', text)
        # Thay thế nhiều khoảng trắng liên tiếp bằng 1 khoảng trắng
        clean_text = re.sub(r'\s+', ' ', clean_text)
        return clean_text.strip()

    def clean_product_data(self, products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Làm sạch và chuẩn hóa danh sách sản phẩm"""
        cleaned_products = []
        print("[Cleaner] Bắt đầu làm sạch dữ liệu sản phẩm...")
        
        for prod in products:
            try:
                # 1. Đảm bảo các trường cơ bản không bị None
                name = prod.get("name", "").strip()
                brand = prod.get("brand", "Unknown").strip()
                category = prod.get("category", "accessory").strip()
                description = prod.get("description", "")
                
                # 2. Làm sạch mô tả (mô tả sản phẩm dễ dính thẻ HTML khi cào dữ liệu)
                clean_description = self.remove_html_tags(description)
                
                # 3. Chuẩn hóa giá và phần trăm giảm giá
                price = float(prod.get("price", 0))
                original_price = float(prod.get("original_price", 0))
                discount = float(prod.get("discount", 0))
                
                # 4. Chuẩn hóa thông số kỹ thuật specs (dạng JSONB)
                specs = prod.get("specs", {})
                if not isinstance(specs, dict):
                    specs = {}
                
                cleaned_prod = {
                    "id": prod.get("id"),
                    "name": name,
                    "brand": brand,
                    "category": category,
                    "price": price,
                    "original_price": original_price,
                    "discount": discount,
                    "description": clean_description,
                    "specs": specs,
                    "rating_avg": float(prod.get("rating_avg", 0.0)),
                    "images": prod.get("images", [])
                }
                cleaned_products.append(cleaned_prod)
            except Exception as e:
                print(f"[Cleaner] Lỗi khi làm sạch sản phẩm ID {prod.get('id')}: {e}")
                
        print(f"[Cleaner] Đã làm sạch xong {len(cleaned_products)} sản phẩm.")
        return cleaned_products

    def clean_policy_data(self, policies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Làm sạch tài liệu chính sách"""
        cleaned_policies = []
        print("[Cleaner] Bắt đầu làm sạch dữ liệu chính sách...")
        
        for policy in policies:
            content = policy.get("content", "")
            # Loại bỏ khoảng trắng thừa, chuẩn hóa ký tự xuống dòng
            clean_content = re.sub(r'\n{3,}', '\n\n', content)
            
            cleaned_policies.append({
                "source_doc": policy.get("source_doc"),
                "content": clean_content.strip(),
                "file_path": policy.get("file_path")
            })
            
        print(f"[Cleaner] Đã làm sạch xong {len(cleaned_policies)} tài liệu chính sách.")
        return cleaned_policies
