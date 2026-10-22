CREATE INDEX IF NOT EXISTS members_joined_ledger_address_idx ON members (joined_ledger DESC NULLS LAST, address DESC);
