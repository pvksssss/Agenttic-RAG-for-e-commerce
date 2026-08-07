from src.b_indexing.b0_vector_db import ChromaVectorDatabase
from src.b_indexing.b1_embedding import EmbeddingService
from src.b_indexing.b2_rerank import RerankService

class BaseRetriever:
    def __init__(self, config, settings, collection_name: str, k_query: int, k_rerank: int):
        self.config = config
        self.settings = settings
        self.collection_name = collection_name
        self.k_query = k_query
        self.k_rerank = k_rerank

        # Khởi tạo các dịch vụ tầng thấp
        self.db = ChromaVectorDatabase()
        self.embedding_service = EmbeddingService(config=config, settings=settings)
        self.rerank_service = RerankService(config=config, settings=settings)

    def retrieve(self, query_text: str, brand: str = None, min_price: float = None, max_price: float = None, limit: int = None, product_ids: list = None) -> list:
        """
        Nhận câu truy vấn thô từ người dùng, xây dựng bộ lọc metadata động, truy vấn ChromaDB và Rerank.
        Hỗ trợ điều chỉnh linh hoạt số lượng kết quả dựa trên giới hạn (limit) yêu cầu.
        
        Args:
            query_text: Văn bản câu truy vấn tìm kiếm
            brand: Lọc theo thương hiệu (phương thức cũ, luồng mới nên dùng product_ids)
            min_price: Lọc theo giá tối thiểu (phương thức cũ, luồng mới nên dùng product_ids)
            max_price: Lọc theo giá tối đa (phương thức cũ, luồng mới nên dùng product_ids)
            limit: Số lượng kết quả tối đa cần trả về
            product_ids: Danh sách ID sản phẩm cần lọc (từ bước lọc sơ bộ trên Supabase)
        """
        # Bước 1: Tự động mở rộng giới hạn query và rerank nếu limit yêu cầu vượt mặc định
        k_rerank_active = self.k_rerank
        k_query_active = self.k_query
        
        if limit is not None:
            k_rerank_active = max(limit, self.k_rerank)
            # Đảm bảo ChromaDB trả về tập ứng viên gấp ít nhất 3 lần cho mô hình Reranker
            k_query_active = max(limit * 3, self.k_query)

        # Bước 2: Xây dựng điều kiện lọc where động cho metadata ChromaDB
        # Ưu tiên: product_ids (luồng mới) > brand/min_price/max_price (luồng cũ)
        where_clause = self._build_where_clause(brand, min_price, max_price, product_ids)

        # Bước 3: Chuyển đổi câu truy vấn thành Vector Embedding
        query_vector = self.embedding_service.get_embedding(query_text)

        # Bước 4: Truy vấn ChromaDB để lấy kết quả thô
        raw_results = self.db.query(
            collection_name=self.collection_name,
            query_embeddings=[query_vector],
            n_results=k_query_active,
            where=where_clause
        )

        if not raw_results or not raw_results.get("documents") or not raw_results["documents"][0]:
            return []

        # Bước 5: Đưa vào RerankService để lấy danh sách kết quả tốt nhất
        documents_for_rerank = [{"text": doc} for doc in raw_results["documents"][0]]
        reranked_results = self.rerank_service.get_rerank(
            query_text=query_text,
            documents=documents_for_rerank,
            top_n=k_rerank_active
        )

        # Bước 6: Tổng hợp metadata và trả về kết quả cuối cùng
        final_documents = []
        for item in reranked_results:
            idx = item["index"]
            score = item["relevance_score"]

            final_documents.append({
                "document": raw_results["documents"][0][idx],
                "metadata": raw_results["metadatas"][0][idx],
                "score": score
            })

        return final_documents

    def _build_where_clause(self, brand: str = None, min_price: float = None, max_price: float = None, product_ids: list = None) -> dict:
        """Xây dựng dictionary điều kiện lọc where động theo đúng chuẩn ChromaDB."""
        conditions = []
        
        # Ưu tiên 1: Lọc theo product_ids (luồng mới từ lọc sơ bộ Supabase)
        if product_ids:
            str_ids = [str(pid) for pid in product_ids if pid is not None]
            conditions.append({"product_id": {"$in": str_ids}})
        else:
            # Ưu tiên 2: Bộ lọc cũ (brand, min_price, max_price)
            if brand:
                # Khớp chính xác thương hiệu
                conditions.append({"brand": {"$eq": brand}})
            if min_price is not None:
                conditions.append({"price": {"$gte": min_price}})
            if max_price is not None:
                conditions.append({"price": {"$lte": max_price}})

        if len(conditions) > 1:
            return {"$and": conditions}
        elif len(conditions) == 1:
            return conditions[0]
        return None