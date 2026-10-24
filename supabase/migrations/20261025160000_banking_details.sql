-- Club and team banking details, so players can find and share them when fees are due.
alter table team add column banking_details text check (char_length(banking_details) <= 1000);
alter table club add column banking_details text check (char_length(banking_details) <= 1000);
