# HQ Operations

Internal operating system for HQ's private-events business. It keeps the journey from enquiry to closeout in one place: who owns it, what happens next, whether a space is free, what was quoted, what was paid, and what the event still needs.

## Run it locally

```bash
cp .env.example .env.local
npm run dev:local
```

`dev:local` starts an in-memory MongoDB replica set, seeds it when the database is empty, and starts Next.js. Sign in as `wanjiku@hq.local` with `ChangeMe-HQ-2026` (or `SEED_PASSWORD`).

Other development accounts, same password: `amina@hq.local` (leadership), `david@hq.local` (operations), `brian@hq.local` (event staff), `faith@hq.local` (finance), `samuel@hq.local` (administrator).

To use your own MongoDB, set `MONGODB_URI` to a replica set and run `npm run seed`, then `npm run dev`. Transactions need a replica set. A standalone server still runs, but multi-document updates are no longer atomic.

## Checks

```bash
npx tsc --noEmit
npm run lint
npm test
```

## Money and rules

Amounts are integer cents. Deposit percentage, hold length, quote validity, tax, payment methods, spaces, services and automation offsets are settings. The application does not assume 30% or 50%. The seed stores a 40% deposit rule as data so the demo has a working commercial policy.

Event contribution is agreed revenue minus direct costs. It is not company profit.
