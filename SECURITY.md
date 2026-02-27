# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

**Email:** 64996768+mcp-tool-shop@users.noreply.github.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

**Response timeline:**
- Acknowledgment: within 48 hours
- Assessment: within 7 days
- Fix (if confirmed): within 30 days

## Scope

Clearance Opinion Engine is a **deterministic CLI tool** for name availability and clearance opinions.
- **Data accessed:** Queries public APIs (GitHub, npm, PyPI, RDAP, crates.io, Docker Hub, Hugging Face) for namespace availability. Reads/writes JSON reports, corpus files, and cache to local filesystem. All network requests are read-only GET requests to public endpoints.
- **Data NOT accessed:** No telemetry. No credential storage. API tokens (e.g., GITHUB_TOKEN) are used for rate-limit elevation only and never appear in output — evidence redaction strips tokens before writing.
- **Permissions required:** Network access for public API queries. File system read/write for reports, cache, and corpus files. Optional GITHUB_TOKEN env var for elevated rate limits.
