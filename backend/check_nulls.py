from app.config import settings
from sqlalchemy import create_engine, text
engine = create_engine(settings.DATABASE_URL)
q = "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'appointments' AND column_name IN ('start_time', 'doctor_id')"
with engine.connect() as conn:
    r = conn.execute(text(q))
    for row in r:
        print(row)
