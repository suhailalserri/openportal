# Security

## Reporting a vulnerability

Do not open a public issue. Email the address in the project owner's GitHub profile with "SECURITY" in the subject, or use GitHub's private vulnerability reporting (repo > Security > Report a vulnerability) if it is enabled. Include steps to reproduce and the affected URL. Please give us a reasonable time to fix before disclosing.

## Secrets

- Never commit real values. `.env.example` holds placeholders only; real values live in the Vercel, Render and GitHub dashboards.
- If a secret is exposed, rotate it immediately using `docs/runbooks/secret-rotation.md`. Removing a commit does not un-leak a secret.

## Hardening

The api's headers, CORS, body limits, input bounds, admin 2FA gate, `/metrics` token, log hygiene and CI audit are described, with owner steps and break-glass procedures, in `docs/runbooks/SECURITY_SWEEP.md`.
