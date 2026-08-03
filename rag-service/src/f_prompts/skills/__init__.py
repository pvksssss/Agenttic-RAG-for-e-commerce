"""
Skill loader for Master Agent prompts.

A "skill" is a markdown file that contains extra use-case instructions
appended to the system prompt before calling the LLM.  It does not replace
the main system prompt or tool schema; it gives the model concrete examples
for a specific task (single-spec lookup, ambiguous clarification, ...).

Skills are organized by category:
    f_prompts/skills/product/*.md
    f_prompts/skills/policy/*.md
    f_prompts/skills/account/*.md
"""

import re
from pathlib import Path
from typing import Optional, List

_SKILLS_DIR = Path(__file__).parent


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        text = re.sub(r"^---\n.*?---\n", "", text, flags=re.DOTALL)
    return text.strip()


def load_skill(name: str) -> Optional[str]:
    """
    Load a skill markdown file by name.

    `name` can be either a bare skill stem (e.g. "single_spec") or a
    category-qualified path (e.g. "product/single_spec").  When a bare name
    is ambiguous (exists in multiple categories), the first match is returned.
    """
    # category-qualified name (product/single_spec)
    if "/" in name:
        path = _SKILLS_DIR / f"{name}.md"
        if path.exists():
            return _strip_frontmatter(path.read_text(encoding="utf-8"))
        return None

    # bare name: search recursively
    for path in _SKILLS_DIR.rglob(f"{name}.md"):
        return _strip_frontmatter(path.read_text(encoding="utf-8"))
    return None


def list_skills() -> List[str]:
    """Return the list of available skill names as category/stem paths."""
    return sorted(
        str(p.relative_to(_SKILLS_DIR).with_suffix(""))
        for p in _SKILLS_DIR.rglob("*.md")
    )


def load_skills_by_category(category: str) -> List[str]:
    """Load all skill contents under a category folder."""
    contents = []
    for p in (_SKILLS_DIR / category).glob("*.md"):
        contents.append(_strip_frontmatter(p.read_text(encoding="utf-8")))
    return contents


def load_all_skills() -> str:
    """Load and concatenate all available skills."""
    parts = []
    for p in _SKILLS_DIR.rglob("*.md"):
        parts.append(_strip_frontmatter(p.read_text(encoding="utf-8")))
    return "\n\n---\n\n".join(parts)
