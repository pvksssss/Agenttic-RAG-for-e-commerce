import json
from configs.GetConfig import config
from configs.setting import settings
from src.c_retrieval.policy_retriever import PolicyRetriever

# INITIALIZE RETRIEVER FOR SHARED USE
policy_retriever = PolicyRetriever(config=config, settings=settings)

def policy_search(key_word: str, limit: int = 3) -> str:
    """
    Search for store policies (returns, warranty, shipping, etc.) based on search terms.

    Args:
        key_word (str): The search query extracted and optimized by the LLM (noise-filtered, concise search term).
        limit (int): Maximum number of policy segments to return (default: 3).
    """
    try:
        # Call the retrieval service layer
        raw_policies = policy_retriever.retrieve(query_text=key_word)
        
        if not raw_policies:
            return "No matching store policies found."

        # Limit the results based on LLM request or default
        selected_policies = raw_policies[:limit]
        
        # Format raw data list into a structured string for the LLM
        formatted_list = []
        for i, item in enumerate(selected_policies):
            doc_content = item["document"]
            metadata = item["metadata"]
            score = item["score"]
            
            # Extract policy section or source if available in metadata
            section = metadata.get("section", "General Policy")
            policy_type = metadata.get("policy_type", "FAQ")
            
            formatted_list.append(
                f"Policy Document {i+1} [Section: {section}] (Type: {policy_type}, Score: {score:.4f}):\n"
                f"{doc_content}"
            )
            
        return "\n\n".join(formatted_list)
        
    except Exception as e:
        return f"Error occurred during policy retrieval: {str(e)}"

# =====================================================================
# 3. SCHEMA DEFINITION FOR LLM API REGISTRATION
# =====================================================================
POLICY_SEARCH_SCHEMA = {
    "type": "function",
    "function": {
        "name": "policy_search",
        "description": (
            "Search for store policies (warranty regulations, return policy, delivery fees, customer support, etc.). "
            "Use this tool when users ask questions about store regulations, policies, or how-to procedures. "
            "Also use it when a compound question mixes a product query with a policy question (e.g. price of X + does the store support installment/return/warranty)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "key_word": {
                    "type": "string",
                    "description": (
                        "The search query extracted and optimized by the LLM (noise-filtered, concise search term. "
                        "Do NOT include greeting words or conversational filler. "
                        "Keep it to 1-3 relevant Vietnamese keywords. "
                        "Example: convert 'Can you tell me about the return warranty policy?' to 'warranty return'."
                    )
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of policy segments to return (default: 3)."
                }
            },
            "required": ["key_word"]
        }
    }
}
