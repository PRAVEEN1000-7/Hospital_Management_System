from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional, Any
from datetime import date, time, datetime
from decimal import Decimal


VALID_APPOINTMENT_TYPES = ["scheduled", "walk-in"]
VALID_APPOINTMENT_STATUSES = [
    "scheduled", "pending", "confirmed", "in-progress", "completed",
    "cancelled", "no-show", "rescheduled",
]
VALID_PRIORITY_LEVELS = ["normal", "urgent", "emergency"]
VALID_LEAVE_TYPES = ["personal", "sick", "holiday", "conference", "other"]
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ---- Helper: ORM -> dict with stringified UUIDs ----

def _orm_to_dict(data: Any) -> Any:
    """Convert SQLAlchemy model instance to dict with all UUIDs as strings."""
    if hasattr(data, "__table__"):
        d = {}
        for col in data.__table__.columns:
            val = getattr(data, col.name)
            # Convert UUID fields to str
            if hasattr(val, "hex"):  # uuid.UUID
                val = str(val)
            d[col.name] = val
        return d
    if isinstance(data, dict):
        return data
    return data


# ---- Doctor Schedule Schemas ----

class DoctorScheduleBase(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6, description="0=Sunday, 1=Monday ... 6=Saturday")
    start_time: time
    end_time: time
    slot_duration_minutes: int = Field(default=30, ge=5, le=120)
    max_patients: int = Field(default=1, ge=1, le=10)
    break_start_time: Optional[time] = None
    break_end_time: Optional[time] = None
    is_active: bool = True
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None

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
    slot_duration_minutes: Optional[int] = Field(default=None, ge=5, le=120)
    max_patients: Optional[int] = Field(default=None, ge=1, le=10)
    break_start_time: Optional[time] = None
    break_end_time: Optional[time] = None
    is_active: Optional[bool] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


class DoctorScheduleResponse(BaseModel):
    id: str
    doctor_id: str
    day_of_week: int
    start_time: time
    end_time: time
    slot_duration_minutes: int
    max_patients: int
    break_start_time: Optional[time] = None
    break_end_time: Optional[time] = None
    is_active: bool
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class DoctorScheduleBulkCreate(BaseModel):
    doctor_id: str
    schedules: list[DoctorScheduleCreate]


# ---- Doctor Leave Schemas ----

class DoctorLeaveCreate(BaseModel):
    doctor_id: str
    leave_date: date
    leave_type: str = Field(default="full_day", description="full_day, morning, or afternoon")
    reason: Optional[str] = Field(None, max_length=255)

    @field_validator("leave_type")
    @classmethod
    def validate_leave_type(cls, v: str) -> str:
        valid = ["full_day", "morning", "afternoon"]
        if v not in valid:
            raise ValueError(f"Must be one of: {', '.join(valid)}")
        return v


class DoctorLeaveResponse(BaseModel):
    id: str
    doctor_id: str
    leave_date: date
    leave_type: str
    reason: Optional[str] = None
    status: Optional[str] = None
    approved_by: Optional[str] = None
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


# ---- Appointment Schemas ----

class AppointmentCreate(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    department_id: Optional[str] = None
    appointment_type: str = Field(default="scheduled")
    visit_type: Optional[str] = None
    appointment_date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    chief_complaint: Optional[str] = None
    priority: Optional[str] = Field(default="normal")
    consultation_fee: Optional[Decimal] = None

    @field_validator("appointment_type")
    @classmethod
    def validate_appointment_type(cls, v: str) -> str:
        if v not in VALID_APPOINTMENT_TYPES:
            raise ValueError(f"Must be one of: {', '.join(VALID_APPOINTMENT_TYPES)}")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_PRIORITY_LEVELS:
            raise ValueError(f"Must be one of: {', '.join(VALID_PRIORITY_LEVELS)}")
        return v


class AppointmentUpdate(BaseModel):
    doctor_id: Optional[str] = None
    appointment_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    chief_complaint: Optional[str] = None
    priority: Optional[str] = None
    consultation_fee: Optional[Decimal] = None
    visit_type: Optional[str] = None
    department_id: Optional[str] = None


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
    id: str
    appointment_number: str
    patient_id: str
    doctor_id: Optional[str] = None
    hospital_id: Optional[str] = None
    department_id: Optional[str] = None
    appointment_type: str
    visit_type: Optional[str] = None
    appointment_date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    status: str
    priority: Optional[str] = "normal"
    chief_complaint: Optional[str] = None
    consultation_fee: Optional[Decimal] = None
    cancel_reason: Optional[str] = None
    reschedule_reason: Optional[str] = None
    reschedule_count: int = 0
    created_by: Optional[str] = None
    check_in_at: Optional[datetime] = None
    consultation_start_at: Optional[datetime] = None
    consultation_end_at: Optional[datetime] = None
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class AppointmentListItem(BaseModel):
    id: str
    appointment_number: str
    patient_id: str
    doctor_id: Optional[str] = None
    appointment_type: str
    visit_type: Optional[str] = None
    appointment_date: date
    start_time: Optional[time] = None
    status: str
    priority: Optional[str] = "normal"
    chief_complaint: Optional[str] = None
    consultation_fee: Optional[Decimal] = None
    notes: Optional[str] = None
    created_at: datetime
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class PaginatedAppointmentResponse(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int
    data: list[AppointmentListItem]


# ---- Walk-in Schemas ----

class WalkInRegister(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    chief_complaint: Optional[str] = None
    priority: str = Field(default="normal")
    consultation_fee: Optional[Decimal] = None

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        if v not in VALID_PRIORITY_LEVELS:
            raise ValueError(f"Must be one of: {', '.join(VALID_PRIORITY_LEVELS)}")
        return v


class WalkInAssignDoctor(BaseModel):
    doctor_id: str


class QueueStatus(BaseModel):
    total_waiting: int
    total_in_progress: int
    total_completed_today: int
    average_wait_time: int
    queue: list[AppointmentListItem]


# ---- Settings Schemas (Hospital-level) ----

class HospitalSettingsResponse(BaseModel):
    id: str
    hospital_id: str
    appointment_slot_duration: int = 30
    appointment_buffer_minutes: int = 5
    allow_walk_ins: bool = True
    max_advance_booking_days: int = 30
    cancellation_policy_hours: int = 24
    enable_auto_reminders: bool = True
    enable_sms_notifications: bool = False
    enable_email_notifications: bool = True
    working_hours_start: Optional[time] = None
    working_hours_end: Optional[time] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def transform(cls, data: Any) -> Any:
        return _orm_to_dict(data)

    model_config = ConfigDict(from_attributes=True)


class HospitalSettingsUpdate(BaseModel):
    appointment_slot_duration: Optional[int] = None
    appointment_buffer_minutes: Optional[int] = None
    allow_walk_ins: Optional[bool] = None
    max_advance_booking_days: Optional[int] = None
    cancellation_policy_hours: Optional[int] = None
    enable_auto_reminders: Optional[bool] = None
    enable_sms_notifications: Optional[bool] = None
    enable_email_notifications: Optional[bool] = None
    working_hours_start: Optional[time] = None
    working_hours_end: Optional[time] = None


# ---- Stats / Report Schemas ----

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


class EnhancedAppointmentStats(AppointmentStats):
    """Extended stats with per-doctor and per-department breakdowns."""
    doctor_stats: list[dict] = []
    department_stats: list[dict] = []
    daily_trends: list[dict] = []
    peak_hours: list[dict] = []
    cancellation_reasons: list[dict] = []


class AppointmentSettingResponse(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AppointmentSettingUpdate(BaseModel):
    setting_value: str


class TimeSlot(BaseModel):
    time: time
    available: bool
    current_bookings: int
    max_bookings: int


class AvailableSlotsResponse(BaseModel):
    doctor_id: str
    date: date
    slots: list[TimeSlot]
