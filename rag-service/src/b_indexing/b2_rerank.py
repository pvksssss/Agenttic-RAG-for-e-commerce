import requests
import time
from typing import List, Dict, Any

class RerankService:
    """Lớp dịch vụ thực hiện sắp xếp lại (reranking) danh sách tài liệu sử dụng OpenRouter API."""
    
    def __init__(self, api_key: str = None, model: str = None, config=None, settings=None):
        if api_key:
            self.api_key = api_key
        elif settings:
            self.api_key = settings.OPENROUTER_API_KEY
        else:
            from configs.setting import settings as global_settings
            self.api_key = global_settings.OPENROUTER_API_KEY
            
        if model:
            self.model = model
        elif config and hasattr(config, 'rerank') and hasattr(config.rerank, 'active'):
            self.model = config.rerank.active
        else:
            self.model = "nvidia/llama-nemotron-rerank-vl-1b-v2:free"
            
        self.url = "https://openrouter.ai/api/v1/rerank"
        
        if not self.api_key or "your-openrouter" in self.api_key:
            raise ValueError("Vui lòng điền OPENROUTER_API_KEY thật vào file .env!")
    
    def get_rerank(
        self, 
        query_text: str, 
        documents: List[Dict[str, Any]], 
        top_n: int, 
        max_retries: int = 3, 
        timeout: int = 15
    ) -> List[Dict[str, Any]]:
        """
        Sắp xếp lại danh sách tài liệu dựa trên độ tương quan với câu truy vấn.
        
        Args:
            query_text: Câu truy vấn tìm kiếm
            documents: Danh sách tài liệu dạng [{"text": "..."}, {"image": "..."}]
            top_n: Số lượng kết quả hàng đầu cần trả về
            
        Returns:
            List[Dict[str, Any]]: Danh sách các kết quả đã được sắp xếp lại kèm điểm số tương quan
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "query": query_text,
            "documents": documents,
            "top_n": top_n
        }
        
        for attempt in range(max_retries):
            try:
                response = requests.post(
                    self.url, headers=headers, json=payload, timeout=timeout
                )
                result = response.json()
                if "results" in result:
                    return result["results"]
                else:
                    print(f"Lỗi API: {result.get('error')}. Đang thử lại lần {attempt + 1}...")
            except Exception as e:
                print(f"Lỗi kết nối: {e}. Đang thử lại lần {attempt + 1}...")
            time.sleep(2)
        raise ValueError(f"Không thể lấy kết quả Rerank sau {max_retries} lần thử!")
