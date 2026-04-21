# Security Review Prompt

Use this prompt to request a security review of any module.
The agent will consult brain.json before making any changes.

---

## How to use

Copy and paste the block below into Antigravity chat, replacing the bracketed values:

---

```
Using the brain.json context, perform a security review of [MODULE NAME].

Before making any changes:
1. List all nodes that depend on this module
2. Identify which contracts must be preserved
3. Present your full execution plan and wait for my approval

Focus areas:
- [ ] Input validation and sanitization
- [ ] Authentication and authorization
- [ ] Sensitive data storage (tokens, keys, PII)
- [ ] API calls and external dependencies
- [ ] Error handling (no sensitive data in logs/errors)
- [ ] Dependency versions (known CVEs)

After the review, update brain.json automatically.
```

---

## Example (Flutter auth module)

```
Using the brain.json context, perform a security review of AuthRepository.

Before making any changes:
1. List all nodes that depend on AuthRepository
2. Identify which contracts must be preserved
3. Present your full execution plan and wait for my approval

Focus areas:
- [ ] Token storage (is it encrypted?)
- [ ] Session expiration
- [ ] Biometric auth fallback
- [ ] API key exposure in logs
```
