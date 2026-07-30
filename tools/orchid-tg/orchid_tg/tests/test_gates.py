from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock


class GatesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.home = Path(self._tmpdir.name)
        self._env = mock.patch.dict(
            os.environ,
            {"COMPOSER_ASSISTANT_HOME": str(self.home)},
            clear=False,
        )
        self._env.start()
        # Import after env so paths resolve into tmp
        from orchid_tg import gates
        from orchid_tg.lint import lint_outbound

        self.gates = gates
        self.lint_outbound = lint_outbound
        (self.home / "orchid-logs").mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self._env.stop()
        self._tmpdir.cleanup()

    def _write_voice(self, texts: list[str]) -> None:
        path = self.home / "orchid-logs" / "voice-lock.jsonl"
        with path.open("w", encoding="utf-8") as fh:
            for t in texts:
                fh.write(json.dumps({"ts": "2026-07-30T00:00:00+00:00", "text": t}) + "\n")

    def test_tipoff_lint_blocks_test_label(self) -> None:
        r = self.lint_outbound("quick note for later (TEST): i like quiet mornings")
        self.assertFalse(r.ok)
        self.assertIn("tipoff_phrase", r.errors)

    def test_near_dupe_exact(self) -> None:
        self._write_voice(["hey brain fried rn, gonna nap"])
        r = self.gates.check_all(
            "hey brain fried rn, gonna nap",
            [],
            skip_incident=True,
        )
        self.assertFalse(r.ok)
        self.assertIn("near_duplicate", r.errors)

    def test_near_dupe_ratio(self) -> None:
        self._write_voice(["i like quiet mornings and hate calendar spam"])
        r = self.gates.check_all(
            "i like quiet mornings and hate calendar spam!",
            [],
            skip_incident=True,
        )
        self.assertFalse(r.ok)
        self.assertIn("near_duplicate", r.errors)

    def test_open_question_requires_answer(self) -> None:
        hist = [
            {"out": False, "text": "what timezone are you in?"},
        ]
        r = self.gates.check_all(
            "anyway remind me about the dentist later",
            hist,
            skip_incident=True,
        )
        self.assertFalse(r.ok)
        self.assertIn("must_answer_open_question", r.errors)

    def test_open_question_short_answer_ok(self) -> None:
        hist = [
            {"out": False, "text": "what timezone are you in?"},
        ]
        r = self.gates.check_all(
            "nah europe/istanbul, izmir",
            hist,
            skip_incident=True,
        )
        self.assertTrue(r.ok, r.errors)

    def test_force_unrelated_skips_open_q_only(self) -> None:
        hist = [
            {"out": False, "text": "what timezone are you in?"},
        ]
        r = self.gates.check_all(
            "anyway remind me about the dentist later",
            hist,
            force_unrelated="doc said change subject now",
            skip_incident=True,
        )
        self.assertTrue(r.ok, r.errors)
        self.assertIn("force_unrelated", r.meta)

    def test_force_unrelated_short_denied(self) -> None:
        hist = [
            {"out": False, "text": "what timezone are you in?"},
        ]
        r = self.gates.check_all(
            "anyway remind me about the dentist later",
            hist,
            force_unrelated="short",
            skip_incident=True,
        )
        self.assertFalse(r.ok)
        self.assertIn("must_answer_open_question", r.errors)

    def test_force_does_not_skip_dupe(self) -> None:
        self._write_voice(["same bubble again"])
        hist = [{"out": False, "text": "how are you?"}]
        r = self.gates.check_all(
            "same bubble again",
            hist,
            force_unrelated="doc said change subject now",
            skip_incident=True,
        )
        self.assertFalse(r.ok)
        self.assertIn("near_duplicate", r.errors)

    def test_incident_lock_blocks(self) -> None:
        self.gates.ensure_incident_lock_seeded()
        r = self.gates.check_all("hey just checking in", [], skip_incident=False)
        self.assertFalse(r.ok)
        self.assertIn("incident_locked_awaiting_doc_clear", r.errors)

    def test_incident_clear_unlocks(self) -> None:
        self.gates.ensure_incident_lock_seeded()
        self.gates.clear_incident_lock(by="test")
        r = self.gates.check_all("hey just checking in", [], skip_incident=False)
        self.assertTrue(r.ok, r.errors)

    def test_min_gap(self) -> None:
        day = time.strftime("%Y%m%d", time.gmtime())
        path = self.home / "orchid-logs" / f"{day}.jsonl"
        path.write_text(
            json.dumps(
                {
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
                    "direction": "out",
                    "text": "prior",
                }
            )
            + "\n",
            encoding="utf-8",
        )
        r = self.gates.check_all("fresh different bubble", [], skip_incident=True)
        self.assertFalse(r.ok)
        self.assertIn("min_gap", r.errors)

    def test_parse_draft_send(self) -> None:
        from orchid_tg.loop import parse_pending_draft

        kind, payload = parse_pending_draft("SEND: hey rn brain mush")
        self.assertEqual(kind, "SEND")
        self.assertEqual(payload, "hey rn brain mush")

    def test_parse_draft_no_send(self) -> None:
        from orchid_tg.loop import parse_pending_draft

        kind, payload = parse_pending_draft("NO_SEND: nothing natural")
        self.assertEqual(kind, "NO_SEND")
        self.assertEqual(payload, "nothing natural")


if __name__ == "__main__":
    unittest.main()
