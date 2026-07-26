"""
Schemas for the unauthenticated public Queue Display endpoint. Deliberately
minimal — token number + status only, never patient/doctor identity, since
this is reachable by anyone with the hospital's queue-display URL.
"""
from typing import Optional
from pydantic import BaseModel


class PublicQueueToken(BaseModel):
    token: Optional[int] = None
    status: str = "waiting"


class PublicQueueColumn(BaseModel):
    id: str
    name: str
    tokens: list[PublicQueueToken] = []


class PublicQueueDisplayResponse(BaseModel):
    hospital_name: str
    logo_url: Optional[str] = None
    refresh_seconds: int = 10
    columns: list[PublicQueueColumn] = []
    # BRD-005 — only meaningful for the per-screen endpoint; always True on
    # the legacy hospital-wide endpoint (which has no "configured" concept).
    configured: bool = True
    display_name: Optional[str] = None
    token_format: Optional[str] = None
