"""Knowledge-base loading and surface-form index (Phase 10).

Loads data/*.json once; builds a normalized alias index consumed by the
evidence matcher. District references resolve the same-place facets
(town/subdivision/station/district) for corroboration.
"""

import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

KB_FILES = [
    "geography/districts.json",
    "geography/towns.json",
    "geography/subdivisions.json",
    "geography/rivers.json",
    "geography/places.json",
    "geography/blocks.json",
    "institutions/universities.json",
    "institutions/hospitals.json",
    "institutions/departments.json",
    "institutions/agencies.json",
    "institutions/corporations.json",
    "infrastructure/airports.json",
    "infrastructure/railway_stations.json",
    "infrastructure/highways.json",
    "infrastructure/industrial_areas.json",
    "infrastructure/major_projects.json",
]

GEO_TYPES = {"district", "town", "subdivision", "river"}
INSTITUTION_TYPES = {"university", "hospital", "department", "agency", "corporation"}
INFRA_TYPES = {"airport", "railway_station", "highway", "industrial_area", "major_project"}


def _is_acronym(surface: str) -> bool:
    letters = re.sub(r"[^A-Za-z]", "", surface)
    return 2 <= len(letters) <= 5 and letters.isupper() and len(surface) <= 7


def _compile_surface(surface: str):
    """Acronyms match case-sensitively; Latin matches word-bounded; else substring."""
    if re.search(r"[A-Za-z]", surface):
        flags = 0 if _is_acronym(surface) else re.IGNORECASE
        return re.compile(r"\b" + re.escape(surface) + r"\b", flags)
    return surface  # Devanagari and symbols: plain substring


class KnowledgeBase:
    def __init__(self) -> None:
        self.entities: dict[str, dict] = {}
        self.patterns: list[tuple] = []  # (compiled, entity_id)
        self.district_ids: set[str] = set()
        for rel in KB_FILES:
            doc = json.loads((DATA_DIR / rel).read_text(encoding="utf-8"))
            for entity in doc["entities"]:
                self.entities[entity["id"]] = entity
                if entity["type"] == "district":
                    self.district_ids.add(entity["id"])
                seen = set()
                surfaces = (
                    [entity["canonical_name"]]
                    + entity["aliases"]
                    + entity["hindi_names"]
                    + entity["romanisations"]
                )
                for surface in surfaces:
                    key = surface.strip().lower()
                    if not key or key in seen:
                        continue
                    seen.add(key)
                    self.patterns.append((_compile_surface(surface.strip()), entity["id"]))

    def district_of(self, entity_id: str) -> str | None:
        entity = self.entities[entity_id]
        if entity["type"] == "district":
            return entity["id"]
        return entity["district"]


_KB: KnowledgeBase | None = None


def get_knowledge_base() -> KnowledgeBase:
    global _KB
    if _KB is None:
        _KB = KnowledgeBase()
    return _KB
