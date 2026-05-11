from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

from backend.processor.main import main  # noqa: E402


if __name__ == "__main__":
    main()
