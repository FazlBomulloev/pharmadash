from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from .registry import ADAPTERS
from .runner import run_source


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug", choices=sorted(ADAPTERS))
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format=f"%(asctime)s [%(levelname)s] parser:{args.slug} %(message)s",
    )
    asyncio.run(run_source(args.slug, limit=args.limit))
    return 0


if __name__ == "__main__":
    sys.exit(main())
