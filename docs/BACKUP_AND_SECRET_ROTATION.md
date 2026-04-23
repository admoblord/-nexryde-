# Backup and Secret Rotation

## MongoDB Backup Policy

- Frequency:
  - full backup daily.
  - incremental/oplog backup every 15 minutes.
- Retention:
  - daily backups: 30 days.
  - weekly backups: 12 weeks.
  - monthly backups: 12 months.
- Encryption:
  - backups encrypted at rest and in transit.
- Restore drill:
  - run monthly restore test into isolated environment and verify API health.

## Recovery Targets

- `RPO`: 15 minutes.
- `RTO`: 60 minutes for core rider/driver/payment APIs.

## Secret Rotation Cadence

- Rotate every 90 days:
  - `JWT_SECRET`
  - `SQUAD_SECRET_KEY`, `SQUAD_WEBHOOK_SECRET`
  - `PAYSTACK_SECRET_KEY`
  - SMTP credentials
- Emergency rotation within 1 hour after leak suspicion.

## Rotation Procedure

- Create new secret in secret manager.
- Deploy canary with new secret and run smoke tests.
- Promote rollout to 100%.
- Revoke old secret after validation window.
- Log rotation timestamp, owner, and affected services.

## Required Env Validation Before Deploy

- auth: `JWT_SECRET`
- squad: `SQUAD_SECRET_KEY`, `SQUAD_WEBHOOK_SECRET`
- sms: `TERMII_API_KEY`
- email otp: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`
- ops: `NEXRYDE_OPS_KEY`

## Post-Rotation Verification

- Auth login and protected-route checks.
- Wallet topup init + verify.
- Webhook signature validation.
- OTP (SMS/email) delivery.
