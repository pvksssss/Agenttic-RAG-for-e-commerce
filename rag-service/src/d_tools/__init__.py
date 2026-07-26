from .product import (
    product_search, PRODUCT_SEARCH_SCHEMA,
    product_compare, PRODUCT_COMPARE_SCHEMA
)
from .policy import (
    policy_search, POLICY_SEARCH_SCHEMA
)
from .account import (
    order_lookup, ORDER_LOOKUP_SCHEMA
)

# List of schemas to send to the LLM API for registration
ALL_TOOLS_SCHEMA = [
    PRODUCT_SEARCH_SCHEMA,
    POLICY_SEARCH_SCHEMA,
    PRODUCT_COMPARE_SCHEMA,
    ORDER_LOOKUP_SCHEMA
]

# Mapping dictionary to resolve and execute python functions dynamically
ALL_AVAILABLE_TOOLS = {
    "product_search": product_search,
    "policy_search": policy_search,
    "product_compare": product_compare,
    "order_lookup": order_lookup
}
