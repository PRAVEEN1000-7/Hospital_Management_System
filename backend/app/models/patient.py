from sqlalchemy import Column, Integer, String, Date, Boolean, DateTime, ForeignKey, Sequence
from sqlalchemy.sql import func
from ..database import Base
import enum


class Gender(str, enum.Enum):
    MALE = "Male"
    FEMALE = "Female"
    OTHER = "Other"


class Title(str, enum.Enum):
    MR = "Mr."
    MRS = "Mrs."
    MS = "Ms."
    MASTER = "Master"
    DR = "Dr."
    PROF = "Prof."
    BABY = "Baby"


class BloodGroup(str, enum.Enum):
    A_POSITIVE = "A+"
    A_NEGATIVE = "A-"
    B_POSITIVE = "B+"
    B_NEGATIVE = "B-"
    AB_POSITIVE = "AB+"
    AB_NEGATIVE = "AB-"
    O_POSITIVE = "O+"
    O_NEGATIVE = "O-"


class Relationship(str, enum.Enum):
    FATHER = "Father"
    MOTHER = "Mother"
    HUSBAND = "Husband"
    WIFE = "Wife"
    SON = "Son"
    DAUGHTER = "Daughter"
    BROTHER = "Brother"
    SISTER = "Sister"
    FRIEND = "Friend"
    GUARDIAN = "Guardian"
    OTHER = "Other"


prn_sequence = Sequence('prn_sequence')


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    prn = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(10), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    date_of_birth = Column(Date, nullable=False)
    gender = Column(String(10), nullable=False)
    blood_group = Column(String(5), nullable=True)
    country_code = Column(String(5), nullable=False, default="+91")
    mobile_number = Column(String(15), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    address_line1 = Column(String(255), nullable=False)
    address_line2 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pin_code = Column(String(10), nullable=True)
    country = Column(String(100), nullable=True, default="India")
    emergency_contact_name = Column(String(255), nullable=True)
    emergency_contact_country_code = Column(String(5), nullable=True, default="+91")
    emergency_contact_mobile = Column(String(15), nullable=True)
    emergency_contact_relationship = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @property
    def full_name(self) -> str:
        """Computed full name from title, first_name, last_name"""
        return f"{self.title} {self.first_name} {self.last_name}"

    @property
    def full_mobile(self) -> str:
        """Full mobile number with country code"""
        return f"{self.country_code}{self.mobile_number}"
