# Gmail Central: regression evidence

Run `npm ci --ignore-scripts`, `npm test`, `npx playwright install chromium`, then `npm run test:browser` in this directory.

The suite executes the actual Edge handler with isolated Gmail/Storage/Auth fixtures, signed local OIDC JWTs and PostgreSQL (PGlite). It validates private originals, three attachments, strict correspondence, repeated sources, XML variants, invalid entities, OAuth revocation, expired history, watch renewal, push replay/order and authorization. The browser verifies a single dossier row, filters, three documents, functional queue actions, explicit errors, escaped untrusted filenames and financial read-only access.

`fixtures.mjs` is a minimal unsigned fixture based on reviewed CIPLAN fields. Original PDFs/XML, credentials and tokens are deliberately absent. The real three originals were separately extracted and checked locally; this fixture is not a substitute for live Google/Supabase homologation.

The migration is additive and service-role only. It does not write fiscal entries, accounts payable, payments, existing loads or stock. The new dossier status remains pending review; SEFAZ, XML signature, negotiated conditions, bank beneficiary and order/load linkage remain required. Apply/deploy only after explicit production approval. Existing v1 history remains visible for reprocessing.
