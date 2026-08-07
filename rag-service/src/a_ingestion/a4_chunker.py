from langchain_text_splitters import RecursiveCharacterTextSplitter
from typing import Dict, Any, List


class ChunkingDocuments:
    """Lớp thực hiện chia nhỏ (chunking) tài liệu sử dụng RecursiveCharacterTextSplitter"""
    
    def __init__(self, config):
        """
        Khởi tạo bộ phân tách tài liệu với cấu hình được truyền vào.
        
        Args:
            config: Đối tượng cấu hình chứa các thuộc tính chunk_size và chunk_overlap
        """
        self.config = config

    def build_splitter(self):
        """
        Khởi tạo và trả về một instance của RecursiveCharacterTextSplitter.
        
        Returns:
            RecursiveCharacterTextSplitter được cấu hình các thuộc tính chunk_size, chunk_overlap và các dấu phân cách (separators)
        """
        return RecursiveCharacterTextSplitter(
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

    def chunk_policy(self, doc: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Phân tách một tài liệu chính sách/sản phẩm đơn lẻ thành các đoạn nhỏ (chunks).
        
        Args:
            doc: Dictionary chứa tài liệu với các khóa 'title' và 'content'
            
        Returns:
            Danh sách các đoạn nhỏ đã chia kèm theo id, nội dung document và metadata
        """
        policy_chunks = []
        
        # 1. Khởi tạo bộ phân tách text
        splitter = self.build_splitter()
        
        # 2. Kết hợp tiêu đề và nội dung để bảo toàn ngữ cảnh trước khi phân tách
        doc_text = f"Tài liệu chính sách: {doc['title']}\nNội dung chi tiết:\n{doc['content']}"
        
        # 3. Sử dụng split_text trên chuỗi văn bản thô
        chunks = splitter.split_text(doc_text)

        # 4. Đóng gói danh sách các đoạn nhỏ (chunks)
        for i, chunk_content in enumerate(chunks):
            policy_chunks.append({
                "id": f"policy_{doc['id']}_chunk_{i}",  
                "document": chunk_content,            
                "metadata": {
                    "policy_id": str(doc["id"]),
                    "title": str(doc["title"]),
                    "category": str(doc["category"]),
                    "chunk_index": int(i)
                }
            })
        return policy_chunks

    def chunk_multiple_policies(self, docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Phân tách hàng loạt nhiều tài liệu chính sách/sản phẩm cùng lúc.
        
        Args:
            docs: Danh sách các dictionary tài liệu
            
        Returns:
            Danh sách tổng hợp toàn bộ các đoạn nhỏ thu được từ tất cả tài liệu đầu vào
        """
        all_chunks = []
        for doc in docs:
            all_chunks.extend(self.chunk_policy(doc))
        return all_chunks
