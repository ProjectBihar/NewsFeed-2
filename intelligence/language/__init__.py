"""Language detection package (Phase 8). Parses text only."""

from .detector import LanguageResult, detect_language, format_script_mix, script_mix
from .profiles import LanguageProfile, PROFILES, register_language

__version__ = "0.1.0"

__all__ = [
    "LanguageResult",
    "LanguageProfile",
    "PROFILES",
    "detect_language",
    "format_script_mix",
    "register_language",
    "script_mix",
]
