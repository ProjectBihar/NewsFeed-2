"""Pipeline proof (Phase 15): LSH retrieves, blocking prunes templates,
confirmation merges only genuine rewrites — comparisons stay bounded."""

import json
from pathlib import Path

from dedup import IndexedArticle, LSHIndex, MinHash, QueryArticle, find_near_duplicates, index_signature, shingles

SET_PATH = Path(__file__).parent / "fixtures" / "neardup-cases.json"
_minhash = MinHash()


def _indexed(doc_id, text, hour, locations=(), entities=(), category=None, event=None):
    # Unigram signatures: recall-oriented retrieval (paraphrases collide);
    # blocking plus cosine confirmation restore precision downstream.
    return IndexedArticle(
        id=doc_id,
        signature=index_signature(text),
        published_at=hour * 3600.0,
        locations=frozenset(locations),
        entities=frozenset(entities),
        category=category,
        event_type=event,
    )


def _texts():
    cases = json.loads(SET_PATH.read_text(encoding="utf-8"))["pairs"]
    return {c["id"]: c for c in cases}


def test_pipeline_merges_rewrite_and_ignores_templates():
    cases = _texts()
    texts = {}
    index = LSHIndex()
    background = [
        ("bg-crime", "Police arrested two men for theft in the market area late night.", 1, ("patna",), (), "Governance", "crime"),
        ("bg-sport", "The home team won the cricket match by six wickets in a thriller.", 2, (), (), None, None),
        ("bg-health", "Doctors advised vaccination as fever cases rose in the district.", 3, ("gaya",), (), "Healthcare", None),
    ]
    for doc_id, text, hour, locations, entities, category, event in background:
        texts[doc_id] = text
        index.add(_indexed(doc_id, text, hour, locations, entities, category, event))

    metro_a, metro_b = cases["paraphrase-metro"]["a"], cases["paraphrase-metro"]["b"]
    texts["metro-a"] = metro_a
    index.add(_indexed("metro-a", metro_a, 10, ("patna", "bihta"), ("patna-metro",), "Infrastructure", "approval"))
    texts["metro-b"] = metro_b

    query = QueryArticle(
        id="metro-b", text=metro_b, published_at=11 * 3600.0,
        locations=frozenset({"patna", "bihta"}), entities=frozenset({"patna-metro"}),
        category="Infrastructure", event_type="approval",
    )
    confirmed = find_near_duplicates(query, index, texts)
    assert [doc_id for doc_id, _ in confirmed] == ["metro-a"]

    # Same-skeleton templates for different places never reach confirmation:
    # no location/entity overlap and no compatible category+event pair.
    # (Bag similarity alone cannot separate shared skeletons from shared
    # facts, so blocking — not scoring — owns this case.)
    tpl_a = (
        "The weather department forecast light rain in Patna over the next two days. "
        "Maximum temperature will hover around 33 degrees. The monsoon remains active "
        "over the region. Fishermen are advised to stay alert."
    )
    tpl_b = (
        "The weather department forecast light rain in Gaya over the next two days. "
        "Maximum temperature will hover around 35 degrees. The monsoon remains active "
        "over the region. Fishermen are advised to stay alert."
    )
    texts["tpl-a"] = tpl_a
    index.add(_indexed("tpl-a", tpl_a, 20, ("patna",), (), "Environment", None))
    texts["tpl-b"] = tpl_b
    query_tpl = QueryArticle(
        id="tpl-b", text=tpl_b, published_at=21 * 3600.0,
        locations=frozenset({"gaya",}), entities=frozenset(),
        category="Environment", event_type=None,
    )
    assert find_near_duplicates(query_tpl, index, texts) == []
