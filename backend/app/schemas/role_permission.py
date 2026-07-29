"""
Roles & Permissions admin UI — schemas for the effective per-hospital matrix.
"""
from pydantic import BaseModel, Field
from typing import Dict, List, Literal

AccessLevel = Literal["none", "view", "edit"]


class PermissionCell(BaseModel):
    access_level: AccessLevel
    is_override: bool  # True if this cell differs from the global default


class PermissionKeyRow(BaseModel):
    key: str
    label: str
    cells: Dict[str, PermissionCell]  # role_name -> cell


class EffectiveMatrixResponse(BaseModel):
    roles: List[str]  # assignable role names for this hospital, in display order
    rows: List[PermissionKeyRow]


class PermissionOverrideChange(BaseModel):
    key: str
    role: str
    access_level: AccessLevel


class MatrixUpdateRequest(BaseModel):
    changes: List[PermissionOverrideChange] = Field(default_factory=list)


class MatrixUpdateResponse(BaseModel):
    applied: int
    skipped: List[str] = Field(default_factory=list)  # e.g. "billing/cashier: locked"


class ResetCellRequest(BaseModel):
    key: str
    role: str
