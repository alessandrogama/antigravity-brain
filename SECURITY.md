# Security Policy

## Supported versions

| Version | Support |
|---------|---------|
| 2.x     | ✅ Active |
| < 2.0   | ❌ No support |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Email: `security@[your-domain]` with:
1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (optional)

Response within 48 hours.

## Best practices

- Never commit `brain.json` — it contains your project structure
- Never commit `GEMINI_API_KEY` — use environment variables
- Keep `.gitignore` as provided
- Revoke and regenerate your API key if you suspect exposure

## What this project does NOT do

- Does not send your source files to any server — only metadata (file names and imports)
- Does not store your API key on disk
- Makes no network requests except to the Gemini API (Google AI Studio)
