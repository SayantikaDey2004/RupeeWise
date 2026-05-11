from __future__ import annotations

import os

from dotenv import load_dotenv
import uvicorn


def main() -> None:
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    uvicorn.run(
        "backend.api.main:app",
        host=os.getenv("BACKEND_HOST", "0.0.0.0"),
        port=int(os.getenv("BACKEND_PORT", "8000")),
        reload=os.getenv("BACKEND_RELOAD", "false").lower() == "true",
    )


if __name__ == "__main__":
    main()
