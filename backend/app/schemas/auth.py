from pydantic import BaseModel, EmailStr
from typing import Optional, List


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    roles: List[str] = []
    hospital_id: Optional[str] = None
    hospital_name: Optional[str] = None
    reference_number: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class TokenData(BaseModel):
    user_id: Optional[str] = None
    username: Optional[str] = None
    roles: Optional[List[str]] = None
    hospital_id: Optional[str] = None
