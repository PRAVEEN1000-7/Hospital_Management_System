import re


def validate_mobile_number(mobile: str) -> bool:
    """Validate mobile number format (global: 4-15 digits)"""
    pattern = r'^\d{4,15}$'
    return bool(re.match(pattern, mobile))


def validate_email(email: str) -> bool:
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_pin_code(pin_code: str) -> bool:
    """Validate postal/ZIP code format (global: 3-10 alphanumeric)"""
    pattern = r'^[A-Za-z0-9 \-]{3,10}$'
    return bool(re.match(pattern, pin_code))


def validate_country_code(country_code: str) -> bool:
    """Validate international country dialing code"""
    pattern = r'^\+[0-9]{1,4}$'
    return bool(re.match(pattern, country_code))
