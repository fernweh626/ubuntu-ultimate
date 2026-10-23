-- Hats paid by EFT: bank details, and where to send proof of payment (email or WhatsApp number).
alter table event add column eft_details text;
alter table event add column pop_contact text;
