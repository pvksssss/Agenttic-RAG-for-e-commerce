import chromadb
from typing import List, Dict, Any, Optional
from configs.setting import settings

class ChromaVectorDatabase:
    """Lớp quản lý các thao tác với cơ sở dữ liệu vector ChromaDB."""
    
    def __init__(self, persist_directory: str = None):
        self.persist_directory = persist_directory or settings.vector_db_absolute_path
        self.client = chromadb.PersistentClient(path=self.persist_directory)
        self._collections = {}
    
    def get_or_create_collection(self, name: str):
        """Lấy hoặc tạo một bộ sưu tập (collection) theo tên."""
        if name not in self._collections:
            self._collections[name] = self.client.get_or_create_collection(
                name=name,
                metadata={"hnsw:space": "cosine"}
            )
        return self._collections[name]
    
    def add_documents(
        self,
        collection_name: str,
        ids: List[str],
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict[str, Any]]
    ):
        """Thêm danh sách tài liệu vào bộ sưu tập."""
        collection = self.get_or_create_collection(collection_name)
        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas
        )
    
    def list_collections(self):
        """Liệt kê tất cả các bộ sưu tập trong cơ sở dữ liệu."""
        return self.client.list_collections()
    
    def get_collection(self, name: str):
        """Lấy bộ sưu tập cụ thể theo tên."""
        return self.client.get_collection(name=name)
    
    def count_documents(self, collection_name: str) -> int:
        """Đếm tổng số tài liệu trong bộ sưu tập."""
        collection = self.get_or_create_collection(collection_name)
        return collection.count()

    def query(
        self,
        collection_name: str,
        query_embeddings: List[List[float]],
        n_results: int = 5,
        where: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Truy vấn các tài liệu tương đồng từ bộ sưu tập."""
        collection = self.get_or_create_collection(collection_name)
        return collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results,
            where=where
        )
    
    def get_all_documents(self, collection_name: str, limit: int = None) -> Dict[str, Any]:
        """
        Lấy toàn bộ tài liệu từ bộ sưu tập (phục vụ sinh dữ liệu benchmark).
        
        Args:
            collection_name: Tên của bộ sưu tập
            limit: Số lượng tài liệu tối đa cần lấy (None = lấy tất cả)
            
        Returns:
            Dict chứa các khóa: ids, documents, metadatas, embeddings
        """
        collection = self.get_or_create_collection(collection_name)
        count = collection.count()
        
        if limit is not None:
            count = min(count, limit)
        
        # Lấy tất cả tài liệu bằng hàm get() với ids=None
        result = collection.get(
            limit=count if limit else None
        )
        
        return result
