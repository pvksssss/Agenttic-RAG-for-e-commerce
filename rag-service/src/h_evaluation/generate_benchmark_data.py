"""
Generate Benchmark Data for Agentic RAG E-commerce
Sử dụng RAGAS TestsetGenerator (API hiện tại - đã verify với ragas 0.4.3)
để sinh test set cho benchmark.

Đã sửa so với bản cũ:
- Bỏ hẳn LangChain wrapper (LangchainLLMWrapper đã deprecated) -> dùng
  llm_factory()/embedding_factory() thẳng với client kiểu OpenAI.
- Bỏ critic_llm (API mới gộp làm 1 llm duy nhất).
- Sửa tên cột output: user_input / reference / reference_contexts / synthesizer_name
  (KHÔNG còn question / ground_truth / contexts / evolution_type).
- Bỏ Cerebras (thừa, chỉ giữ Groq).
- Bỏ RateLimiter tự viết tay -> dùng RunConfig(max_workers=...) có sẵn của Ragas.
"""
from ragas.testset import TestsetGenerator
from ragas.llms import llm_factory
from ragas.embeddings import embedding_factory
from ragas.run_config import RunConfig
from langchain_core.documents import Document
from openai import OpenAI
import json
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent.parent))

from configs.GetConfig import config
from configs.setting import settings
from src.b_indexing.b0_vector_db import ChromaVectorDatabase

# =====================================================================
# 1. Chuẩn bị dữ liệu nguồn
# =====================================================================

def load_documents(limit_products=100, limit_policies=50):
    """
    Load documents từ ChromaDB:
    - products_collection (mô tả sản phẩm)
    - policies_collection (chính sách shop)
    
    Args:
        limit_products: Số lượng sản phẩm tối đa (default: 100)
        limit_policies: Số lượng chính sách tối đa (default: 50)
    
    Returns:
        List of Document objects for RAGAS
    """
    documents = []
    db = ChromaVectorDatabase()
    
    # Load từ products_collection
    print("📦 Loading products from ChromaDB...")
    products_data = db.get_all_documents("products_collection", limit=limit_products)
    
    if products_data and products_data.get("documents"):
        for doc, meta in zip(products_data["documents"], products_data["metadatas"]):
            documents.append(Document(
                page_content=doc,
                metadata={"type": "product", **meta}
            ))
        print(f"   ✅ Loaded {len(products_data['documents'])} products")
    else:
        print("   ⚠️ No products found in collection")
    
    # Load từ policies_collection
    print("📜 Loading policies from ChromaDB...")
    policies_data = db.get_all_documents("policies_collection", limit=limit_policies)
    
    if policies_data and policies_data.get("documents"):
        for doc, meta in zip(policies_data["documents"], policies_data["metadatas"]):
            documents.append(Document(
                page_content=doc,
                metadata={"type": "policy", **meta}
            ))
        print(f"   ✅ Loaded {len(policies_data['documents'])} policies")
    else:
        print("   ⚠️ No policies found in collection")
    
    print(f"📚 Total documents loaded: {len(documents)}")
    return documents

# =====================================================================
# 2. Cấu hình RAGAS TestsetGenerator — API MỚI, không qua LangChain
# =====================================================================

def setup_generator():
    """
    Setup TestsetGenerator dùng Groq (LLM) + OpenRouter (embedding), qua
    llm_factory()/embedding_factory() thẳng - cách được Ragas 0.4.x khuyến
    nghị (LangchainLLMWrapper đã deprecated).

    Lưu ý QUAN TRỌNG: nên dùng model KHÁC với model đang chạy Agent thật
    để tránh self-bias (xem lại phần đã bàn về vấn đề circularity bias).

    Groq rate-limit tham khảo: 30 req/min, 1.000 req/day, 8.000 token/min.
    Models khả dụng (config.yaml): openai/gpt-oss-120b, openai/gpt-oss-20b,
    qwen/qwen3.6-27b.
    """
    print("=" * 60)
    print("⚙️  SETUP GENERATOR")
    print("=" * 60)
    
    model_name = config.llm.groq.available[0]  # openai/gpt-oss-120b
    print(f"🤖 LLM Model: {model_name}")
    print(f"🔑 Groq API Key: {settings.GROQ_API_KEY[:10]}..." if settings.GROQ_API_KEY else "❌ No Groq API Key")

    # Groq tương thích OpenAI API -> dùng client OpenAI trỏ base_url sang Groq.
    # KHÔNG dùng provider="groq" trực tiếp trong llm_factory - adapter Instructor
    # của Ragas hiện chưa patch đúng client Groq gốc (lỗi 'Groq' object has no
    # attribute 'messages' khi test thực tế).
    print("🔧 Setting up Groq client via OpenAI API...")
    groq_client = OpenAI(
        api_key=settings.GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1",
    )
    generator_llm = llm_factory(model_name, provider="openai", client=groq_client)
    print("✅ Groq LLM setup complete")

    # Embedding qua OpenRouter (cũng tương thích OpenAI API) - dùng đúng model
    # đang cấu hình trong EmbeddingService (b1_embedding.py) để đồng bộ với
    # phần embedding thật của hệ thống.
    embed_model = getattr(config.embedding, "active", None) or "nvidia/llama-nemotron-embed-vl-1b-v2:free"
    print(f"🔤 Embedding Model: {embed_model}")
    print(f"🔑 OpenRouter API Key: {settings.OPENROUTER_API_KEY[:10]}..." if settings.OPENROUTER_API_KEY else "❌ No OpenRouter API Key")
    
    print("🔧 Setting up OpenRouter client...")
    openrouter_client = OpenAI(
        api_key=settings.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )
    generator_embeddings = embedding_factory(
        provider="openai", model=embed_model, client=openrouter_client
    )
    print("✅ OpenRouter Embedding setup complete")

    generator = TestsetGenerator(llm=generator_llm, embedding_model=generator_embeddings)
    print("✅ TestsetGenerator created")
    
    return generator

# =====================================================================
# 3. Sinh test set
# =====================================================================

def generate_testset(documents, output_path, num_samples=20):
    """
    Sinh test set. RAGAS 0.4.x tự chọn query_distribution mặc định (không
    còn import simple/reasoning/multi_context từ ragas.testset.evolutions -
    module đó không còn tồn tại trong bản mới).

    max_workers=2 để khớp rate-limit free tier của Groq (30 req/min) - chạy
    song song nhiều hơn dễ dính 429 liên tục.
    """
    print("=" * 60)
    print("🚀 BẮT ĐẦU SINH TEST SET")
    print("=" * 60)
    print(f"📚 Số lượng documents đầu vào: {len(documents)}")
    print(f"🎯 Số lượng câu hỏi cần sinh: {num_samples}")
    
    generator = setup_generator()
    print("✅ Generator setup hoàn tất")

    run_config = RunConfig(max_workers=1, max_retries=5, max_wait=60)  # Giảm xuống 1 để dễ theo dõi
    print("⚙️  RunConfig: max_workers=1 (sequential), max_retries=5")

    print("\n🔄 BẮT ĐẦU GỌI RAGAS...")
    print("   - Bước 1: Embedding documents (OpenRouter)")
    print("   - Bước 2: Apply transforms (HeadlinesExtractor, Splitter, etc.)")
    print("   - Bước 3: Generate questions (Groq)")
    print("-" * 60)
    
    import time
    start_time = time.time()
    
    testset = generator.generate_with_langchain_docs(
        documents,
        testset_size=num_samples,
        run_config=run_config,
        with_debugging_logs=True,
    )
    
    elapsed_time = time.time() - start_time
    print(f"⏱️  Tổng thời gian: {elapsed_time:.1f}s ({elapsed_time/60:.1f} phút)")

    print("-" * 60)
    print("✅ RAGAS hoàn tất!")
    
    testset_df = testset.to_pandas()

    # In ra để tự xác nhận tên cột đúng trước khi tin tưởng dùng — RAGAS đổi
    # API khá thường xuyên, nên luôn kiểm tra lại thay vì tin chắc 100%.
    print(f"📋 Các cột thực tế trong output: {list(testset_df.columns)}")

    formatted_data = []
    for idx, row in testset_df.iterrows():
        formatted_data.append({
            "id": f"ragas_{idx}",
            "category": "ragas_generated",
            "question": row["user_input"],                 # trước đây: "question"
            "ground_truth": row["reference"],                # trước đây: "ground_truth"
            "context": row["reference_contexts"],             # trước đây: "contexts"
            "synthesizer_type": row["synthesizer_name"],      # trước đây: "evolution_type"
        })

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        for item in formatted_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"✅ Đã sinh {len(formatted_data)} câu hỏi vào {output_path}")
    print("📊 Phân phối theo synthesizer:")
    from collections import Counter
    for name, count in Counter(item["synthesizer_type"] for item in formatted_data).items():
        print(f"   - {name}: {count}")

    return formatted_data

# =====================================================================
# 4. Spot-check thủ công (QUAN TRỌNG)
# =====================================================================

def spot_check_testset(testset_path, num_check=5):
    """
    Spot-check 10-15% test set trước khi tin dùng chính thức.
    Vì dữ liệu đã qua nhiều lượt LLM: Icecat -> tiếng Việt -> RAGAS.
    """
    import random

    with open(testset_path, "r", encoding="utf-8") as f:
        data = [json.loads(line) for line in f]

    samples = random.sample(data, min(num_check, len(data)))

    print("=" * 60)
    print("🔍 SPOT CHECK TEST SET")
    print("=" * 60)
    for i, item in enumerate(samples, 1):
        print(f"\n[{i}] Question: {item['question']}")
        print(f"    Ground Truth: {item['ground_truth']}")
        print(f"    Synthesizer: {item['synthesizer_type']}")
        print(f"    Contexts: {len(item['context'])} docs")
        print("-" * 40)

    print("\n❓ Đánh giá thủ công:")
    print("   - Câu hỏi có hợp lý không?")
    print("   - Ground truth có khớp với context không?")
    print("   - Có thông tin bị trôi/lệch không?")

# =====================================================================
# 5. Main execution
# =====================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Sinh test set với RAGAS (Groq + OpenRouter)")
    parser.add_argument("--num-samples", type=int, default=20,
                        help="Số lượng câu hỏi sinh ra (default: 20)")
    parser.add_argument("--output", type=str,
                        default="src/h_evaluation/test_sets/ragas_generated.jsonl",
                        help="Đường dẫn output file")
    args = parser.parse_args()

    print("=" * 60)
    print("🚀 RAGAS Testset Generator - Provider: Groq (LLM) + OpenRouter (Embedding)")
    print("=" * 60)

    documents = load_documents()
    print(f"📚 Loaded {len(documents)} documents")

    print(f"\n🔄 Sinh {args.num_samples} câu hỏi...")
    generate_testset(documents, args.output, num_samples=args.num_samples)

    spot_check_testset(args.output, num_check=5)

    print("\n✅ Hoàn tất!")
