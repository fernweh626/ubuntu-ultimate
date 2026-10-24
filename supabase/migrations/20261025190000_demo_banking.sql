-- Made-up banking details on teams that have none, so the banking card can be seen and shared until
-- clubs add their real details (same text the phones use).
update team set banking_details =
  'Bank: Demo Bank (made-up details)' || chr(10) || 'Account name: ' || name || chr(10) ||
  'Account number: 0000 0000 00' || chr(10) || 'Branch code: 000000' || chr(10) || 'Reference: your name + FEES'
where banking_details is null and deleted_at is null and kind in ('club','university','school','regional','national');
