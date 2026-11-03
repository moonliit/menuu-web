-- @foreign-keys-off
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('consumer', 'kitchen')),
  kitchen_id TEXT REFERENCES kitchens(id),
  student_code TEXT,
  career TEXT,
  birth_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (role <> 'consumer' OR lower(email) LIKE '%@utec.edu.pe'),
  CHECK (role <> 'consumer' OR (
    student_code IS NOT NULL AND (
      (length(student_code)=9 AND student_code NOT GLOB '*[^0-9]*') OR
      (length(student_code) IN (14,15) AND substr(student_code,1,4) NOT GLOB '*[^0-9]*'
       AND substr(student_code,5,3)='PRE'
       AND substr(student_code,8) NOT GLOB '*[^0-9]*')
    )
  )),
  CHECK (role <> 'consumer' OR (career IS NOT NULL AND length(career) BETWEEN 2 AND 80)),
  CHECK (role <> 'kitchen' OR kitchen_id IS NOT NULL),
  CHECK (role = 'consumer' OR birth_date IS NULL),
  CHECK (birth_date IS NULL OR birth_date >= '1900-01-01')
);
INSERT INTO users_new (id,name,email,password_hash,role,kitchen_id,student_code,career,birth_date,created_at)
SELECT id,name,email,password_hash,role,kitchen_id,student_code,career,birth_date,created_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX users_student_code_unique ON users(student_code) WHERE student_code IS NOT NULL;
