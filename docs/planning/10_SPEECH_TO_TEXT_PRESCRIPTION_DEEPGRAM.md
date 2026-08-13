# Speech-to-Text for the Prescription Module (Deepgram Nova-3 Medical)

Status: **Proposal / not yet implemented**
Target module: `frontend/src/pages/PrescriptionBuilder.tsx` — "Diagnosis & Medicines" section
Model: **Deepgram Nova-3 Medical**

---

## 1. What this is

A voice-dictation feature for the E-Prescription Builder's medicine row. The doctor
taps a mic button on a medicine row and speaks the whole order naturally, e.g.:

> "Paracetamol 500mg twice daily for 5 days, oral, before food"

The audio is sent to Deepgram's Nova-3 Medical model, which returns a text
transcript tuned for clinical vocabulary (drug names, dosages, routes,
frequency phrases). That transcript is then parsed and used to auto-fill the
row's fields (`medicine_name`, `dosage`, `frequency`, `duration_value`,
`duration_unit`, `route`, `instructions`) via the existing `updateItem()`
handler in `PrescriptionBuilder.tsx` (line 624). All fields remain editable
afterward so the doctor can correct any mis-transcription before saving.

## 2. Why Deepgram Nova-3 Medical specifically

- **Clinical vocabulary tuning** — trained to recognize drug names, dosage
  units, routes ("oral", "topical", "intramuscular"), and frequency phrasing
  ("twice daily", "before food") more accurately than a general-purpose STT
  model.
- **Real-time streaming support** — the doctor can see the transcript appear
  as they speak, not just after they stop.
- **Cheapest of the medical-tuned options evaluated** — see pricing below;
  meaningfully cheaper than AWS Transcribe Medical for comparable
  clinical-domain accuracy.
- **No LLM required to ship v1** — the transcript can be parsed into the
  row's fields with plain regex/keyword matching against the existing
  `FREQUENCY_OPTIONS` / `ROUTE_OPTIONS` / `FOOD_TIMING_OPTIONS` constants
  already defined in `PrescriptionBuilder.tsx`. An LLM call is only a
  fallback for phrasing the keyword matcher can't confidently parse.

## 3. How it's useful

- Faster prescription entry for doctors during high patient volume — speaking
  a line is faster than tabbing through 6 fields per medicine.
- Reduces typos in drug names/dosages compared to manual typing under time
  pressure.
- Lowers friction for doctors less comfortable typing quickly, without
  changing the underlying prescription data model at all.

## 4. Drawbacks / limitations

- **Transcription errors on Indian-accented English** are possible — Nova-3
  Medical is English-tuned; accuracy on strongly accented speech or
  code-switched Tamil/Hindi phrases has not been benchmarked against this
  hospital's actual doctors and should be tested before rollout (see §8).
- **Parsing is heuristic, not guaranteed** — free-form dictation doesn't map
  1:1 onto structured fields; the keyword parser will occasionally mis-split
  a line (e.g. ambiguous dosage/duration wording) and require manual
  correction. This is a UX safety net requirement, not optional polish.
- **Requires a backend proxy** — the Deepgram API key must never be exposed
  to the browser, so audio has to be relayed through a new backend endpoint
  rather than called directly from the frontend. This adds a small amount of
  latency and backend surface area to maintain.
- **Network dependency** — dictation won't work offline or during API
  outages; the manual-entry path must stay fully functional as a fallback
  at all times (it already is — this is additive, not a replacement).
- **Cost scales with usage** — see §7. Cheap per-minute, but worth monitoring
  if adopted hospital-wide across many doctors.
- **New compliance surface** — prescription audio briefly transits a
  third-party API. Deepgram offers a BAA for health data; this should be
  reviewed/signed before handling real patient audio in production, not
  just in a pilot with synthetic data.

## 5. Architecture overview

```
Doctor taps mic on a medicine row (PrescriptionBuilder.tsx)
        │
        ▼
Browser captures audio (MediaRecorder API)
        │
        ▼
Audio blob sent to new backend endpoint, e.g. POST /prescriptions/dictate
        │  (backend/app/routers/prescriptions.py)
        ▼
Backend calls Deepgram Nova-3 Medical API using DEEPGRAM_API_KEY
        │  (key lives server-side only — backend/.env)
        ▼
Deepgram returns transcript text
        │
        ▼
Backend (or frontend) parses transcript → structured fields
   using FREQUENCY_OPTIONS / ROUTE_OPTIONS / FOOD_TIMING_OPTIONS
   already defined in PrescriptionBuilder.tsx
        │
        ▼
Response fills the row via the existing updateItem() handler
        │
        ▼
Doctor reviews/corrects the auto-filled row, continues as normal
```

## 6. Step-by-step implementation plan

### Step 1 — Get a Deepgram API key
1. Sign up at [deepgram.com](https://deepgram.com) (or via their console if
   an account already exists).
2. Create a new API key scoped to speech-to-text only (avoid a key with
   billing/account-admin permissions).
3. Note Deepgram's free trial credit — enough to fully test this feature
   before any billing is needed (check current trial terms at signup, they
   change over time).
4. If handling real patient audio in production, request/sign Deepgram's
   BAA (Business Associate Agreement) for health-data handling before going
   live — do this before step 7, not after.

### Step 2 — Store the key server-side only
Add to `backend/.env` (never commit this file, and never send the key to
the frontend):
```
DEEPGRAM_API_KEY=your_key_here
```
Add a corresponding placeholder line to `backend/.env.example` so other
developers know the variable exists, without the real value.

### Step 3 — Add a backend endpoint to proxy the audio
New route in `backend/app/routers/prescriptions.py` (alongside the existing
`router = APIRouter(prefix="/prescriptions", ...)`), e.g.:
- `POST /prescriptions/dictate` — accepts an audio file (`UploadFile`),
  forwards it to Deepgram's `POST https://api.deepgram.com/v1/listen`
  endpoint with `model=nova-3-medical`, returns the transcript (and
  optionally the parsed fields) to the frontend.
- Keep this endpoint behind the same auth dependency
  (`get_current_active_user`) used elsewhere in this file, so dictation
  requires a logged-in doctor session like every other prescription action.

### Step 4 — Add microphone capture in the frontend
In `PrescriptionBuilder.tsx`, add a mic icon button to each medicine row
(next to the existing `#` row index, near line ~1462 where the row body
starts). Use the browser's `MediaRecorder` API to capture audio on
press-and-hold or tap-to-start/tap-to-stop, then `POST` the resulting blob
to the new `/prescriptions/dictate` endpoint.

### Step 5 — Parse the transcript into row fields
Write a small parser (backend or frontend, backend is cleaner) that takes
the transcript string and extracts:
- Drug name + dosage (e.g. "Paracetamol 500mg")
- Frequency phrase → matched against `FREQUENCY_OPTIONS`
- Duration number + unit → matched against `DURATION_UNITS`
- Route phrase → matched against `ROUTE_OPTIONS`
- Food timing phrase → matched against `FOOD_TIMING_OPTIONS`

Start with simple regex/keyword matching (no LLM needed). Anything that
doesn't confidently match stays blank for manual entry rather than
guessing wrong.

### Step 6 — Auto-fill the row
Call the existing `updateItem(blockIdx, itemIdx, field, value)` handler
(line 624) once per parsed field to populate the row — this reuses all the
existing validation/auto-append-new-row behavior already in place, so no
changes are needed to the row-management logic itself.

### Step 7 — Test with real dictation samples
Before rollout, record a handful of real doctors reading out sample
prescriptions (including Indian-accented English) and check transcript +
parse accuracy against what a human would enter. Tune the parser based on
actual failure patterns rather than guessing upfront.

### Step 8 — Ship behind a toggle
Launch as an optional mic button that doctors can ignore entirely — manual
entry keeps working exactly as today. Consider a settings flag to
enable/disable per hospital or per doctor while confidence is being built.

## 7. Pricing (Deepgram Nova-3 Medical)

| Mode | USD | INR (approx, @ ₹95.3/$ — Aug 2026) |
|---|---|---|
| Pre-recorded / batch | $0.0043 / min | ₹0.41 / min |
| Real-time streaming | $0.0077 / min | ₹0.73 / min |

> Exchange rate fluctuates day to day — re-check the live rate before
> budgeting; ₹95.3/$ was the approximate USD→INR rate in early August 2026.

**Example monthly estimate** — assuming ~5 minutes of dictation per
prescription, 500 prescriptions/month (2,500 minutes total):
- Batch mode: 2,500 × $0.0043 = **$10.75/month ≈ ₹1,024/month**
- Streaming mode: 2,500 × $0.0077 = **$19.25/month ≈ ₹1,834/month**

This is negligible at pilot scale; re-estimate once real usage volume
(number of doctors × prescriptions/day × avg. dictation length) is known.

## 8. Test API request

A minimal test call against a sample audio file, to confirm the API key
works before writing any integration code:

```bash
curl --request POST \
  --url 'https://api.deepgram.com/v1/listen?model=nova-3-medical&smart_format=true&punctuate=true' \
  --header "Authorization: Token $DEEPGRAM_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"url":"https://dpgr.am/spacewalk.wav"}'
```

For testing with a locally recorded file instead of a URL:

```bash
curl --request POST \
  --url 'https://api.deepgram.com/v1/listen?model=nova-3-medical&smart_format=true&punctuate=true' \
  --header "Authorization: Token $DEEPGRAM_API_KEY" \
  --header 'Content-Type: audio/wav' \
  --data-binary @sample_prescription.wav
```

Replace `$DEEPGRAM_API_KEY` with the key from Step 1. A successful response
returns a JSON payload containing the transcript under
`results.channels[0].alternatives[0].transcript`.

## 9. Open questions before implementation starts

- Who signs Deepgram's BAA, and is that already covered under an existing
  vendor-compliance process at this hospital group?
- Push-to-talk (hold mic button) vs toggle (tap to start/stop) — which fits
  doctors' actual workflow better? Worth a quick doctor interview before
  building.
- Should the parsed draft require an explicit "Accept" step before filling
  the row, or auto-fill immediately with fields left editable? Auto-fill is
  faster but riskier if the parser is wrong; an explicit accept step is
  slightly slower but safer for a first release.
