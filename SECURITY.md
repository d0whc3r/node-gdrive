# Security Policy

## Supported Versions

Security fixes are applied to the latest release on the `master` branch.

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public GitHub issue.

Instead, report it privately via [GitHub Security Advisories](https://github.com/d0whc3r/node-gdrive/security/advisories/new) or email `d0whc3r@gmail.com` with:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof of concept.
- Any suggested fix or mitigation.

## Security Best Practices for Users

- Keep OAuth `credentials.json`, `token.json`, and Service Account JSON files restricted to `0600` permissions and never commit them to version control.
- Prefer **Service Accounts** or **Application Default Credentials (ADC)** over interactive OAuth tokens for servers and CI/CD.
- Use `--encrypt` (`BACKUP_ENCRYPTION_KEY`) when storing sensitive database dumps or archives in Google Drive.
- Always preview destructive retention rules (`-d`) with `--dry-run` and protect recent backups with `--keep-last`.
