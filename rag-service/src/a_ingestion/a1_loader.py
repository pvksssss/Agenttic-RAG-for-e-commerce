import os
from typing import List, Dict, Any
from pathlib import Path
from supabase import create_client, Client
from configs.setting import settings

class SupabaseDataLoader:
    """Bộ nạp dữ liệu chịu trách nhiệm kết nối và lấy dữ liệu thô từ Supabase Postgres"""
    
    def __init__(self):
        self.supabase_url = settings.SUPABASE_URL
        self.supabase_key = settings.SUPABASE_SERVICE_ROLE_KEY
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("Thiếu cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong file .env")
            
        self.client: Client = create_client(self.supabase_url, self.supabase_key)

    def load_products(self) -> List[Dict[str, Any]]:
        """Nạp toàn bộ sản phẩm từ bảng products trong Supabase"""
        try:
            print("[Loader] Đang tải dữ liệu sản phẩm từ Supabase...")
            products = []
            limit = 1000
            offset = 0
            while True:
                response = self.client.table("products")\
                    .select("*")\
                    .order("id", desc=True)\
                    .range(offset, offset + limit - 1)\
                    .execute()
                
                batch = response.data
                if not batch:
                    break
                products.extend(batch)
                print(f"  -> Đã tải batch {offset} - {offset + len(batch) - 1} ({len(batch)} sản phẩm)")
                if len(batch) < limit:
                    break
                offset += limit
            
            print(f"[Loader] Đã tải thành công tổng cộng {len(products)} sản phẩm.")
            return products
        except Exception as e:
            print(f"[Loader] Lỗi khi tải sản phẩm từ Supabase: {e}")
            return []

    def load_policies(self) -> List[Dict[str, Any]]:
        """Nạp toàn bộ chính sách từ bảng policies trong Supabase"""
        try:
            print("[Loader] Đang tải dữ liệu chính sách từ Supabase...")
            response = self.client.table("policies").select("*").execute()
            db_policies = response.data
            
            policies = []
            for p in db_policies:
                # Định dạng dữ liệu tương thích 100% với bộ nạp file local cũ
                # đồng thời thêm ID database, Title và Category để nâng cao metadata RAG
                policies.append({
                    "id": p.get("id"),
                    "title": p.get("title"),
                    "category": p.get("category"),
                    "source_doc": f"{p.get('category')}_{p.get('title').replace(' ', '_')}.md",
                    "content": p.get("content", ""),
                    "file_path": f"supabase://policies/{p.get('id')}"
                })
            
            print(f"[Loader] Đã tải thành công {len(policies)} chính sách từ database.")
            return policies
        except Exception as e:
            print(f"[Loader] Lỗi khi tải chính sách từ Supabase: {e}")
            return []
