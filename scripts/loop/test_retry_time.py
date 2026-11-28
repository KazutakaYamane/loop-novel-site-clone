"""利用上限のエラー文から、再開してよい時刻を読む処理の試験。"""

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
retry_time = runpy.run_path(str(HERE / "claude_log.py"))["retry_time"]
JST = timezone(timedelta(hours=9))
NOW = datetime(2026, 11, 28, 10, 45, 48, tzinfo=JST)
CODEX = "You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at {}."


class RetryTime(unittest.TestCase):
    def at(self, text):
        value = retry_time(text, NOW)
        return None if value is None else datetime.fromtimestamp(value, JST)

    def test_codex_clock_time_later_today(self):
        self.assertEqual(self.at(CODEX.format("12:52 PM")), datetime(2026, 11, 28, 12, 52, tzinfo=JST))

    def test_codex_clock_time_that_has_passed_means_tomorrow(self):
        self.assertEqual(self.at(CODEX.format("9:05 AM")), datetime(2026, 11, 29, 9, 5, tzinfo=JST))

    def test_codex_date_and_time(self):
        self.assertEqual(self.at(CODEX.format("Dec 1st, 2026 3:04 PM")), datetime(2026, 12, 1, 15, 4, tzinfo=JST))
        self.assertEqual(self.at(CODEX.format("Nov 30th 12:00 AM")), datetime(2026, 11, 30, 0, 0, tzinfo=JST))

    def test_codex_relative_duration(self):
        self.assertEqual(self.at("You've hit your usage limit. Try again in 2 days 3 hours 5 minutes."),
                         NOW.replace(microsecond=0) + timedelta(days=2, hours=3, minutes=5))

    def test_unrelated_text_has_no_time(self):
        self.assertIsNone(self.at("You've hit your usage limit."))

    def test_classify_waits_until_the_time_codex_gives(self):
        # 決まった待ち時間(30 分)で再開を繰り返すと、上限が明けるまで毎回すぐ止まる
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "part.jsonl"
            log.write_text(json.dumps({"type": "result", "session_id": "s1", "subtype": "error", "is_error": True,
                                       "result": "", "errors": [CODEX.format("12:52 PM")]}, ensure_ascii=False))
            env = {**os.environ, "TZ": "Asia/Tokyo", "LOOP_NOW": str(int(NOW.timestamp()))}
            out = subprocess.run([sys.executable, "-I", HERE / "claude_log.py", "classify", log, "/dev/null"],
                                 capture_output=True, text=True, env=env).stdout.split()
            self.assertEqual(out[0], "limit")
            self.assertEqual(datetime.fromtimestamp(int(out[1]), JST), datetime(2026, 11, 28, 12, 52, tzinfo=JST))
            self.assertEqual(out[2], "s1")


if __name__ == "__main__":
    unittest.main()
