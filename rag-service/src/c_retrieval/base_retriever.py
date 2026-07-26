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

        # Initialize lower-level services
        self.db = ChromaVectorDatabase()
        self.embedding_service = EmbeddingService(config=config, settings=settings)
        self.rerank_service = RerankService(config=config, settings=settings)

    def retrieve(self, query_text: str, brand: str = None, min_price: float = None, max_price: float = None, limit: int = None, product_ids: list = None) -> list:
        """
        Receive raw query from user, build dynamic metadata filters, query ChromaDB, and Rerank.
        Supports dynamic adjustment of result sizes based on requested limit.
        
        Args:
            query_text: The search query text
            brand: Filter by brand (legacy, use product_ids instead for new flow)
            min_price: Filter by minimum price (legacy, use product_ids instead for new flow)
            max_price: Filter by maximum price (legacy, use product_ids instead for new flow)
            limit: Maximum number of results to return
            product_ids: List of product IDs to filter by (from Supabase pre-filtering)
        """
        # Step 1: Dynamically scale query and rerank limits if requested limit exceeds config defaults
        k_rerank_active = self.k_rerank
        k_query_active = self.k_query
        
        if limit is not None:
            k_rerank_active = max(limit, self.k_rerank)
            # Ensure ChromaDB returns at least 3x candidate pool for Reranker
            k_query_active = max(limit * 3, self.k_query)

        # Step 2: Build dynamic where clause for ChromaDB metadata filtering
        # Priority: product_ids (new flow) > brand/min_price/max_price (legacy)
        where_clause = self._build_where_clause(brand, min_price, max_price, product_ids)

        # Step 3: Convert query to Vector Embedding
        query_vector = self.embedding_service.get_embedding(query_text)

        # Step 4: Query ChromaDB to get raw results
        raw_results = self.db.query(
            collection_name=self.collection_name,
            query_embeddings=[query_vector],
            n_results=k_query_active,
            where=where_clause
        )

        if not raw_results or not raw_results.get("documents") or not raw_results["documents"][0]:
            return []

        # Step 5: Pass to RerankService to get best results
        documents_for_rerank = [{"text": doc} for doc in raw_results["documents"][0]]
        reranked_results = self.rerank_service.get_rerank(
            query_text=query_text,
            documents=documents_for_rerank,
            top_n=k_rerank_active
        )

        # Step 5: Combine metadata and return
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
        """Build dynamic where filter dictionary according to ChromaDB filter specs."""
        conditions = []
        
        # Priority 1: Filter by product_ids (new flow from Supabase pre-filtering)
        if product_ids:
            conditions.append({"id": {"$in": product_ids}})
        else:
            # Priority 2: Legacy filters (brand, min_price, max_price)
            if brand:
                # Case-insensitive / exact brand match
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
