import os
import yaml
from pathlib import Path

# Thư mục gốc (rag-service/)
BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = os.path.join(BASE_DIR, "configs", "config.yaml")

class AppConfig:
    class Chunking:
        def __init__(self, data):
            self.chunk_size = data.get("chunk_size", 1000)
            self.chunk_overlap = data.get("chunk_overlap", 200)

    class Retrieval:
        class Product:
            def __init__(self, data):
                self.k_query = data.get("k_query", 15)
                self.k_rerank = data.get("k_rerank", 5)

        class Policy:
            def __init__(self, data):
                self.k_query = data.get("k_query", 5)
                self.k_rerank = data.get("k_rerank", 2)

        def __init__(self, data):
            self.product = self.Product(data.get("product", {}))
            self.policy = self.Policy(data.get("policy", {}))
            
            # Tương thích ngược: ưu tiên lấy từ root nếu file yaml cũ, nếu không lấy từ product
            self.k_query = data.get("k_query", self.product.k_query)
            self.k_rerank = data.get("k_rerank", self.product.k_rerank)
            
            self.graph_max_hops = data.get("graph_max_hops", 2)
            self.rrf_k = data.get("rrf_k", 60)

    class Generation:
        def __init__(self, data):
            self.temperature = data.get("temperature", 0.0)
            self.max_tokens = data.get("max_tokens", 2048)
            self.top_p = data.get("top_p", 1.0)
            self.reasoning_effort = data.get("reasoning_effort", "default")
            self.stream = data.get("stream", False)
            
            # Chuẩn hóa giá trị stop từ config.yaml
            stop_val = data.get("stop", None)
            if isinstance(stop_val, str) and stop_val.strip().lower() in ["none", "null", ""]:
                self.stop = None
            else:
                self.stop = stop_val

    class LLM:
        class ProviderCatalog:
            def __init__(self, data):
                self.available = data.get("available", [])
                self.reasoning_effort = data.get("reasoning_effort", "medium")

        class Ollama:
            """Cấu hình model local qua Ollama (OpenAI-compatible)."""
            def __init__(self, data):
                self.base_url = data.get("base_url", "http://localhost:11434/v1")
                self.reasoning_effort = data.get("reasoning_effort", "none")
                self.supports_tools = data.get("supports_tools", True)
                self.available = data.get("available", [])

        def __init__(self, data):
            # Model active cho router và qa
            self.router = data.get("router", {})
            self.qa = data.get("qa", {})
            
            # Catalog model của từng nhà cung cấp dạng Object
            self.google = self.ProviderCatalog(data.get("google", {}))
            self.groq = self.ProviderCatalog(data.get("groq", {}))
            self.openrouter = self.ProviderCatalog(data.get("openrouter", {}))
            self.ollama = self.Ollama(data.get("ollama", {}))
            
            # Giữ lại catalog dict cũ để tương thích ngược nếu cần
            self.catalog = {
                "google": self.google.available,
                "groq": self.groq.available,
                "openrouter": self.openrouter.available,
                "ollama": self.ollama.available
            }

    class Agent:
        def __init__(self, data):
            self.max_turns = data.get("max_turns", 5)
            self.max_attempts = data.get("max_attempts", 3)

    class Embedding:
        def __init__(self, data):
            self.available = data.get("available", [])
            self.active = data.get("active", "nvidia/llama-nemotron-embed-vl-1b-v2:free")

    def __init__(self, raw_yaml):
        self.chunking = self.Chunking(raw_yaml.get("chunking", {}))
        self.retrieval = self.Retrieval(raw_yaml.get("retrieval", {}))
        self.generation = self.Generation(raw_yaml.get("generation", {}))
        self.agent = self.Agent(raw_yaml.get("agent", {}))
        self.llm = self.LLM(raw_yaml.get("llm", {}))
        self.embedding = self.Embedding(raw_yaml.get("embedding", {}))

# Hàm helper đọc file YAML và khởi tạo đối tượng AppConfig
def load_config(config_path: str = DEFAULT_CONFIG_PATH) -> AppConfig:
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Không tìm thấy file cấu hình tại {config_path}")
        
    with open(config_path, "r", encoding="utf-8") as f:
        raw_yaml = yaml.safe_load(f)
    return AppConfig(raw_yaml)

# Tạo một thực thể (instance) config dùng chung toàn cục
config = load_config()
