-- Starting data every phone shares: SA clubs, Cape Town fields, the competitive calendar.
-- Ids are md5('<kind>:<name>') formatted as a UUID; the app derives the same ids (seed.ts).

create function seed_id(kind text, name text) returns text language sql immutable as $$ select md5(kind || ':' || name)::uuid::text $$;

insert into team (id, name, short_name, kind, region, city, primary_color, created_at, updated_at) values
  (seed_id('team', 'UCT Flying Tigers'), 'UCT Flying Tigers', 'FTG', 'university', 'western', 'UCT, Cape Town', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'UCT Roaring Tigers'), 'UCT Roaring Tigers', 'RTG', 'university', 'western', 'UCT, Cape Town', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Chilli Legends'), 'Chilli Legends', 'CHL', 'club', 'western', 'Pinelands, Cape Town', '#BF0000', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Catch 22'), 'Catch 22', 'C22', 'club', 'western', 'Cape Town', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Ghost'), 'Ghost', 'GHO', 'club', 'western', 'Cape Town', '#00562B', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Salusa 45'), 'Salusa 45', 'S45', 'club', 'western', 'Cape Town', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Maties Meerkats'), 'Maties Meerkats', 'MMK', 'university', 'western', 'Stellenbosch', '#61223B', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Nomad'), 'Nomad', 'NMD', 'club', 'western', 'Cape Town', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Ultitude'), 'Ultitude', 'ULT', 'club', 'northern', 'Greenside, Johannesburg', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Skyveld'), 'Skyveld', 'SKY', 'club', 'northern', 'Johannesburg', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Zone Rangers'), 'Zone Rangers', 'ZNR', 'club', 'northern', 'Johannesburg & Pretoria', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Wits Voodoo Kudus'), 'Wits Voodoo Kudus', 'WVK', 'university', 'northern', 'Wits, Johannesburg', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Soweto Ultimate'), 'Soweto Ultimate', 'SOW', 'club', 'northern', 'Soweto', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Orange Farm'), 'Orange Farm', 'ORF', 'club', 'northern', 'Johannesburg', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Disks of Hazard'), 'Disks of Hazard', 'DOH', 'club', 'northern', 'Tuks, Pretoria', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Labradors'), 'Labradors', 'LAB', 'club', 'northern', 'Pretoria', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Elevation'), 'Elevation', 'ELV', 'club', 'northern', 'Potchefstroom', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Long Donkeys'), 'Long Donkeys', 'LDK', 'club', 'kzn', 'Pietermaritzburg', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Bunnies'), 'Bunnies', 'BNS', 'club', 'kzn', 'Durban', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', '4th Prime'), '4th Prime', '4PR', 'club', 'kzn', 'Howick', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Rambs'), 'Rambs', 'RMB', 'club', 'kzn', 'KwaZulu-Natal', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Gale Force'), 'Gale Force', 'GLF', 'club', 'eastern-cape', 'Gqeberha', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Hammerheads'), 'Hammerheads', 'HMH', 'club', 'eastern-cape', 'East London', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('team', 'Rebels'), 'Rebels', 'RBL', 'club', 'eastern-cape', 'East London', null, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z');

insert into venue (id, name, city, latitude, longitude, created_at, updated_at) values
  (seed_id('venue', 'Plumstead 1'), 'Plumstead 1', 'Cape Town', -34.026253, 18.4741681, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('venue', 'Plumstead 2'), 'Plumstead 2', 'Cape Town', -34.0265125, 18.4735879, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('venue', 'Wynberg 1'), 'Wynberg 1', 'Cape Town', -34.0091386693607, 18.4604537531774, '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z');

insert into calendar_entry (id, name, kind, level, region, location, start_date, end_date, month_hint, status, notes, created_at, updated_at) values
  (seed_id('calendar', 'Mixed Western Regionals 2026'), 'Mixed Western Regionals 2026', 'tournament', 'regional', 'western', 'Cape Town', '2026-10-02', '2026-10-04', null, 'confirmed', 'Qualifier for Mixed Nationals.', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'Cape Town Mixed League 2026'), 'Cape Town Mixed League 2026', 'league', 'league', 'western', 'Cape Town', '2026-08-22', '2026-11-02', null, 'confirmed', '', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'Gauteng Mixed League 2026'), 'Gauteng Mixed League 2026', 'league', 'league', 'northern', 'Gauteng', '2026-08-31', '2026-11-29', null, 'confirmed', '', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'Mixed Nationals 2026'), 'Mixed Nationals 2026', 'tournament', 'national', 'kzn', 'KwaZulu-Natal', '2026-12-04', '2026-12-06', null, 'confirmed', 'The flagship mixed-division championship.', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'Rocktober'), 'Rocktober', 'tournament', 'social', 'northern', 'Gauteng', null, null, 'October', 'tbc', 'Often the biggest tournament of the year — high-intensity but social, and a draw for international teams.', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'Swinburne Hat'), 'Swinburne Hat', 'tournament', 'social', null, 'Near Harrismith', null, null, 'February', 'tbc', 'A relaxed hat weekend where you are drafted onto a random team. A great first tournament.', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'Regionals (all regions)'), 'Regionals (all regions)', 'tournament', 'regional', null, null, null, null, 'Before Nationals', 'tbc', 'Northern, Western, KZN and Eastern Cape qualifiers.', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'Open & Women’s Nationals'), 'Open & Women’s Nationals', 'tournament', 'national', null, null, null, null, 'Second half of the year', 'tbc', 'Single-gender national championships.', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'Inter-University Tournament'), 'Inter-University Tournament', 'tournament', 'national', null, null, null, null, 'TBC', 'tbc', 'Student-only competition for university teams.', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'U24 Inter-Regional Tournament'), 'U24 Inter-Regional Tournament', 'tournament', 'national', null, null, null, null, 'TBC', 'tbc', 'Regional sides compete to shape national-team selection.', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z'),
  (seed_id('calendar', 'All-Africa Club Championships'), 'All-Africa Club Championships', 'tournament', 'international', null, null, null, null, 'TBC', 'tbc', 'The WFDF-sanctioned continental club event.', '2026-10-22T00:00:00.000Z', '2026-10-22T00:00:00.000Z');
