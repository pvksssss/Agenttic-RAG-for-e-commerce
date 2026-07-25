"""
Central Exporter for Agent System Prompts, Guidelines & Few-shot Examples.
"""

from .master.system import SYSTEM_PROMPT as MASTER_SYSTEM_PROMPT
from .master.style import STYLE_GUIDE as MASTER_STYLE_GUIDE
from .master.fewshot import FEWSHOT_EXAMPLES as MASTER_FEWSHOTS

from .security.system import SECURITY_SYSTEM_PROMPT
from .security.examples import SECURITY_FEWSHOT_EXAMPLES

from .rejection.system import REJECTION_SYSTEM_PROMPT
from .rejection.style import REJECTION_STYLE_GUIDE
from .rejection.fewshot import REJECTION_FEWSHOT_EXAMPLES


def _format_master_fewshots(fewshots: list[dict]) -> str:
    """Format Master Agent few-shot examples into Markdown text."""
    formatted_blocks = []
    for i, item in enumerate(fewshots, 1):
        block = (
            f"### Example {i}:\n"
            f"- Available Context: {item['context']}\n"
            f"- User Query: \"{item['user']}\"\n"
            f"- Expected Assistant Response: {item['assistant']}"
        )
        formatted_blocks.append(block)
    return "# FEW-SHOT EXAMPLES\n\n" + "\n\n".join(formatted_blocks)


def _format_security_fewshots(fewshots: list[dict]) -> str:
    """Format Security Classifier few-shot examples into Markdown text."""
    formatted_blocks = []
    for item in fewshots:
        block = f"- Message: \"{item['message']}\" -> Classification: {item['label']}"
        formatted_blocks.append(block)
    return "# SECURITY CLASSIFICATION EXAMPLES:\n" + "\n".join(formatted_blocks)


def _format_rejection_fewshots(fewshots: list[dict]) -> str:
    """Format Rejection Agent few-shot examples into Markdown text."""
    formatted_blocks = []
    for i, item in enumerate(fewshots, 1):
        block = (
            f"### Example {i}:\n"
            f"- Classification: {item['classification']}\n"
            f"- User: \"{item['user']}\"\n"
            f"- Assistant: {item['assistant']}"
        )
        formatted_blocks.append(block)
    return "# REJECTION EXAMPLES\n\n" + "\n\n".join(formatted_blocks)


MASTER_FEWSHOT_TEXT = _format_master_fewshots(MASTER_FEWSHOTS)
SECURITY_FEWSHOT_TEXT = _format_security_fewshots(SECURITY_FEWSHOT_EXAMPLES)
REJECTION_FEWSHOT_TEXT = _format_rejection_fewshots(REJECTION_FEWSHOT_EXAMPLES)

FULL_MASTER_PROMPT = f"{MASTER_SYSTEM_PROMPT}\n\n{MASTER_STYLE_GUIDE}\n\n{MASTER_FEWSHOT_TEXT}"
FULL_SECURITY_PROMPT = f"{SECURITY_SYSTEM_PROMPT}\n\n{SECURITY_FEWSHOT_TEXT}"
FULL_REJECTION_PROMPT = f"{REJECTION_SYSTEM_PROMPT}\n\n{REJECTION_STYLE_GUIDE}\n\n{REJECTION_FEWSHOT_TEXT}"
