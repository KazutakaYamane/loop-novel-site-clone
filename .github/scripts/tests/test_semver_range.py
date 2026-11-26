"""semver_range.py の試験。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from semver_range import Unparseable, is_subset  # noqa: E402


class SubsetTest(unittest.TestCase):
    def test_within(self) -> None:
        for declared, allowed, eco in [
            ("^13.17", "^13.0", "composer"), ("16.4.6", "^16.0", "npm"), ("^20", "*", "npm"),
            ("1.64.0", "^1.64", "npm"), ("~1.64.2", "^1.64", "npm"), ("^0.35", "^0.35", "composer"),
            ("^0.0.1", "^0.0.1", "npm"), ("19.3.0", "^19.0", "npm"), ("~13.1", "^13.0", "composer"),
            ("13.x", "^13.0", "npm"), (">=13.0 <13.5", "^13.0", "npm"), (">=13.0,<14.0", "^13.0", "composer"),
            ("^5.0|^5.1", "^5.0", "composer"), ("v5.1.2", "^5.0", "npm"), ("^5.0@stable", "^5.0", "composer"),
        ]:
            with self.subTest(declared=declared, allowed=allowed):
                self.assertTrue(is_subset(declared, allowed, eco))

    def test_outside(self) -> None:
        for declared, allowed, eco in [
            ("^14.0", "^13.0", "composer"), ("^0.36", "^0.35", "composer"), (">=1.0", "^1.0", "npm"),
            ("^1.63", "^1.64", "npm"), ("^8.3", "^8.5", "composer"), ("0.0.2", "^0.0.1", "npm"),
            ("^4.0 || ^5.0", "^5.0", "composer"), ("*", "^13.0", "npm"), ("~1.2", "^1.2.5", "composer"),
            ("13", "^13.5", "npm"), ("<14", "^13.0", "npm"),
        ]:
            with self.subTest(declared=declared, allowed=allowed):
                self.assertFalse(is_subset(declared, allowed, eco))

    def test_unparseable(self) -> None:
        for declared in ["github:vercel/next.js", "file:../x", "dev-master", "latest", "npm:react@19", "git+https://x/y.git"]:
            with self.subTest(declared=declared), self.assertRaises(Unparseable):
                is_subset(declared, "*", "npm")


if __name__ == "__main__":
    unittest.main()
