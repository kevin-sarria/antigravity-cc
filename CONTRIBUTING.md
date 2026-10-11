# Contributing to Antigravity CC (`agy-cc`)

Thank you for your interest in contributing to **Antigravity CC**! We welcome bug reports, feature requests, documentation improvements, and pull requests.

---

## Code of Conduct

Please maintain a polite, welcoming, and constructive environment for all contributors.

---

## Development Setup

1. **Prerequisites:**
   - Node.js >= 18.0.0
   - Git
   - Google Antigravity CLI (`agy`), Gemini CLI (`@google/gemini-cli`), or Codex CLI

2. **Clone & Setup:**
   ```bash
   git clone https://github.com/your-username/antigravity-cc.git
   cd antigravity-cc
   npm install
   ```

3. **Run the Test Suite:**
   ```bash
   npm test
   ```

4. **Run the Security & Credential Audit:**
   ```bash
   npm run check-security
   ```

---

## Core Principles

- **Zero Runtime Dependencies:** The core wrapper (`bin/agy-wrapper.mjs`) must rely strictly on Node.js standard libraries (`node:child_process`, `node:process`, `node:fs`, etc.). Do not add third-party runtime npm packages unless explicitly approved.
- **Context Shielding:** Sub-agent tasks should produce concise, structured summaries rather than dumping raw full files into stdout.
- **Security & Privacy First:**
  - Never commit real API keys, tokens, credentials, or private file paths.
  - All test files and example templates must use dummy placeholders.
  - Every pull request must pass `npm run check-security`.
- **Cross-Platform Compatibility:** Features must work across Linux, macOS, and Windows.

---

## Submitting Pull Requests

1. Fork the repo and create a topic branch from `master` (`git checkout -b feat/my-improvement`).
2. Implement your changes with clean, readable code and comments where appropriate.
3. Add unit/functional tests under `tests/` covering new behaviors.
4. Run `npm test` and ensure all tests pass (0 failures).
5. Commit using descriptive commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
6. Push to your fork and submit a Pull Request.

---

## Questions and Support

If you encounter an issue or have a question, feel free to open an Issue on GitHub.
