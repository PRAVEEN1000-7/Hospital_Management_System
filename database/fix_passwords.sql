-- Fix user passwords with correct bcrypt hashes
-- Password: superadmin123
UPDATE users SET password_hash = '$2b$12$CvbB5ik7MBf1N7mmoDaah.RFkKhkfjKN5lFthKWIEhAnftS/d8wgi' WHERE username = 'superadmin';

-- Password: admin123
UPDATE users SET password_hash = '$2b$12$R0GcmWMpiIlM52u3lOWJi.eDwe.RMo9oOOBu.82iyiv1HiOvIiFsa' WHERE username = 'admin';

-- Password: doctor123
UPDATE users SET password_hash = '$2b$12$vy5U..EarJPt1VHeXrehqeOPS8mfQl.nyJHa1FrM.vSxI8TNfNqDO' WHERE username = 'doctor1';

-- Password: nurse123
UPDATE users SET password_hash = '$2b$12$DkJaAaj2H3DKq8iEWeR8juwYGr7F.nYV0KgQfCPcQWqliF0R2I/uC' WHERE username = 'nurse1';
