-- An emergency contact with each player's membership details (same visibility: the player, their staff, coordinators).
alter table registration add column emergency_name text check (char_length(emergency_name) <= 120);
alter table registration add column emergency_phone text check (char_length(emergency_phone) <= 40);
