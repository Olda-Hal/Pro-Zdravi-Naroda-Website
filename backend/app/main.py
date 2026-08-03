import os

import psycopg
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Pro Zdravi Naroda API")


def parse_origins(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


DEFAULT_CORS_ORIGINS = "http://localhost:8092"
cors_allow_origins = parse_origins(os.getenv("CORS_ALLOW_ORIGINS", DEFAULT_CORS_ORIGINS))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://app:app@db:5432/appdb")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def health_db() -> dict[str, str | int]:
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=3) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                value = cur.fetchone()[0]
        return {"status": "ok", "db": value}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}")
