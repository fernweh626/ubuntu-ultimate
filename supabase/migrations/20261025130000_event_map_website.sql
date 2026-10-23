-- Events (hats first) can point at a Google Maps link and a website.
alter table event add column map_url text check (char_length(map_url) <= 1000);
alter table event add column website text check (char_length(website) <= 500);
