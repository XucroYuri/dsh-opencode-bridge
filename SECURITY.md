# Security

## Reporting a Vulnerability

If you find a security issue, please open a private security advisory on GitHub or contact the maintainer directly.

## Secret Handling

- Never commit real API keys or OAuth tokens.
- DSH plugins must store secrets through `ctx.credentials`, not in `settings.yaml`.
- Keep `~/.dsh/.credentials.yaml` permissions at `0600`.
