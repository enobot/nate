"""Rebuild the files in sample_data/ from data/sample_data.py.

Usage (from the project root):
    python scripts/build_sample_data.py

The history uses a fixed random seed, so running this again produces the
same files. tests/test_sample_data.py fails if the committed files and the
code that builds them ever drift apart.
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data.sample_data import write_sample_files  # noqa: E402


def main() -> None:
    for path in write_sample_files():
        print(f"wrote {path.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
