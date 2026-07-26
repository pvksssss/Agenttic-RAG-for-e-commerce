"""
Helpers để tạo benchmark dataset với RAGAS 0.4.x, tối ưu cho free API:
- Chỉ dùng NERExtractor transform (tránh summary/theme/headline tốn token).
- Dùng SingleHopSpecificQuerySynthesizer với deterministic theme-persona mapping.
- Hỗ trợ đếm LLM calls.
"""
import asyncio
import re
import unicodedata
from pathlib import Path
from typing import List

import pandas as pd
from langchain_core.documents import Document

from ragas.llms import llm_factory
from ragas.run_config import RunConfig
from ragas.testset import TestsetGenerator
from ragas.testset.persona import Persona
from ragas.testset.synthesizers.prompts import PersonaThemesMapping
from ragas.testset.synthesizers.single_hop.specific import SingleHopSpecificQuerySynthesizer
from ragas.testset.transforms.extractors.llm_based import NERExtractor


def clean_text(text: str) -> str:
    """Loại bỏ surrogate characters và ký tự điều khiển."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\ud800-\udfff]", "", text)
    text = re.sub(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f]", "", text)
    return text


def to_prechunked_documents(documents: List[Document], config) -> List[Document]:
    """
    Chia nhỏ tài liệu:
      - product: giữ nguyên (1 sản phẩm = 1 chunk).
      - policy: chunk theo config.chunking.
    """
    from src.a_ingestion.a4_chunker import ChunkingDocuments

    chunks = []
    chunker = ChunkingDocuments(config.chunking)
    splitter = chunker.build_splitter()

    for doc_idx, doc in enumerate(documents):
        content = clean_text((doc.page_content or "").strip())
        if not content:
            continue
        meta = dict(doc.metadata or {})
        meta.setdefault("source_doc_index", doc_idx)
        doc_type = meta.get("type", "unknown")

        if doc_type == "product":
            meta["chunk_index"] = 0
            chunks.append(Document(page_content=content, metadata=meta))
        else:
            parts = splitter.split_text(content)
            for chunk_idx, part in enumerate(parts):
                part_meta = dict(meta)
                part_meta["chunk_index"] = chunk_idx
                chunks.append(Document(page_content=part, metadata=part_meta))
    return chunks


def load_documents_from_chroma(db, limit_products=100, limit_policies=50) -> List[Document]:
    """Thử load products/policies từ ChromaDB."""
    documents = []

    try:
        products = db.get_all_documents("products_collection", limit=limit_products)
        if products and products.get("documents"):
            for doc, meta in zip(products["documents"], products.get("metadatas") or []):
                documents.append(Document(
                    page_content=doc,
                    metadata={"type": "product", **(meta or {})}
                ))
            print(f"   ✅ Loaded {len(products['documents'])} products from ChromaDB")
    except Exception as e:
        print(f"   ⚠️ Không load được products_collection: {e}")

    try:
        policies = db.get_all_documents("policies_collection", limit=limit_policies)
        if policies and policies.get("documents"):
            for doc, meta in zip(policies["documents"], policies.get("metadatas") or []):
                documents.append(Document(
                    page_content=doc,
                    metadata={"type": "policy", **(meta or {})}
                ))
            print(f"   ✅ Loaded {len(policies['documents'])} policies from ChromaDB")
    except Exception as e:
        print(f"   ⚠️ Không load được policies_collection: {e}")

    return documents


def load_documents_from_csv(repo_root: Path, limit=100) -> List[Document]:
    """Fallback load sản phẩm từ CSV khi ChromaDB rỗng."""
    csv_path = repo_root / "data for system" / "laptop_products.csv"
    if not csv_path.exists():
        return []

    df = pd.read_csv(csv_path)
    docs = []
    priority_cols = [
        "name", "brand", "category", "price", "special_price", "final_price",
        "stock", "cpu", "chipset", "ram", "storage", "display_size",
        "display_resolution", "battery", "os", "gpu", "weight", "warranty",
    ]
    for _, row in df.head(limit).iterrows():
        fields = []
        for col in priority_cols:
            if col in row and pd.notna(row[col]):
                fields.append(f"{col}: {row[col]}")
        text = "\n".join(fields)
        if text:
            docs.append(Document(page_content=text, metadata={"type": "product", "source": "csv"}))
    print(f"   ✅ Loaded {len(docs)} products từ CSV fallback")
    return docs


def load_documents(limit_products=100, limit_policies=50) -> List[Document]:
    """Load documents, ưu tiên ChromaDB, fallback CSV."""
    from src.b_indexing.b0_vector_db import ChromaVectorDatabase
    from configs.GetConfig import config

    db = ChromaVectorDatabase()
    documents = load_documents_from_chroma(db, limit_products, limit_policies)

    if not documents:
        print("📂 ChromaDB rỗng, fallback sang CSV...")
        repo_root = Path(__file__).resolve().parent.parent.parent.parent
        documents = load_documents_from_csv(repo_root, limit=limit_products)

    print(f"📚 Total documents loaded: {len(documents)}")
    return documents


def create_single_hop_synthesizer(llm) -> SingleHopSpecificQuerySynthesizer:
    """Tạo synthesizer với deterministic theme-persona mapping (tránh 1 LLM call/thêm)."""
    synth = SingleHopSpecificQuerySynthesizer(llm=llm, property_name="entities")

    async def static_theme_persona_match(data, llm=None, callbacks=None, retries_left=3, **kwargs):
        # Đơn giản: mỗi persona quan tâm toàn bộ themes, tiết kiệm 1 LLM call/node.
        mapping = {p.name: data.themes for p in data.personas}
        return PersonaThemesMapping(mapping=mapping)

    synth.theme_persona_matching_prompt.generate = static_theme_persona_match
    return synth


def attach_call_counter(llm, counter: dict):
    """Gắn counter vào llm.generate (và agenerate nếu có)."""
    orig_generate = llm.generate
    orig_agenerate = getattr(llm, "agenerate", None)

    def counted_generate(prompt, response_model):
        counter["calls"] += 1
        counter["prompt_chars"] += len(str(prompt))
        return orig_generate(prompt, response_model)

    async def counted_agenerate(prompt, response_model):
        counter["calls"] += 1
        counter["prompt_chars"] += len(str(prompt))
        if orig_agenerate:
            return await orig_agenerate(prompt, response_model)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, orig_generate, prompt, response_model)

    llm.generate = counted_generate
    llm.agenerate = counted_agenerate
    return llm


def build_generator(gemini_key_manager, embedding_model, gemini_model: str = None):
    """Build TestsetGenerator với Gemini LLM và embedding model."""
    from configs.GetConfig import config

    gemini_model = gemini_model or getattr(config.llm.google, "available", ["gemini-3.5-flash-lite"])[0]
    client = gemini_key_manager.create_client()
    llm = llm_factory(gemini_model, provider="google", client=client)

    generator = TestsetGenerator(llm=llm, embedding_model=embedding_model)
    generator.persona_list = [
        Persona(
            name="Khách mua laptop/điện thoại", 
            role_description="""Quan tâm giá, cấu hình, bảo hành, khuyến mãi.
            
            PHONG CÁCH CÂU HỎI (MÔ PHỎNG KHÁCH HÀNG THẬT):
            - Hãy đặt câu hỏi tự nhiên, có thể không dấu câu, viết tắt
            - Dùng ngôn ngữ đời thường, giống khách hàng thật
            - Không cần xưng hô, có thể gọi "shop", "em", hoặc không xưng
            - Ví dụ: "laptop hp này gia bao nhieu shop?", "may nay phu hop hoc tap k em?", "co mau duoi 20 trieu k?"
            """
        ),
        Persona(
            name="Người hỏi chính sách", 
            role_description="""Quan tâm đổi trả, giao hàng, bảo hành.
            
            PHONG CÁCH CÂU HỎI (MÔ PHỎNG KHÁCH HÀNG THẬT):
            - Hãy đặt câu hỏi tự nhiên, có thể không dấu câu, viết tắt
            - Dùng ngôn ngữ đời thường, giống khách hàng thật
            - Không cần xưng hô, có thể gọi "shop", "em", hoặc không xưng
            - Ví dụ: "chinh sach doi tra ben minh nhu the nao shop?", "bao hanh may nay bao lau?"
            """
        ),
    ]
    return generator, llm


def make_ner_transform(llm):
    """Tạo NERExtractor transform áp dụng cho CHUNK nodes."""
    is_chunk = lambda node: node.type.name == "CHUNK"
    return NERExtractor(llm=llm, filter_nodes=is_chunk)


def create_multi_hop_synthesizer(llm):
    """Tạo MultiHopQuerySynthesizer cho câu hỏi phức tạp (cần nhiều documents)."""
    from ragas.testset.synthesizers import MultiHopQuerySynthesizer
    return MultiHopQuerySynthesizer(llm=llm)


def create_comparison_synthesizer(llm):
    """Tạo ComparisonQuerySynthesizer cho câu hỏi so sánh sản phẩm."""
    from ragas.testset.synthesizers import ComparisonQuerySynthesizer
    return ComparisonQuerySynthesizer(llm=llm)


def format_testset(testset, prefix="ragas") -> List[dict]:
    """Chuyển RAGAS Testset thành JSONL format dự án."""
    df = testset.to_pandas()
    records = []
    for idx, row in df.iterrows():
        records.append({
            "id": f"{prefix}_{idx}",
            "category": "ragas_generated",
            "question": row["user_input"],
            "ground_truth": row["reference"],
            "context": row["reference_contexts"],
            "synthesizer_type": row["synthesizer_name"],
            "persona": row.get("persona_name", ""),
            "query_style": row.get("query_style", ""),
            "query_length": row.get("query_length", ""),
        })
    return records
