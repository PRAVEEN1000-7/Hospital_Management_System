"""
HMS AI Chat Router — API endpoints for the chat system
========================================================
Single router file. Add to main.py with:
    app.include_router(chat.router, prefix="/api/v1")

Remove that line to disable the entire chat API.

PLUG-AND-PLAY: No dependencies on other HMS routers or services.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from ..dependencies import get_current_active_user
from ..models.user import User
from ..services.chat_service import process_chat_message
from ..services.chat_knowledge import (
    get_role_summary,
    get_all_permissions_for_role,
    ROLES,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["AI Chat"])


# ──────────────────────────────────────────────
# Request / Response Schemas
# ──────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(description="'user' or 'assistant'")
    content: str = Field(description="Message text")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User's message")
    conversation_history: list[ChatMessage] = Field(
        default=[],
        max_length=20,
        description="Previous messages for context (max 20)",
    )


class ChatResponse(BaseModel):
    response: str = Field(description="AI response text (markdown)")
    source: str = Field(description="'ai', 'ai+db', 'instant', or 'offline'")
    action_detected: Optional[str] = Field(default=None, description="Detected permission action key")


class PermissionCheckRequest(BaseModel):
    action: str = Field(..., min_length=1, max_length=200, description="Action to check, e.g. 'delete_patient'")


class PermissionCheckResponse(BaseModel):
    allowed: bool
    message: str
    how_to: Optional[str] = None
    nav_path: Optional[str] = None
    who_can: Optional[str] = None
    suggestion: Optional[str] = None


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@router.post("/ask", response_model=ChatResponse)
async def ask_ai(
    request: ChatRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    Send a message to the HMS AI assistant.
    The AI responds based on the user's role and permissions.
    """
    try:
        result = await process_chat_message(
            message=request.message,
            role=current_user.role,
            username=current_user.username,
            conversation_history=[
                {"role": msg.role, "content": msg.content}
                for msg in request.conversation_history
            ],
        )
        return ChatResponse(**result)
    except Exception as e:
        logger.error(f"Chat error for user {current_user.username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process chat message")


@router.get("/permissions", response_model=list)
async def get_my_permissions(
    current_user: User = Depends(get_current_active_user),
):
    """Get all permissions for the current user's role."""
    return get_all_permissions_for_role(current_user.role)


@router.get("/role-summary")
async def get_my_role_summary(
    current_user: User = Depends(get_current_active_user),
):
    """Get a human-readable summary of what the current user can/cannot do."""
    role = current_user.role
    role_info = ROLES.get(role, {"label": role, "description": "Unknown"})
    return {
        "role": role,
        "label": role_info["label"],
        "description": role_info["description"],
        "summary": get_role_summary(role),
    }
