# AI Chatbot — Changes Made to the HMS Project

> This document lists every file that was created or modified to add the AI chatbot feature.

---

## Summary

- **7 new files** created (4 backend, 3 frontend)
- **4 existing files** modified (2 backend, 1 backend config, 1 frontend)
- **1 new pip dependency** added (`httpx`)
- **1 new environment variable** added (`GROQ_API_KEY`)
- **Zero existing files deleted or renamed**

---

## New Files Created

### Backend (4 files)

#### 1. `backend/app/services/chat_knowledge.py` — 378 lines
**Purpose:** The AI's brain — contains everything it knows about the HMS system.

**What's inside:**
- `ROLES` dictionary — all 9 HMS roles with labels, levels, and descriptions
- `PERMISSIONS` dictionary — 20+ actions (register patient, delete user, etc.) with which roles can do them, step-by-step how-to guides, and navigation paths
- `NAVIGATION` dictionary — sidebar menu items and their URL paths
- `HMS_SYSTEM_KNOWLEDGE` — a large text block containing the complete HMS knowledge base (features, password rules, patient fields, employee ID formats, common issues/solutions, technical details)
- `check_permission(role, action)` — checks if a specific role can do a specific action and returns guidance
- `get_role_summary(role)` — returns a full summary of what a role can/cannot do
- `get_all_permissions_for_role(role)` — returns every permission with allowed/denied status

---

#### 2. `backend/app/services/chat_service.py` — ~330 lines
**Purpose:** The hybrid AI engine — processes chat messages using a 3-tier approach with database awareness.

**What's inside:**
- `GROQ_API_KEY` / `GROQ_MODEL` / `GROQ_URL` — configuration for Groq API (OpenAI-compatible)
- `PERMISSION_PATTERNS` — 5 regex patterns to detect permission-related questions
- `ACTION_KEYWORD_MAP` — maps natural language phrases to permission action keys (e.g., "delete a user" → `delete_user`)
- `_is_permission_question(message)` — regex-based detection of permission questions
- `_extract_action(message)` — fuzzy keyword extraction with filler-word removal (handles "Can I delete **a** user?" matching "delete user")
- `_build_system_prompt(role, username, db_context)` — constructs the full Groq system prompt with the user's role, their permissions, all HMS knowledge, AND live database data
- `process_chat_message(message, role, username, conversation_history)` — **main entry point**, runs the 3-tier response logic:
  - **Tier 1 (Rules):** Permission questions answered instantly from local knowledge
  - **Tier 2 (Groq + DB):** Complex questions forwarded to Groq Llama 3.3 70B with live database context
  - **Tier 3 (Fallback):** Helpful response when Groq is unavailable
- `_call_groq(...)` — async HTTP call to Groq API (OpenAI format) using `httpx`, sends conversation history (last 10 messages) + live DB data
- `_fallback_response(...)` — generates context-aware responses without any API call

---

#### 2b. `backend/app/services/chat_db_helper.py` — ~280 lines
**Purpose:** Database awareness layer — queries PostgreSQL to give the AI live data.

**What's inside:**
- `get_database_context(message)` — **main entry point**, analyzes the message and fetches relevant DB data
- `_is_about_patients(msg)` — detects patient-related questions
- `_is_about_users_or_staff(msg)` — detects user/staff-related questions
- `_is_about_hospital(msg)` — detects hospital config questions
- `_is_about_stats(msg)` — detects general statistics questions
- `_get_patient_data(db, msg)` — queries patient counts, gender breakdown, blood groups, search by PRN or name, recent patients
- `_get_user_data(db, msg)` — queries user/staff counts, role breakdown, lists by role, search by name
- `_get_hospital_data(db)` — fetches hospital configuration (name, type, beds, contact, legal info, working hours)
- `_get_stats(db)` — overall system statistics dashboard

**Data queries supported:**
| Question Type | Example | Data Returned |
|--------------|---------|---------------|
| Patient count | "How many patients?" | Total active/inactive patients |
| Patient search | "Find patient HMS-000001" | Full patient details by PRN |
| Patient by name | "Find patient John" | Matching patients (up to 5) |
| Gender breakdown | "Male vs female patients" | Count by gender |
| Blood groups | "Blood group distribution" | Count by blood group |
| Recent patients | "Latest patients" | Last 5 registered |
| Staff count | "How many doctors?" | Count by role |
| List staff | "List all nurses" | Names, departments, IDs |
| Hospital info | "Hospital details" | Full hospital configuration |
| System stats | "Give me an overview" | Combined patient + user + hospital stats |

---

#### 3. `backend/app/routers/chat.py` — 117 lines
**Purpose:** FastAPI router with 3 API endpoints for the chat system.

**Endpoints created:**
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/chat/ask` | Send a message, get AI response |
| `GET` | `/api/v1/chat/permissions` | Get all permissions for current user's role |
| `GET` | `/api/v1/chat/role-summary` | Get human-readable role summary |

**Pydantic schemas defined:**
- `ChatMessage` — role + content
- `ChatRequest` — message + conversation_history (max 20 messages)
- `ChatResponse` — response text + source + action_detected
- `PermissionCheckRequest` / `PermissionCheckResponse`

**Security:** All endpoints require JWT authentication via `get_current_active_user` dependency.

---

### Frontend (3 files)

#### 4. `frontend/src/components/chat/chatTypes.ts` — 38 lines
**Purpose:** TypeScript type definitions for the chat system.

**Interfaces defined:**
- `ChatMessage` — id, role, content, timestamp, source, isLoading
- `ChatRequest` — message, conversation_history
- `ChatResponse` — response, source, action_detected
- `RoleSummary` — role, label, description, summary

---

#### 5. `frontend/src/components/chat/chatService.ts` — 36 lines
**Purpose:** API service layer — handles HTTP calls to the chat backend.

**Functions:**
- `sendMessage(request)` — POST to `/chat/ask`
- `getRoleSummary()` — GET from `/chat/role-summary`

Uses the shared `api.ts` axios instance which auto-attaches the JWT token.

---

#### 6. `frontend/src/components/chat/AIChatWidget.tsx` — ~350 lines
**Purpose:** The main floating chat widget UI component.

**What it includes:**
- Floating Action Button (FAB) at bottom-right corner with pulse animation
- Expandable chat panel (400px wide, 560px tall) with slide-up animation
- Message list with auto-scroll and fade-in animations
- Markdown-lite renderer (bold, italic, code, headers, bullet lists, numbered lists)
- Text input with Enter-to-send
- Voice input button using Web Speech API (Chrome/Edge)
- Typing indicator with bouncing dots while AI is thinking
- Quick suggestion chips on first open ("What can I do?", "How to register a patient?", etc.)
- Welcome message with the user's name and role
- Response source badges (⚡ Instant, ✨ AI, ℹ Offline)
- Clear chat button
- Unread notification badge when chat is closed
- Conversation history sent with each request for context

---

## Existing Files Modified

### 1. `backend/app/main.py`
**Lines changed:** 2

| Line | Change |
|------|--------|
| 7 | Added `chat` to the router import: `from .routers import auth, patients, users, hospital, chat` |
| 52 | Added router registration: `app.include_router(chat.router, prefix="/api/v1")  # AI Chat — remove this line to disable` |

---

### 2. `backend/app/config.py`
**Lines added:** 3

Added at the end of the `Settings` class (before `settings = Settings()`):
```python
# AI Chat (Groq)
GROQ_API_KEY: str = ""
```
This allows the Groq API key to be loaded from the `.env` file via pydantic-settings.

---

### 3. `backend/.env`
**Lines added:** 3

Added at the end of the file:
```
# AI Chat (Groq)
GROQ_API_KEY=your_groq_api_key_here
```

---

### 4. `frontend/src/App.tsx`
**Lines changed:** 2

| Line | Change |
|------|--------|
| 19 | Added import: `import AIChatWidget from './components/chat/AIChatWidget'; // AI Chat — remove this line to disable` |
| 28 | Added component render: `<AIChatWidget /> {/* AI Chat — remove this line to disable */}` |

The widget is placed inside `<AuthProvider>` and `<ToastProvider>` so it has access to the authentication context.

---

## Dependency Added

### `backend/requirements.txt`
- Added: `httpx==0.26.0` — async HTTP client used to call the Google Gemini API from the backend

---

## How to Remove the AI Chatbot Entirely

1. **Delete 3 frontend files:**
   - `frontend/src/components/chat/AIChatWidget.tsx`
   - `frontend/src/components/chat/chatService.ts`
   - `frontend/src/components/chat/chatTypes.ts`

2. **Delete 3 backend files:**
   - `backend/app/services/chat_knowledge.py`
   - `backend/app/services/chat_service.py`
   - `backend/app/services/chat_db_helper.py`

3. **Delete 1 backend router:**
   - `backend/app/routers/chat.py`

4. **Revert 2 lines in `backend/app/main.py`:**
   - Line 7: Remove `, chat` from the import
   - Line 52: Remove the `app.include_router(chat.router, ...)` line

5. **Revert 2 lines in `frontend/src/App.tsx`:**
   - Line 19: Remove the `AIChatWidget` import
   - Line 28: Remove the `<AIChatWidget />` render

6. **Optionally remove:**
   - `GROQ_API_KEY` from `backend/.env`
   - `GROQ_API_KEY` field from `backend/app/config.py`
   - `httpx` from `backend/requirements.txt`
