from __future__ import annotations

from orchid_tg.rubric import score_corpus


def test_scores_inbound_with_burst() -> None:
    events = [
        {"direction": "out", "msg_id": 1, "text": "yo", "ts": "t0"},
        {"direction": "in", "msg_id": 2, "text": "hey", "ts": "t1"},
        {"direction": "in", "msg_id": 3, "text": "whats up", "ts": "t2"},
        {"direction": "out", "msg_id": 4, "text": "nothing much", "ts": "t3"},
        {
            "direction": "in",
            "msg_id": 5,
            "text": "Just waiting for you to lead. You had the floor.",
            "ts": "t4",
        },
    ]
    rows = score_corpus(events, source="test")
    assert len(rows) == 3
    assert rows[0].burst_size == 2 and rows[0].burst_index == 1
    assert rows[1].burst_size == 2 and rows[1].burst_index == 2
    assert rows[2].facilitator_smell == "Y"
    assert rows[0].emoji_count == 0
