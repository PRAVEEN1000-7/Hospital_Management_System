"""
HMS AI Chat Service — Hybrid Rule Engine + Groq AI + Database Awareness
========================================================================
Handles chat requests using a three-tier approach:
1. FAST PATH: Permission questions answered instantly from local rules
2. DB PATH: Data questions answered by querying the live PostgreSQL database
3. AI PATH: Complex questions forwarded to Groq (Llama 3.3 70B) with full HMS context + live DB data

PLUG-AND-PLAY: Self-contained. No dependencies on other HMS services.
"""

import re
import json
import logging
import httpx
from typing import Optional
from ..config import settings
from .chat_knowledge import (
    ROLES,
    PERMISSIONS,
    HMS_SYSTEM_KNOWLEDGE,
    check_permission,
    get_role_summary,
    get_all_permissions_for_role,
)
from .chat_db_helper import get_database_context

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Config — Groq (OpenAI-compatible API)
# ──────────────────────────────────────────────
GROQ_API_KEY = settings.GROQ_API_KEY
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# ──────────────────────────────────────────────
# Permission detection patterns
# ──────────────────────────────────────────────
PERMISSION_PATTERNS = [
    r"\b(can i|am i able to|do i have permission|how (?:do|can|to) i)\b.*\b(delete|remove|create|add|edit|update|modify|register|view|see|access|manage|reset|change|upload|export|print|download|email|configure|setup)\b",
    r"\b(delete|remove|create|add|edit|update|register|reset|upload|export)\b.*\b(patient|user|staff|hospital|logo|password|csv|id card)\b",
    r"\b(who can|which role|what role)\b.*\b(delete|create|manage|edit|register|reset|access)\b",
    r"\bhow (?:do|can|to) (?:i )?(delete|remove|create|add|edit|register|view|manage|reset|change|upload|export|print|download)\b",
    r"\b(i can'?t|unable to|not allowed|no access|permission denied|forbidden)\b",
]

# Map keywords in questions to permission action keys
ACTION_KEYWORD_MAP = {
    "register_patient": ["register patient", "add patient", "new patient", "create patient", "patient registration"],
    "view_patients": ["view patient", "see patient", "patient list", "patient directory", "find patient", "search patient"],
    "view_patient_detail": ["patient detail", "patient profile", "patient info", "patient record"],
    "delete_patient": ["delete patient", "remove patient", "deactivate patient"],
    "view_patient_id_card": ["id card", "print id", "download id", "email id card", "patient card"],
    "manage_users": ["manage user", "user management", "user admin"],
    "create_user": ["create user", "add user", "new user", "register user"],
    "delete_user": ["delete user", "remove user", "deactivate user"],
    "reset_user_password": ["reset password", "change user password", "password reset"],
    "view_staff_directory": ["staff directory", "staff list", "view staff", "see staff", "find staff"],
    "create_staff": ["create staff", "add staff", "new staff", "hire staff"],
    "edit_staff": ["edit staff", "update staff", "modify staff", "change staff"],
    "delete_staff": ["delete staff", "remove staff", "fire staff"],
    "reset_staff_password": ["reset staff password", "staff password"],
    "export_staff_csv": ["export csv", "download csv", "staff export", "export staff"],
    "configure_hospital": ["hospital setup", "hospital config", "configure hospital", "hospital settings", "hospital details"],
    "upload_hospital_logo": ["upload logo", "hospital logo", "change logo", "add logo"],
    "view_own_profile": ["my profile", "view profile", "see profile", "account info"],
    "change_own_password": ["change password", "change my password", "update password", "my password"],
    "view_dashboard": ["dashboard", "home page", "main page", "overview"],
}


def _is_permission_question(message: str) -> bool:
    """Detect if the message is asking about permissions or how-to."""
    msg_lower = message.lower()
    for pattern in PERMISSION_PATTERNS:
        if re.search(pattern, msg_lower):
            return True
    return False


def _extract_action(message: str) -> Optional[str]:
    """Extract the permission action key from the message using fuzzy keyword matching."""
    msg_lower = message.lower()
    # Remove common filler words for better matching
    msg_clean = re.sub(r'\b(a|an|the|my|any|some|this|that)\b', ' ', msg_lower)
    msg_clean = re.sub(r'\s+', ' ', msg_clean).strip()

    for action_key, keywords in ACTION_KEYWORD_MAP.items():
        for keyword in keywords:
            # Direct match
            if keyword in msg_lower:
                return action_key
            # Match with filler words removed
            if keyword in msg_clean:
                return action_key
            # Regex match: allow words between keyword parts
            parts = keyword.split()
            if len(parts) >= 2:
                pattern = r'\b' + r'\b\s+(?:\w+\s+){0,2}'.join(re.escape(p) for p in parts) + r'\b'
                if re.search(pattern, msg_lower):
                    return action_key
    return None


def _build_system_prompt(role: str, username: str, db_context: str = "") -> str:
    """Build the Groq system prompt with full HMS context + user role + live DB data."""
    role_info = ROLES.get(role, {"label": role, "description": "Unknown role"})
    permissions = get_all_permissions_for_role(role)

    allowed = [p for p in permissions if p["allowed"]]
    denied = [p for p in permissions if not p["allowed"]]

    perm_text = "### Your Permissions:\n"
    perm_text += "**You CAN:**\n"
    for p in allowed:
        perm_text += f"- {p['description']}: {p['how_to']}\n"
    if denied:
        perm_text += "\n**You CANNOT:**\n"
        for p in denied:
            perm_text += f"- {p['description']} → Ask: {', '.join(p['who_can'][:2])}\n"

    db_section = ""
    if db_context:
        db_section = f"""

## Live Database Data
The following is real-time data pulled from the hospital database. Use this data to answer the user's question accurately.
{db_context}
"""

    return f"""You are the HMS AI Assistant — a helpful, friendly, and knowledgeable guide for the Hospital Management System.

## Current User
- **Username:** {username}
- **Role:** {role_info['label']} ({role})
- **Access Level:** {role_info['description']}

{perm_text}

{HMS_SYSTEM_KNOWLEDGE}
{db_section}
## Your Behavior Rules
1. Always answer based on the user's CURRENT ROLE ({role_info['label']}). Never tell them how to do something they don't have permission for without clarifying they can't.
2. If they ask to do something they CANNOT do: explain clearly, tell them which role CAN do it, and suggest they contact that person.
3. If they ask HOW to do something they CAN do: give clear, step-by-step instructions with the navigation path.
4. Be concise but complete. Use bullet points and steps.
5. Be friendly and professional — you're a hospital system assistant.
6. If you're not sure about something, say so honestly rather than guessing.
7. For technical issues, suggest contacting the Super Admin or system administrator.
8. Format responses with markdown for readability (bold, bullets, numbered lists).
9. Do NOT make up features that don't exist. Only reference features described in the knowledge base.
10. When mentioning navigation, use the exact sidebar names: Dashboard, Register Patient, Patient Directory, Staff Directory, User Management, Hospital Setup, Profile.
11. When database data is provided above, USE IT to give specific, accurate answers. Cite exact numbers and names from the data.
12. Never fabricate patient names, PRNs, or counts — only use what the database provides.
"""


# ──────────────────────────────────────────────
# MAIN ENTRY POINT
# ──────────────────────────────────────────────

async def process_chat_message(
    message: str,
    role: str,
    username: str,
    conversation_history: list[dict] = None,
) -> dict:
    """
    Process a chat message — ALL responses go through Groq AI.
    1. Gather context: DB data + permission rules (always available in system prompt)
    2. Send everything to Groq AI for a natural, intelligent response
    3. Only if Groq fails → fall back to local rules engine (offline mode)

    Returns: { "response": str, "source": "ai"|"ai+db"|"instant"|"offline", "action_detected": str|None }
    """
    if conversation_history is None:
        conversation_history = []

    # ── PRIMARY: Send everything through Groq AI ──
    if GROQ_API_KEY:
        try:
            # Fetch live DB data if the question is about data
            db_context = get_database_context(message)
            groq_response = await _call_groq(message, role, username, conversation_history, db_context)
            if groq_response:
                source = "ai+db" if db_context else "ai"
                return {
                    "response": groq_response,
                    "source": source,
                    "action_detected": _extract_action(message),
                }
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            # Fall through to offline fallback

    # ── OFFLINE FALLBACK: Groq unavailable — use local rules engine ──
    # Permission questions
    if _is_permission_question(message):
        action = _extract_action(message)
        if action:
            result = check_permission(role, action)
            if result:
                if result["allowed"]:
                    response = f"✅ **{result['message']}**\n\n**How to do it:**\n{result['how_to']}\n\n📍 Navigate to: `{result['nav_path']}`"
                else:
                    response = f"🚫 **{result['message']}**\n\n{result['who_can']}\n\n💡 {result['suggestion']}"
                return {
                    "response": response,
                    "source": "instant",
                    "action_detected": action,
                }

    # Role summary requests
    msg_lower = message.lower()
    if any(phrase in msg_lower for phrase in ["what can i do", "my permissions", "what am i allowed", "my access", "what's my role", "what is my role", "my capabilities"]):
        summary = get_role_summary(role)
        return {
            "response": f"Here's a summary of your access as **{ROLES.get(role, {}).get('label', role)}**:\n\n{summary}",
            "source": "instant",
            "action_detected": "role_summary",
        }

    # Generic fallback
    return _fallback_response(message, role, username)


async def _call_groq(
    message: str,
    role: str,
    username: str,
    conversation_history: list[dict],
    db_context: str = "",
) -> Optional[str]:
    """Call Groq API (OpenAI-compatible) with full context + live DB data."""
    system_prompt = _build_system_prompt(role, username, db_context)

    # Build messages in OpenAI format
    messages = [
        {"role": "system", "content": system_prompt}
    ]

    # Add conversation history (last 10 messages for context window efficiency)
    for msg in conversation_history[-10:]:
        messages.append({
            "role": "user" if msg["role"] == "user" else "assistant",
            "content": msg["content"],
        })

    # Add current message
    messages.append({"role": "user", "content": message})

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 1024,
        "top_p": 0.95,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            GROQ_URL,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}",
            },
        )

        if response.status_code != 200:
            logger.error(f"Groq API returned {response.status_code}: {response.text}")
            return None

        data = response.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            logger.error(f"Unexpected Groq response structure: {e}")
            return None


def _fallback_response(message: str, role: str, username: str) -> dict:
    """Generate a helpful response when Groq AI is unavailable (offline mode)."""
    msg_lower = message.lower()
    role_label = ROLES.get(role, {}).get("label", role)

    # Try to match against known actions
    action = _extract_action(message)
    if action:
        result = check_permission(role, action)
        if result:
            if result["allowed"]:
                response = f"✅ **{result['message']}**\n\n**How to do it:**\n{result['how_to']}"
            else:
                response = f"🚫 **{result['message']}**\n\n{result['who_can']}\n\n💡 {result['suggestion']}"
            return {"response": response, "source": "instant", "action_detected": action}

    # Generic helpful responses based on keywords
    if any(w in msg_lower for w in ["hello", "hi", "hey", "help"]):
        return {
            "response": f"👋 Hello {username}! I'm the HMS AI Assistant (currently in offline mode). As a **{role_label}**, I can help you with:\n\n"
                        f"• Understanding what you can and can't do\n"
                        f"• Step-by-step guides for any feature\n"
                        f"• Finding where things are in the system\n\n"
                        f"Try asking me things like:\n"
                        f"• *\"How do I register a patient?\"*\n"
                        f"• *\"Can I delete a user?\"*\n"
                        f"• *\"What can I do?\"*\n"
                        f"• *\"How to change my password?\"*",
            "source": "offline",
            "action_detected": None,
        }

    if any(w in msg_lower for w in ["thank", "thanks", "thx"]):
        return {
            "response": "You're welcome! 😊 Let me know if you need anything else.",
            "source": "offline",
            "action_detected": None,
        }

    # Default
    return {
        "response": f"I understand you're asking about: *\"{message}\"*\n\n"
                    f"⚠️ The AI assistant is currently in offline mode. I can still help with:\n\n"
                    f"• **Permissions**: *\"Can I delete a patient?\"*\n"
                    f"• **How-to guides**: *\"How do I register a patient?\"*\n"
                    f"• **Role info**: *\"What can I do?\"*\n"
                    f"• **Navigation**: *\"Where is the staff directory?\"*\n\n"
                    f"Try rephrasing your question, or ask about a specific feature!",
        "source": "offline",
        "action_detected": None,
    }
