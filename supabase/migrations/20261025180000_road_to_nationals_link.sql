-- SAFDA's Road to Nationals document, alongside the other national rules links (same id the phones use).
insert into org_link (id, region_code, kind, label, url, sort, created_at, updated_at)
values (seed_id('link', 'https://docs.google.com/document/d/1sqGRiItAwXSNKzZOwN4yZy7I7M6ad1Y0newAAg9oRwg/edit'), null, 'rules', 'SAFDA Road to Nationals',
        'https://docs.google.com/document/d/1sqGRiItAwXSNKzZOwN4yZy7I7M6ad1Y0newAAg9oRwg/edit', 1000,
        to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
on conflict (id) do nothing;
