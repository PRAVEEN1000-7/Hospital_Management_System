"""
Standardized API response schemas (per project spec).

All endpoints SHOULD return:
  Success: ApiResponse[T]  → { success, data, message, meta? }
  Error:   ErrorResponse   → { success, error: { code, message, details? } }

Example usage in a router:
    from ..schemas.common import ApiResponse, PaginationMeta

    @router.get("/patients", response_model=ApiResponse[list[PatientResponse]])
    async def list_patients(...):
        patients = patient_service.get_list(...)
        return ApiResponse(
            data=patients,
            message="OK",
            meta=PaginationMeta(page=1, per_page=20, total=len(patients), total_pages=1),
        )
"""
from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel

DataT = TypeVar("DataT")


class PaginationMeta(BaseModel):
    """Pagination metadata for list responses."""
    page: int
    per_page: int
    total: int
    total_pages: int


class ApiResponse(BaseModel, Generic[DataT]):
    """Standardized success response envelope."""
    success: bool = True
    data: Optional[DataT] = None
    message: Optional[str] = None
    meta: Optional[Any] = None  # PaginationMeta or any dict


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[List[Any]] = None


class ErrorResponse(BaseModel):
    """Standardized error response envelope."""
    success: bool = False
    error: ErrorDetail

