from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date, time, datetime
from decimal import Decimal


# ── Constants ──────────────────────────────────────────────────────────────

VALID_APPOINTMENT_TYPES = ["scheduled", "walk-in"]
VALID_CONSULTATION_TYPES = ["online", "offline", "both"]
VALID_APPOINTMENT_STATUSES = [
    "pending", "confirmed", "in-progress", "completed",
    "cancelled", "no-show", "rescheduled",
]
VALID_URGENCY_LEVELS = ["routine", "urgent", "emergency"]
VALID_WAITLIST_STATUSES = ["waiting", "notified", "confirmed", "expired", "cancelled"]
VALID_PAYMENT_STATUSES = ["pending", "paid", "partial", "waived"]
VALID_BLOCK_TYPES = ["leave", "holiday", "emergency", "other"]
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ═══════════════════════════════════════════════════════════════════════════
# Doctor Schedule Schemas
# ═══════════════════════════════════════════════════════════════════════════

class DoctorScheduleBase(BaseModel):
    weekday: int = Field(..., ge=0, le=6, description="0=Monday … 6=Sunday")
    start_time: time
    end_time: time
    slot_duration: int = Field(default=30, ge=5, le=120)
    consultation_type: str = Field(default="both")
    max_patients_per_slot: int = Field(default=1, ge=1, le=10)
    is_active: bool = True

    @field_validator("consultation_type")
    @classmethod
    def validate_consultation_type(cls, v: str) -> str:
        if v not in VALID_CONSULTATION_TYPES:
            raise ValueError(f"Must be one of: {', '.join(VALID_CONSULTATION_TYPES)}")
        return v

    @field_validator("end_time")
    @classmethod
    def validate_end_after_start(cls, v: time, info) -> time:
        start = info.data.get("start_time")
        if start and v <= start:
            raise ValueError("end_time must be after start_time")
        return v


class DoctorScheduleCreate(DoctorScheduleBase):
    pass


class DoctorScheduleUpdate(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    slot_duration: Optional[int] = Field(default=None, ge=5, le=120)
    consultation_type: Optional[str] = None
    max_patients_per_slot: Optional[int] = Field(default=None, ge=1, le=10)
    is_active: Optional[bool] = None


class DoctorScheduleResponse(BaseModel):
    id: int
    doctor_id: int
    weekday: int
    start_time: time
    end_time: time
    slot_duration: int
    consultation_type: str
    max_patients_per_slot: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DoctorScheduleBulkCreate(BaseModel):
    """Create multiple schedule entries at once"""
    doctor_id: int
    schedules: list[DoctorScheduleCreate]


# ═══════════════════════════════════════════════════════════════════════════
# Blocked Period Schemas
# ═══════════════════════════════════════════════════════════════════════════

class BlockedPeriodBase(BaseModel):
    doctor_id: Optional[int] = None  # None = hospital-wide holiday
    start_date: date
    end_date: date
    reason: Optional[str] = Field(None, max_length=255)
    block_type: str = Field(default="leave")

    @field_validator("block_type")
    @classmethod
    def validate_block_type(cls, v: str) -> str:
        if v not in VALID_BLOCK_TYPES:
            raise ValueError(f"Must be one of: {', '.join(VALID_BLOCK_TYPES)}")
        return v

    @field_validator("end_date")
    @classmethod
    def validate_end_after_start(cls, v: date, info) -> date:
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date must be >= start_date")
        return v


class BlockedPeriodCreate(BlockedPeriodBase):
    pass


class BlockedPeriodResponse(BaseModel):
    id: int
    doctor_id: Optional[int]
    start_date: date
    end_date: date
    reason: Optional[str]
    block_type: str
    created_by: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════════════════
# Appointment Schemas
# ═══════════════════════════════════════════════════════════════════════════

class AppointmentCreate(BaseModel):
    patient_id: int
    doctor_id: Optional[int] = None
    appointment_type: str = Field(default="scheduled")
    consultation_type: str = Field(default="offline")
    appointment_date: date
    appointment_time: Optional[time] = None
    reason_for_visit: Optional[str] = None
    urgency_level: Optional[str] = None
    fees: Optional[Decimal] = None

    @field_validator("appointment_type")
    @classmethod
    def validate_appointment_type(cls, v: str) -> str:
        if v not in VALID_APPOINTMENT_TYPES:
            raise ValueError(f"Must be one of: {', '.join(VALID_APPOINTMENT_TYPES)}")
        return v

    @field_validator("consultation_type")
    @classmethod
    def validate_consultation_type(cls, v: str) -> str:
        if v not in ["online", "offline"]:
            raise ValueError("Must be 'online' or 'offline'")
        return v

    @field_validator("urgency_level")
    @classmethod
    def validate_urgency(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_URGENCY_LEVELS:
            raise ValueError(f"Must be one of: {', '.join(VALID_URGENCY_LEVELS)}")
        return v


class AppointmentUpdate(BaseModel):
    doctor_id: Optional[int] = None
    appointment_date: Optional[date] = None
    appointment_time: Optional[time] = None
    consultation_type: Optional[str] = None
    reason_for_visit: Optional[str] = None
    doctor_notes: Optional[str] = None
    diagnosis: Optional[str] = None
    prescription: Optional[str] = None
    fees: Optional[Decimal] = None
    payment_status: Optional[str] = None
    urgency_level: Optional[str] = None


class AppointmentStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_APPOINTMENT_STATUSES:
            raise ValueError(f"Must be one of: {', '.join(VALID_APPOINTMENT_STATUSES)}")
        return v


class AppointmentReschedule(BaseModel):
    new_date: date
    new_time: Optional[time] = None
    reason: Optional[str] = None


class AppointmentResponse(BaseModel):
    id: int
    appointment_number: str
    patient_id: int
    doctor_id: Optional[int]
    appointment_type: str
    consultation_type: str
    appointment_date: date
    appointment_time: Optional[time]
    slot_duration: int
    status: str
    queue_number: Optional[str]
    queue_position: Optional[int]
    estimated_wait_time: Optional[int]
    walk_in_registered_at: Optional[datetime]
    urgency_level: Optional[str]
    zoom_meeting_link: Optional[str]
    reason_for_visit: Optional[str]
    doctor_notes: Optional[str]
    diagnosis: Optional[str]
    prescription: Optional[str]
    fees: Optional[Decimal]
    payment_status: Optional[str]
    confirmation_sent: bool
    reminder_sent: bool
    booked_by: Optional[int]
    cancelled_by: Optional[int]
    cancellation_reason: Optional[str]
    cancelled_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    # Joined fields (populated by router)
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None

    class Config:
        from_attributes = True


class AppointmentListItem(BaseModel):
    id: int
    appointment_number: str
    patient_id: int
    doctor_id: Optional[int]
    appointment_type: str
    consultation_type: str
    appointment_date: date
    appointment_time: Optional[time]
    status: str
    queue_number: Optional[str]
    urgency_level: Optional[str]
    reason_for_visit: Optional[str]
    fees: Optional[Decimal]
    payment_status: Optional[str]
    created_at: datetime

    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None

    class Config:
        from_attributes = True


class PaginatedAppointmentResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[AppointmentListItem]


# ═══════════════════════════════════════════════════════════════════════════
# Walk-in Schemas
# ═══════════════════════════════════════════════════════════════════════════

class WalkInRegister(BaseModel):
    patient_id: int
    doctor_id: Optional[int] = None
    reason_for_visit: Optional[str] = None
    urgency_level: str = Field(default="routine")
    fees: Optional[Decimal] = None

    @field_validator("urgency_level")
    @classmethod
    def validate_urgency(cls, v: str) -> str:
        if v not in VALID_URGENCY_LEVELS:
            raise ValueError(f"Must be one of: {', '.join(VALID_URGENCY_LEVELS)}")
        return v


class WalkInAssignDoctor(BaseModel):
    doctor_id: int


class QueueStatus(BaseModel):
    total_waiting: int
    total_in_progress: int
    total_completed_today: int
    average_wait_time: int  # minutes
    queue: list[AppointmentListItem]


# ═══════════════════════════════════════════════════════════════════════════
# Waitlist Schemas
# ═══════════════════════════════════════════════════════════════════════════

class WaitlistCreate(BaseModel):
    patient_id: int
    doctor_id: int
    preferred_date: date
    preferred_time: Optional[time] = None
    consultation_type: str = Field(default="offline")
    reason_for_visit: Optional[str] = None

    @field_validator("consultation_type")
    @classmethod
    def validate_consultation_type(cls, v: str) -> str:
        if v not in ["online", "offline"]:
            raise ValueError("Must be 'online' or 'offline'")
        return v


class WaitlistResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    preferred_date: date
    preferred_time: Optional[time]
    consultation_type: str
    reason_for_visit: Optional[str]
    status: str
    priority: int
    notified_at: Optional[datetime]
    expires_at: Optional[datetime]
    joined_at: Optional[datetime]
    confirmed_at: Optional[datetime]
    created_at: datetime

    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None

    class Config:
        from_attributes = True


class PaginatedWaitlistResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[WaitlistResponse]


# ═══════════════════════════════════════════════════════════════════════════
# Settings Schemas
# ═══════════════════════════════════════════════════════════════════════════

class AppointmentSettingResponse(BaseModel):
    id: int
    setting_key: str
    setting_value: str
    value_type: str
    description: Optional[str]
    is_global: bool
    doctor_id: Optional[int]
    updated_at: datetime

    class Config:
        from_attributes = True


class AppointmentSettingUpdate(BaseModel):
    setting_value: str


# ═══════════════════════════════════════════════════════════════════════════
# Report / Stats Schemas
# ═══════════════════════════════════════════════════════════════════════════

class AppointmentStats(BaseModel):
    total_appointments: int = 0
    total_scheduled: int = 0
    total_walk_ins: int = 0
    total_completed: int = 0
    total_cancelled: int = 0
    total_no_shows: int = 0
    total_pending: int = 0
    completion_rate: float = 0.0
    cancellation_rate: float = 0.0
    no_show_rate: float = 0.0
    average_wait_time: float = 0.0


class TimeSlot(BaseModel):
    time: time
    available: bool
    current_bookings: int
    max_bookings: int
    consultation_type: str


class AvailableSlotsResponse(BaseModel):
    doctor_id: int
    date: date
    slots: list[TimeSlot]
