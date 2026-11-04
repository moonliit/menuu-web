ALTER TABLE offers ADD COLUMN pickup_until_extended TEXT
  CHECK (pickup_until_extended IS NULL OR (
    pickup_until_extended > delivery_time AND
    (CAST(substr(pickup_until_extended,1,2) AS INTEGER)*60 + CAST(substr(pickup_until_extended,4,2) AS INTEGER)) -
    (CAST(substr(delivery_time,1,2) AS INTEGER)*60 + CAST(substr(delivery_time,4,2) AS INTEGER)) <= 60
  ));
