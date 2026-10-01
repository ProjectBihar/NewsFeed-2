"""Knowledge-base validation (Phase 9): schema, ids, references, collisions.

A surface form may be shared across facets of the SAME place (town /
subdivision / station / district / local river or road, e.g. "Gaya",
"Kiul") — Phase 10 disambiguates those by context. Sharing across
different places is a data bug and fails here.
"""

import json
import re
from datetime import date
from pathlib import Path

DATA = Path(__file__).parent.parent / "data"

FILES = {
    "geography/districts.json": ("district", "complete"),
    "geography/towns.json": ("town", "seed"),
    "geography/subdivisions.json": ("subdivision", "seed"),
    "geography/rivers.json": ("river", "seed"),
    "geography/places.json": ("place", "seed"),
    "geography/blocks.json": (None, "pending"),
    "institutions/universities.json": ("university", "seed"),
    "institutions/hospitals.json": ("hospital", "seed"),
    "institutions/departments.json": ("department", "seed"),
    "institutions/agencies.json": ("agency", "seed"),
    "institutions/corporations.json": ("corporation", "seed"),
    "infrastructure/airports.json": ("airport", "seed"),
    "infrastructure/railway_stations.json": ("railway_station", "seed"),
    "infrastructure/highways.json": ("highway", "seed"),
    "infrastructure/industrial_areas.json": ("industrial_area", "seed"),
    "infrastructure/major_projects.json": ("major_project", "seed"),
}

REQUIRED_KEYS = {
    "id", "canonical_name", "type", "aliases", "hindi_names",
    "romanisations", "district", "parent_entity", "latitude",
    "longitude", "valid_from", "valid_to",
}

ID_RE = re.compile(r"^[a-z0-9-]+$")
DIVISIONS = {"Patna", "Tirhut", "Saran", "Darbhanga", "Kosi", "Purnia", "Bhagalpur", "Munger", "Magadh"}
EXPECTED_DISTRICTS = {
    "araria", "arwal", "aurangabad", "banka", "begusarai", "bhagalpur",
    "bhojpur", "buxar", "darbhanga", "east-champaran", "gaya", "gopalganj",
    "jamui", "jehanabad", "kaimur", "katihar", "khagaria", "kishanganj",
    "lakhisarai", "madhepura", "madhubani", "munger", "muzaffarpur",
    "nalanda", "nawada", "patna", "purnia", "rohtas", "saharsa",
    "samastipur", "saran", "sheikhpura", "sheohar", "sitamarhi", "siwan",
    "supaul", "vaishali", "west-champaran",
}


def load_all():
    entities = []
    for rel, (_, coverage) in FILES.items():
        doc = json.loads((DATA / rel).read_text(encoding="utf-8"))
        assert doc["version"] == 1, rel
        assert doc["coverage"] == coverage, f"{rel}: coverage drift"
        assert isinstance(doc["entities"], list), rel
        for entity in doc["entities"]:
            entity["_file"] = rel
            entities.append(entity)
    return entities


def surfaces(entity):
    names = (
        [entity["canonical_name"]]
        + entity["aliases"]
        + entity["hindi_names"]
        + entity["romanisations"]
    )
    return {name.strip().lower() for name in names if name and name.strip()}


def test_schema_and_types():
    for entity in load_all():
        missing = REQUIRED_KEYS - set(entity)
        assert not missing, f'{entity.get("id")}: missing {missing}'
        assert ID_RE.match(entity["id"]), f'bad id {entity["id"]}'
        assert entity["canonical_name"].strip(), entity["id"]
        for key in ("aliases", "hindi_names", "romanisations"):
            assert isinstance(entity[key], list), entity["id"]
            assert all(isinstance(v, str) and v.strip() for v in entity[key]), entity["id"]
        for key in ("latitude", "longitude"):
            value = entity[key]
            assert value is None or isinstance(value, (int, float)), entity["id"]
        if entity["latitude"] is not None:
            assert -90 <= entity["latitude"] <= 90, entity["id"]
        if entity["longitude"] is not None:
            assert -180 <= entity["longitude"] <= 180, entity["id"]
        for key in ("valid_from", "valid_to"):
            if entity[key] is not None:
                date.fromisoformat(entity[key])


def test_ids_unique_and_references_valid():
    entities = load_all()
    ids = [e["id"] for e in entities]
    assert len(ids) == len(set(ids)), "duplicate entity ids"
    by_id = {e["id"]: e for e in entities}
    for entity in entities:
        if entity["district"] is not None:
            assert entity["district"] in EXPECTED_DISTRICTS, entity["id"]
        if entity["parent_entity"] is not None:
            assert entity["parent_entity"] in by_id, entity["id"]


def test_districts_complete():
    entities = load_all()
    districts = [e for e in entities if e["type"] == "district"]
    assert {e["id"] for e in districts} == EXPECTED_DISTRICTS
    assert len(districts) == 38
    for district in districts:
        assert district["hindi_names"], district["id"]
        assert district.get("division") in DIVISIONS, district["id"]
        assert district.get("headquarters"), district["id"]


def test_file_type_consistency_and_nonempty_seeds():
    entities = load_all()
    by_file: dict[str, list] = {}
    for entity in entities:
        by_file.setdefault(entity["_file"], []).append(entity)
    for rel, (expected_type, coverage) in FILES.items():
        present = by_file.get(rel, [])
        if coverage == "pending":
            assert present == [], rel
            continue
        assert present, rel
        if expected_type is not None:
            assert all(e["type"] == expected_type for e in present), rel


def test_hindi_names_for_districts_and_towns():
    for entity in load_all():
        if entity["type"] in ("district", "town"):
            assert entity["hindi_names"], entity["id"]


def test_pmch_aliases_resolve_to_one_entity():
    """The plan's example: PMCH and its variants are a single entity."""
    index: dict[str, set] = {}
    for entity in load_all():
        for surface in surfaces(entity):
            index.setdefault(surface, set()).add(entity["id"])
    for alias in (
        "pmch",
        "patna medical college",
        "patna medical college and hospital",
        "पीएमसीएच",
    ):
        assert index.get(alias) == {"hosp-pmch"}, alias


def test_collisions_only_same_place_facets():
    index: dict[str, set] = {}
    by_id = {}
    for entity in load_all():
        by_id[entity["id"]] = entity
        for surface in surfaces(entity):
            index.setdefault(surface, set()).add(entity["id"])
    bad = []
    for surface, ids in sorted(index.items()):
        if len(ids) < 2:
            continue
        # District-less entities (rivers, highways) attach no district, so
        # they never veto: the group must otherwise be a single place.
        slugs = set()
        for i in ids:
            entity = by_id[i]
            if entity["type"] == "district":
                slugs.add(entity["id"])
            elif entity["district"] is not None:
                slugs.add(entity["district"])
        if len(slugs) != 1:
            bad.append(f"{surface!r} -> {sorted(ids)}")
    assert not bad, "ambiguous surface forms:\n" + "\n".join(bad)
