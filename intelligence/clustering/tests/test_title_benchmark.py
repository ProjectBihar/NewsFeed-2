"""Phase 18 completion gate: representative clusters get sensible titles."""

import json
from pathlib import Path

from clustering import select_title

SET_PATH = Path(__file__).parent / "fixtures" / "story-clusters.json"

EXPECTED = {
    "metro-approval": "m1a",
    "flood-relief": "f1b",
    "bpsc-calendar": "b1a",
    "bridge-collapse": "br1a",
}


def test_representative_clusters_receive_sensible_titles():
    articles = json.loads(SET_PATH.read_text(encoding="utf-8"))["articles"]
    by_id = {a["id"]: a for a in articles}
    failures = []
    for story, winner_id in EXPECTED.items():
        members = [a for a in articles if a["story"] == story]
        assert len(members) >= 2, story
        result = select_title(members).to_dict()
        if result["canonical_title"] != by_id[winner_id]["headline"]:
            failures.append(
                f'{story}: chose {result["canonical_title"]!r} '
                f'(expected {by_id[winner_id]["headline"]!r})'
            )
    assert not failures, "title failures:\n" + "\n".join(failures)
