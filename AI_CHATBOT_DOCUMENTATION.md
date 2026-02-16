# HMS AI Chatbot — Complete Documentation

> Everything about how the AI chatbot works, what it can do, and how it's built.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture — 3-Tier Hybrid Engine](#2-architecture--3-tier-hybrid-engine)
3. [Tier 1: Rules Engine (Instant)](#3-tier-1-rules-engine-instant)
4. [Tier 2: Groq AI + Database Awareness](#4-tier-2-groq-ai--database-awareness)
5. [Tier 3: Fallback (Offline)](#5-tier-3-fallback-offline)
6. [Database Awareness (Live Data)](#6-database-awareness-live-data)
7. [Role-Based Awareness (9 Roles)](#7-role-based-awareness-9-roles)
8. [Permission Matrix (20+ Actions)](#8-permission-matrix-20-actions)
9. [Voice Input](#9-voice-input)
10. [Chat Widget UI](#10-chat-widget-ui)
11. [API Endpoints](#11-api-endpoints)
12. [Groq API Configuration](#12-groq-api-configuration)
13. [System Prompt Engineering](#13-system-prompt-engineering)
14. [Knowledge Base Contents](#14-knowledge-base-contents)
15. [Conversation History & Context](#15-conversation-history--context)
16. [Action Extraction & Fuzzy Matching](#16-action-extraction--fuzzy-matching)
17. [Security](#17-security)
18. [Rate Limits & Costs](#18-rate-limits--costs)
19. [Examples — What Users Can Ask](#19-examples--what-users-can-ask)
20. [Response Source Indicators](#20-response-source-indicators)
21. [Tech Stack](#21-tech-stack)

---

## 1. Overview

The HMS AI Chatbot is a **floating chat widget** that appears on every page (bottom-right corner) once a user is logged in. It provides:

- **Role-aware answers** — knows what the logged-in user can and cannot do
- **Instant permission checks** — "Can I delete a user?" answered in <50ms from local rules
- **Step-by-step guides** — "How do I register a patient?" with exact navigation paths
- **Natural language understanding** — complex questions forwarded to Groq AI (Llama 3.3 70B)
- **Database awareness** — "How many patients?" answered with live data from PostgreSQL
- **Voice input** — speak your question using the microphone button (Chrome/Edge)
- **Conversation memory** — remembers the last 10 messages for context

---

## 2. Architecture — 3-Tier Hybrid Engine

Every message goes through this pipeline in order:

```
User message
    │
    ▼
┌──────────────────────────────────┐
│  TIER 1: Rules Engine (Instant)  │ ← Permission questions, role summaries
│  Response time: <50ms            │   "Can I delete a user?" → Yes/No + how-to
│  Source label: ⚡ Instant         │
└────────────┬─────────────────────┘
             │ (not a permission question)
             ▼
┌──────────────────────────────────┐
│  TIER 2: Groq AI + DB (Smart)        │ ← Complex questions + live database data
│  Response time: 1-3 seconds          │   "How many patients?" → queries DB + AI formats answer
│  Source label: ✨ AI  or  ✨ AI+DB     │
└────────────┬─────────────────────┘
             │ (Groq unavailable / rate limited / no API key)
             ▼
┌──────────────────────────────────┐
│  TIER 3: Fallback (Offline)      │ ← Still gives helpful suggestions
│  Response time: <50ms            │   Uses local knowledge + keyword matching
│  Source label: ℹ Offline          │
└──────────────────────────────────┘
```

**Key benefit:** The system always responds — even if the Groq API is down, rate-limited, or the API key is missing.

---

## 3. Tier 1: Rules Engine (Instant)

### How it detects permission questions

Five regex patterns catch phrases like:
- "Can I ..." / "Am I able to ..." / "Do I have permission to ..."
- "How do I ..." / "How can I ..." / "How to ..."
- "Who can ..." / "Which role can ..."
- Direct action + object: "delete patient", "create user", "upload logo"
- Complaints: "I can't ...", "not allowed", "permission denied"

### How it matches actions

The `ACTION_KEYWORD_MAP` maps 20+ natural language phrases to permission keys:
```
"delete a user"       → delete_user
"register patient"    → register_patient
"change my password"  → change_own_password
"upload logo"         → upload_hospital_logo
"export csv"          → export_staff_csv
```

The matching is **fuzzy** — it removes filler words (a, an, the, my, any) and allows up to 2 extra words between keyword parts. So "Can I delete **a** user?" matches "delete user".

### What it returns

**If allowed:**
```
✅ Yes, as a Super Admin you can deactivate a user account.

How to do it:
Go to User Management → find the user → click the Delete icon → confirm deletion.

📍 Navigate to: /user-management
```

**If denied:**
```
🚫 No, as a Nurse you cannot deactivate a user account.

The following roles can do this: Super Admin.

💡 Please contact a Super Admin to help you with this.
```

### Special rule: "What can I do?"

Phrases like "what can I do", "my permissions", "what am I allowed to do", "my capabilities" trigger a full role summary listing every action the user can/cannot perform.

---

## 4. Tier 2: Groq AI + Database Awareness

### When it activates

- The message is NOT a simple permission question (Tier 1 didn't handle it)
- A valid `GROQ_API_KEY` is configured in the `.env` file
- Examples: "Explain the patient registration workflow", "How many patients are registered?", "List all doctors", "What are the hospital details?"

### Model used

- **Llama 3.3 70B Versatile** (`llama-3.3-70b-versatile`) via Groq
- Free tier — 14,400 requests/day, no billing required
- Groq provides extremely fast inference (typically 1-3 seconds)

### What gets sent to Groq

1. **System prompt** — the user's role, all their permissions (allowed + denied), the complete HMS knowledge base
2. **Live database context** — if the question is about data (patients, staff, hospital), the system queries PostgreSQL and includes real numbers/names in the prompt
3. **Conversation history** — last 10 messages for context continuity
4. **Current message** — the user's question

### Database-aware flow

```
User asks: "How many patients do we have?"
    │
    ▼
chat_db_helper.py detects "patient" keyword
    │
    ▼
Queries PostgreSQL: SELECT COUNT(*) FROM patients WHERE is_active = true
    │
    ▼
Returns: "Total active patients: 42, By gender: Male: 25, Female: 17"
    │
    ▼
Injected into Groq system prompt as "Live Database Information"
    │
    ▼
Groq formats a natural language response using the real data
    │
    ▼
Response: "Currently, there are **42 active patients** in the system (25 male, 17 female)."
```

### Generation config

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `temperature` | 0.7 | Balanced creativity/accuracy |
| `top_p` | 0.95 | Nucleus sampling |
| `max_tokens` | 1024 | Response length cap |

---

## 5. Tier 3: Fallback (Offline)

### When it activates

- Groq API key is missing or empty
- Groq returns an error (rate limit, server error, timeout)
- Network failure

### What it does

1. **Tries to match known actions** — even without Groq, it uses the same keyword extraction to give permission-based answers
2. **Recognizes greetings** — "hello", "hi", "hey", "help" → welcome message with suggestions
3. **Recognizes thanks** — "thank you", "thanks" → polite acknowledgment
4. **Default** — shows the user's role and suggests example questions they can ask

---

## 6. Database Awareness (Live Data)

The AI chatbot can query the HMS PostgreSQL database in real-time to answer data questions. This is handled by `chat_db_helper.py`.

### How it works

1. User sends a message (e.g., "How many patients are registered?")
2. `get_database_context(message)` analyzes the message for data-related keywords
3. If keywords match, it runs **read-only** SQL queries via SQLAlchemy
4. Results are formatted as markdown and injected into the Groq system prompt
5. Groq uses the real data to formulate an accurate, natural language response

### Data categories supported

| Category | Keywords Detected | Queries Run |
|----------|-------------------|-------------|
| **Patients** | patient, prn, hms-, registered, blood group, reference id, ref id, ref no | Count, gender breakdown, blood groups, search by PRN/name/reference id, recent |
| **Users/Staff** | user, staff, doctor, nurse, admin, employee | Count, role breakdown, list by role, search by name |
| **Hospital** | hospital name, beds, accreditation, working hours | Full hospital configuration |
| **Statistics** | how many, total, count, stats, overview, summary | Combined system statistics |

### Example queries and data returned

```
"How many patients?" → Total active patients: 42, Inactive: 3
"Show me patient HMS-000001" → Full patient details (name, DOB, gender, phone, address, etc.)
"Find patient John" → Matching patients list (up to 5)
"Patient with reference id 000001" → Finds patient by PRN (pads to HMS-000001)
"Get patient with ref id 3" → Finds patient by reference number or DB ID
"PRN 000001" → Looks up patient by PRN number
"How many doctors?" → Doctors: 5 (with names and departments)
"List all nurses" → All active nurses with names, employee IDs, departments
"Hospital details" → Hospital name, type, beds, contact, address, legal info
"Give me an overview" → Combined: patients, users by role, hospital config status
```

### Security

- All queries are **read-only** (SELECT only, no INSERT/UPDATE/DELETE)
- Data is filtered by `is_active = True` by default
- Patient searches return max 5 results to prevent data dumps
- No raw SQL — all queries use SQLAlchemy ORM
- Database errors are caught and logged; the AI still responds without data

### Architecture

```
chat_service.py                    chat_db_helper.py
┌─────────────────┐               ┌──────────────────────┐
│ process_chat()   │               │ get_database_context()│
│                  │──message──►   │                      │
│                  │               │ _is_about_patients() │
│                  │               │ _is_about_users()    │
│                  │               │ _is_about_hospital() │
│                  │               │ _is_about_stats()    │
│                  │◄──db_context──│                      │
│                  │               │ Queries PostgreSQL   │
│ _call_groq()     │               │ via SQLAlchemy ORM   │
│ (includes DB     │               └──────────────────────┘
│  data in prompt) │
└─────────────────┘
```

---

## 7. Role-Based Awareness (9 Roles)

The chatbot knows all 9 HMS roles and adapts its responses:

| Role | Level | Description |
|------|-------|-------------|
| Super Admin | 1 | Full system access — users, hospital config, everything |
| Admin | 2 | Hospital configuration. Cannot manage users |
| Doctor | 3 | Patient care and clinical access |
| Nurse | 3 | Patient care support |
| Receptionist | 4 | Patient registration and front-desk |
| Pharmacist | 4 | Medication management (planned) |
| Cashier | 4 | Billing and payments (planned) |
| Inventory Manager | 4 | Stock management (planned) |
| Staff | 5 | Basic authenticated access only |

### How the role is determined

1. User logs in → gets a JWT token containing their `role`
2. Every chat request sends the JWT in the `Authorization: Bearer` header
3. The backend extracts the role from the JWT via the `get_current_active_user` dependency
4. The chat service uses the role to check permissions and build the Groq prompt

---

## 8. Permission Matrix (20+ Actions)

Every action in the system is mapped with:
- **Which roles can do it** (`allowed_roles`)
- **How to do it** (step-by-step instructions)
- **Where to find it** (navigation path)
- **Description** (human-readable)

### Full Permission List

| Action | Allowed Roles | Nav Path |
|--------|--------------|----------|
| Register Patient | All 9 roles | `/register` |
| View Patient Directory | All 9 roles | `/patients` |
| View Patient Detail | All 9 roles | `/patients/:id` |
| Delete (Deactivate) Patient | All 9 roles | `/patients` |
| View Patient ID Card | All 9 roles | `/patients/:id/id-card` |
| Manage Users (CRUD) | Super Admin only | `/user-management` |
| Create User | Super Admin only | `/user-management` |
| Delete User | Super Admin only | `/user-management` |
| Reset User Password | Super Admin only | `/user-management` |
| View Staff Directory | All 9 roles | `/staff` |
| Create Staff | Super Admin only | `/staff` |
| Edit Staff | Super Admin only | `/staff` |
| Delete Staff | Super Admin only | `/staff` |
| Reset Staff Password | Super Admin only | `/staff` |
| Export Staff CSV | Super Admin only | `/staff` |
| Configure Hospital | Super Admin, Admin | `/hospital-setup` |
| Upload Hospital Logo | Super Admin, Admin | `/hospital-setup` |
| View Own Profile | All 9 roles | `/profile` |
| Change Own Password | All 9 roles | `/profile` |
| View Dashboard | All 9 roles | `/dashboard` |

---

## 9. Voice Input

### Technology

- **Web Speech API** — built into Chrome and Edge browsers (free, no API key needed)
- Language: English (en-US)
- Mode: Single utterance (not continuous)

### How it works

1. User clicks the 🎤 microphone button
2. Button turns red with voice wave animation
3. Input field shows "Listening..."
4. User speaks their question
5. Speech is transcribed to text
6. Message is automatically sent after transcription

### Browser Support

| Browser | Supported |
|---------|-----------|
| Chrome (desktop & mobile) | ✅ |
| Edge | ✅ |
| Safari | ⚠️ Partial |
| Firefox | ❌ No |

If the browser doesn't support it, an alert tells the user to switch to Chrome or Edge.

---

## 10. Chat Widget UI

### Components

| Part | Description |
|------|-------------|
| **FAB Button** | Fixed bottom-right, blue gradient, smart_toy icon, pulse ring animation |
| **Chat Panel** | 400×560px floating panel, slide-up animation on open |
| **Header** | Blue gradient bar with bot avatar, title "HMS AI Assistant", role + username, close/clear buttons |
| **Messages Area** | Scrollable, alternating user (blue, right-aligned) and bot (white, left-aligned) bubbles |
| **Quick Suggestions** | 4 chip buttons on first open: "What can I do?", "How to register a patient?", etc. |
| **Input Area** | Voice button + text input + send button |
| **Typing Indicator** | 3 bouncing dots with "HMS AI is thinking..." text |
| **Source Badge** | Small label under bot messages: ⚡ Instant, ✨ AI, or ℹ Offline |
| **Unread Badge** | Red dot on FAB when new message arrives while panel is closed |

### Markdown Rendering

Bot messages support:
- **Bold** (`**text**`)
- *Italic* (`*text*`)
- `Code` (`` `text` ``)
- ### Headers
- • Bullet points (`- text` or `• text`)
- 1. Numbered lists
- Emojis (✅, 🚫, 📍, 💡, 👋, 😊)

### Animations

- FAB: pulse ring (3s interval), hover scale-up, click scale-down
- Panel: slide-up (0.3s ease-out)
- Messages: fade-in + slide-up (0.3s)
- Typing dots: bounce (1.4s infinite, staggered)
- Voice waves: bounce bars (0.8s infinite, random heights)

---

## 11. API Endpoints

All endpoints are under `/api/v1/chat/` and require JWT authentication.

### POST `/api/v1/chat/ask`

**Request:**
```json
{
  "message": "Can I delete a user?",
  "conversation_history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi! How can I help?" }
  ]
}
```

**Response:**
```json
{
  "response": "🚫 **No, as a Nurse you cannot deactivate a user account.**\n\nThe following roles can do this: Super Admin.\n\n💡 Please contact a Super Admin to help you with this.",
  "source": "instant",
  "action_detected": "delete_user"
}
```

### GET `/api/v1/chat/permissions`

Returns array of all permissions for the current user's role:
```json
[
  {
    "action": "register_patient",
    "description": "Register a new patient in the system",
    "allowed": true,
    "how_to": "Go to sidebar → click 'Register Patient'...",
    "nav_path": "/register",
    "who_can": null
  },
  {
    "action": "manage_users",
    "description": "Create, edit, delete users and manage their roles",
    "allowed": false,
    "how_to": null,
    "nav_path": null,
    "who_can": ["Super Admin"]
  }
]
```

### GET `/api/v1/chat/role-summary`

Returns the current user's role info and readable summary:
```json
{
  "role": "nurse",
  "label": "Nurse",
  "description": "Patient care support. Standard clinical access.",
  "summary": "### What you can do as Nurse:\n• Register a new patient...\n\n### What you CANNOT do:\n• Create, edit, delete users → Ask: Super Admin"
}
```

---

## 12. Groq API Configuration

| Setting | Value |
|---------|-------|
| **API Provider** | Groq (groq.com) |
| **Model** | `llama-3.3-70b-versatile` (Llama 3.3 70B) |
| **Endpoint** | `https://api.groq.com/openai/v1/chat/completions` |
| **Auth** | Bearer token in `Authorization` header |
| **HTTP Client** | `httpx` (async, 30s timeout) |
| **Config Location** | `GROQ_API_KEY` in `backend/.env` |
| **Format** | OpenAI-compatible (messages array) |

### How to get a Groq API key

1. Go to [Groq Console](https://console.groq.com/keys)
2. Sign up (free) and click "Create API Key"
3. Copy the key (starts with `gsk_`)
4. Paste it in `backend/.env` as `GROQ_API_KEY=your_key_here`

### How to change the model

Edit `GROQ_MODEL` in `backend/app/services/chat_service.py`:
```python
GROQ_MODEL = "llama-3.3-70b-versatile"  # Change to any Groq model
# Other options: "mixtral-8x7b-32768", "llama-3.1-8b-instant", "gemma2-9b-it"
```

### Why Groq over Gemini?

| Feature | Groq | Gemini (previous) |
|---------|------|-------------------|
| Speed | ~1-3s (fastest inference) | ~2-5s |
| Free tier | 14,400 req/day | 1,500 req/day |
| API format | OpenAI-compatible | Custom Google format |
| Model quality | Llama 3.3 70B (excellent) | Gemini 2.0 Flash |
| Rate limits | Very generous | Often exhausted |

---

## 13. System Prompt Engineering

When Groq is called, it receives a carefully crafted system prompt containing:

1. **User identity** — username, role, role description
2. **Complete permission list** — everything they CAN do (with how-to) and everything they CANNOT do (with who can)
3. **Full HMS knowledge base** — system overview, features, password rules, patient fields, employee ID formats, navigation, common issues/solutions
4. **Live database data** — when the question is about data, real-time query results (patient counts, staff lists, hospital config) are injected
5. **12 behavior rules** — how the AI should respond (role-aware, honest, concise, markdown-formatted, no made-up features, use real data from DB)

The system prompt is sent as a proper `system` message (Groq/OpenAI format supports native system messages, unlike Gemini which required a workaround).

---

## 14. Knowledge Base Contents

The `HMS_SYSTEM_KNOWLEDGE` string in `chat_knowledge.py` contains:

| Section | Content |
|---------|---------|
| System Overview | What HMS is and what it does |
| Roles & Access Levels | All 9 roles with descriptions |
| Key Features | Patient registration, directory, ID cards, staff, user management, hospital setup, profile |
| Password Requirements | Min 8 chars, uppercase, lowercase, number, special char |
| Patient Registration Fields | Personal, contact, address, emergency contact — every field listed |
| Navigation | Sidebar items with descriptions |
| Common Issues & Solutions | 6 FAQ-style troubleshooting entries |
| Employee ID Format | DOC-YYYY-XXXX, NUR-YYYY-XXXX, etc. for all roles |
| Technical Details | Backend (FastAPI), Frontend (React), DB (PostgreSQL), Auth (JWT) |

---

## 15. Conversation History & Context

- The frontend sends the **last 20 messages** with each request (configurable via `max_length` in the Pydantic schema)
- The backend forwards the **last 10 messages** to Groq (to stay within token limits)
- The welcome message and loading placeholders are filtered out before sending
- Each message has `role` ("user" or "assistant") and `content` (text)

This means Groq can handle follow-up questions like:
```
User: "Can I register a patient?"
AI: "Yes! Go to Register Patient..."
User: "What fields do I need to fill in?"
AI: (uses conversation context) "For patient registration, you need: Title, First Name..."
```

---

## 16. Action Extraction & Fuzzy Matching

The `_extract_action()` function uses 3 strategies to match user questions to permission actions:

1. **Direct keyword match** — "delete user" found in message → `delete_user`
2. **Filler word removal** — "delete **a** user" → remove "a" → "delete user" → `delete_user`
3. **Regex gap matching** — "delete **the specific** user" → regex allows 0-2 words between "delete" and "user" → `delete_user`

### Keywords per action

```
register_patient  →  "register patient", "add patient", "new patient", "create patient", "patient registration"
delete_user       →  "delete user", "remove user", "deactivate user"
change_own_password → "change password", "change my password", "update password", "my password"
export_staff_csv  →  "export csv", "download csv", "staff export", "export staff"
upload_hospital_logo → "upload logo", "hospital logo", "change logo", "add logo"
... (20+ actions total)
```

---

## 17. Security

| Aspect | Implementation |
|--------|---------------|
| **Authentication** | All chat endpoints require valid JWT token (Bearer header) |
| **Role extraction** | Role is read from the JWT on the server — users cannot fake their role |
| **Message validation** | Max 2000 characters per message, max 20 history messages (Pydantic) |
| **API key protection** | Groq API key stored in `.env` (not committed to git), never sent to frontend |
| **No data storage** | Chat messages are NOT saved to the database — they exist only in the frontend's React state and are lost on page refresh |
| **DB queries** | Read-only (SELECT only), max 5 results per search, SQLAlchemy ORM (no raw SQL) |
| **Error handling** | All exceptions caught with generic error messages — no internal details leaked |

---

## 18. Rate Limits & Costs

### Groq (Llama 3.3 70B Versatile — Free Tier)

| Limit | Value |
|-------|-------|
| Requests per minute | 30 |
| Requests per day | 14,400 |
| Tokens per minute | 131,072 |
| Cost | **$0 (free)** |

### What happens when rate limited

- Groq returns HTTP 429
- The backend logs the error
- Response falls through to Tier 3 (Fallback)
- User still gets a helpful response
- No error shown to the user

### Rules engine (Tier 1)

- No rate limits — runs locally
- No API calls — instant response
- Handles ~60% of typical questions (permission checks, role summaries)

---

## 19. Examples — What Users Can Ask

### Permission Questions (→ Rules Engine, instant)

| Question | Source | Response Type |
|----------|--------|---------------|
| "Can I delete a user?" | instant | ✅ Yes or 🚫 No with guidance |
| "Am I able to register a patient?" | instant | ✅ Yes with step-by-step |
| "Who can manage users?" | instant | Lists allowed roles |
| "What can I do?" | instant | Full role permission summary |
| "How do I change my password?" | instant | Step-by-step with nav path |
| "Can I upload the hospital logo?" | instant | ✅/🚫 based on role |

### Complex Questions (→ Groq AI)

| Question | Source |
|----------|--------|
| "Explain the difference between Admin and Super Admin" | ai |
| "Walk me through the patient registration workflow" | ai |
| "What should I do if a patient's ID card isn't showing the logo?" | ai |
| "How does the employee ID numbering work?" | ai |
| "I'm new here, give me an overview of the system" | ai |

### Database Questions (→ Groq AI + DB)

| Question | Source |
|----------|--------|
| "How many patients are registered?" | ai+db |
| "List all doctors" | ai+db |
| "Show me patient HMS-000001" | ai+db |
| "How many male vs female patients?" | ai+db |
| "What are the hospital details?" | ai+db |
| "Give me a system overview with numbers" | ai+db |

### Conversational (→ Fallback)

| Question | Response |
|----------|----------|
| "Hello" / "Hi" / "Help" | Welcome message with suggestions |
| "Thanks" / "Thank you" | Polite acknowledgment |
| Random text | Suggests example questions to try |

---

## 20. Response Source Indicators

Every bot message shows a small badge at the bottom indicating where the response came from:

| Badge | Source | Meaning |
|-------|--------|--------|
| ⚡ Instant | `instant` | Answered from local knowledge base in <50ms |
| ✨ AI | `ai` | Answered by Groq Llama 3.3 70B AI (1-3s) |
| ✨ AI+DB | `ai+db` | Answered by AI with live database data |
| ℹ Offline | `offline` | Answered without API — local keyword matching |

---

## 21. Tech Stack

### Backend

| Component | Technology |
|-----------|------------|
| Framework | FastAPI (Python) |
| HTTP Client | httpx 0.26.0 (async) |
| AI Model | Llama 3.3 70B via Groq API |
| DB Queries | SQLAlchemy ORM (read-only) |
| Auth | JWT (same as existing HMS auth) |
| Validation | Pydantic v2 |
| Config | pydantic-settings (loads from .env) |

### Frontend

| Component | Technology |
|-----------|------------|
| Framework | React 19 + TypeScript |
| HTTP Client | axios (shared instance with JWT interceptor) |
| Voice Input | Web Speech API (browser-native) |
| Styling | Tailwind CSS (uses existing HMS `primary` color) |
| Icons | Material Symbols Outlined (already loaded in HMS) |
| Animations | CSS keyframes (inline `<style>` tag) |
| State | React useState + useRef (no external state library) |

### No Additional Infrastructure Required

- No database tables added
- No Redis / caching layer needed
- No WebSocket server needed
- No additional npm packages installed
- No Docker changes needed
- Only 1 pip package needed (`httpx` — was already a project dependency)
