# Antigravity Plugin for Claude Code (`agy-cc`)

[![License: Community Open Source](https://img.shields.io/badge/License-Community%20Open%20Source%20(Non--Commercial)-orange.svg)](LICENSE)
[![Author: Kevin Sarria](https://img.shields.io/badge/Author-Kevin%20Sarria-blue.svg)](#intellectual-property--license)
[![Generated with: AI](https://img.shields.io/badge/Built%20with-AI%20Assistance-purple.svg)](#intellectual-property--license)
[![Node: >=18](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org/)
[![Multi-Agent](https://img.shields.io/badge/Architecture-Dual--Agent%20Pairing-blue.svg)](#architecture)
[![Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(Pure%20Node)-success.svg)](package.json)
[![Security: Audited](https://img.shields.io/badge/Security-Credential%20Clean-brightgreen.svg)](#security--privacy)

> **Harmonious multi-agent pairing:** Connect **Claude Code** with **Google Antigravity CLI (`agy`)**, **Gemini**, and **Codex** as deep execution sub-agents.
>
> **Author & Intellectual Property:** Conceived, architected, and owned by **Kevin Sarria**. Generated with AI assistance. Open source by and for the community (**Strictly Non-Commercial / Not for Sale**).

Claude Code leads project direction, interactive architecture decisions, and high-level reasoning. Meanwhile, Antigravity acts as a dedicated worker sub-agent executing independent code reviews, massive scaffolding, and adversarial stress-testing directly against your local filesystem—**shielding Claude's context window from token exhaustion**.

---

## Table of Contents

- [Why agy-cc?](#why-agy-cc)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [Authentication Setup (Google AI Pro vs API Key)](#authentication-setup-google-ai-pro-vs-api-key)
  - [1. Install as Claude Code Plugin](#1-install-as-claude-code-plugin)
  - [2. Run as Standalone CLI](#2-run-as-standalone-cli)
- [Command Reference](#command-reference)
  - [1. `/antigravity:task <prompt>`](#1-antigravitytask-prompt)
  - [2. `/antigravity:review`](#2-antigravityreview)
  - [3. `/antigravity:delegate <task>`](#3-antigravitydelegatetask)
  - [4. `/antigravity:challenge <hypothesis>`](#4-antigravitychallengehypothesis)
  - [5. `/antigravity:status`](#5-antigravitystatus)
  - [6. `/antigravity:test`](#6-antigravitytest)
- [Dual-Agent Round-Trip Workflow](#dual-agent-round-trip-workflow-the-ping-pong-pattern)
- [Engine & Model Configuration](#engine--model-configuration)
- [Troubleshooting & Diagnostics](#troubleshooting--diagnostics)
- [Platform Specific Notes](#platform-specific-notes)
- [Security & Privacy Guarantee](#security--privacy-guarantee)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Repository Structure](#repository-structure)
- [Contributing](#contributing)
- [Intellectual Property & License](#intellectual-property--license)

---

## Why agy-cc?

Pairing two frontier AI models in a single development session creates a balanced, self-correcting workflow:

1. **Context Shielding:** Claude's context window remains lean. Delegated tasks (generating 30 DTOs, hundreds of test cases, boilerplate migrations) run in an isolated worker process. Claude only receives a structured executive digest.
2. **Unbiased Cross-Model Audits:** Claude writes code, and Gemini/Antigravity audits the local git diff with zero confirmation bias, catching edge cases, race conditions, and OWASP vulnerabilities.
3. **Adversarial Architecture Critique:** Before committing to a risky design choice or library, submit your proposal to an independent skeptical AI architect for stress-testing.
4. **Universal Backend Support:** Works out of the box with Google Antigravity (`agy`), Google Gemini CLI (`@google/gemini-cli`), and OpenAI Codex (`codex`).
5. **Zero External Dependencies:** Built entirely with Node.js standard libraries (`node:child_process`, `node:process`, `node:test`). No supply-chain bloat or vulnerable third-party dependencies.

---

## Architecture

```
+-------------------------------------------------------------+
|                        CLAUDE CODE                          |
|  - High-level orchestrator & interactive session director   |
|  - Architectural design & project coordination              |
+-------------------------------------------------------------+
                               |
        /antigravity:review    |    /antigravity:delegate
        /antigravity:challenge |
                               v
+-------------------------------------------------------------+
|                     ANTIGRAVITY-CC                          |
|  - CLI Bridge & Sanitizer (bin/agy-wrapper.mjs)             |
|  - Multi-engine resolution (agy / gemini / codex)           |
|  - Windows/POSIX safe Stdin pipe (no cmd buffer limits)     |
+-------------------------------------------------------------+
                               |
                  spawn(engine, args) via Stdin
                               v
+-------------------------------------------------------------+
|             ANTIGRAVITY CLI / GEMINI / CODEX                |
|  - Local Git Diff inspection                                |
|  - Scaffolding / Test suite generation                      |
|  - Generates concise executive summary (Digest)             |
+-------------------------------------------------------------+
```

---

## Prerequisites

Before using `antigravity-cc`, ensure you have:

- **Node.js >= 18.0.0** (`node --version`)
- **Claude Code** installed (`npm install -g @anthropic-ai/claude-code`)
- **Git** installed and initialized in your workspace (`git --version`)
- At least **one supported backend engine**:
  - **Google Antigravity CLI (`agy`)**: Official Antigravity binary in `$PATH`.
  - **Google Gemini CLI (`gemini`)**: Global npm package (`npm install -g @google/gemini-cli`).
  - **OpenAI Codex CLI (`codex`)**: If using the optional Codex engine.

---

## Quick Start

### Authentication Setup (Google AI Pro vs API Key)

`antigravity-cc` is designed to seamlessly utilize your **Google AI Pro / Gemini Advanced** personal account quota, avoiding the restrictive 20 requests/day limit imposed on free API keys.

#### Option A: Google Account Login (Recommended for Google AI Pro)

When you authenticate with your personal Google account, the Gemini CLI leverages your AI Pro plan:

1. **Sign in interactively:**
   Open a terminal and run the Gemini CLI:
   ```bash
   gemini
   ```
   Select **Login with Google** (or type `/auth` inside the interactive session). Follow the browser prompt to log in with your personal Google account. Your session credentials are saved securely in `~/.gemini/oauth_creds.json`.

2. **Check for conflicting system environment variables:**
   If `GEMINI_API_KEY` or `GOOGLE_API_KEY` is present in your system or user environment variables, the Gemini CLI will prioritize that API key and fall back to the free tier (causing `429 Quota Exceeded` errors).

   Verify and clear them if present:

   **On Windows (PowerShell):**
   ```powershell
   # Check if variables are set:
   echo $env:GEMINI_API_KEY
   echo $env:GOOGLE_API_KEY

   # If either prints a value, remove them from persistent user environment:
   [System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', $null, 'User')
   [System.Environment]::SetEnvironmentVariable('GOOGLE_API_KEY', $null, 'User')
   ```
   *(Restart your terminal window after clearing variables).*

   **On macOS / Linux:**
   ```bash
   unset GEMINI_API_KEY
   unset GOOGLE_API_KEY
   ```
   *(Also verify they are not exported in `~/.bashrc`, `~/.zshrc`, or `/etc/environment`).*

3. **Built-in Protection in `agy-wrapper`:**
   By default, `agy-wrapper.mjs` automatically unsets `GEMINI_API_KEY` and `GOOGLE_API_KEY` when spawning worker sub-processes, ensuring your Google AI Pro OAuth session is preferred unless you explicitly request API key mode.

#### Option B: Standalone API Key Mode (Optional)

If you do not have a Google AI Pro subscription and prefer using a standard Google AI Studio API key:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Enable API key mode and set your key:
   ```bash
   AGY_AUTH_MODE=apikey
   GEMINI_API_KEY=your_actual_api_key_here
   ```

> [!NOTE]
> Free-tier API keys are subject to strict daily rate limits (e.g., 20 requests/day on flash models). For heavy dual-agent workflows, Google AI Pro login is recommended.

### 1. Install as Claude Code Plugin

Clone or download this repository to your preferred tools or plugins directory:

```bash
# Clone the repository
git clone https://github.com/your-username/antigravity-cc.git ~/plugins/antigravity-cc
cd ~/plugins/antigravity-cc

# Verify health and zero credentials
npm test
```

Next, open **Claude Code** in your terminal and register the plugin:

```text
# 1. Register local marketplace source
/plugin marketplace add ~/plugins/antigravity-cc

# (On Windows, use your absolute path, e.g.:)
# /plugin marketplace add C:\Users\<username>\Documents\proyectos\antigravity-cc

# 2. Install the plugin from the marketplace
/plugin install antigravity@antigravity-marketplace
# (or simply: /plugin install antigravity)

# 3. Reload active plugins
/reload-plugins
```

### 2. Run as Standalone CLI

You can also run commands directly from any terminal without Claude Code:

```bash
# Check connectivity and detected backend engine
node bin/agy-wrapper.mjs status

# Run connectivity test
node bin/agy-wrapper.mjs test

# Request code review
node bin/agy-wrapper.mjs review
```

---

## Command Reference

| Command | Description | Engine |
| :--- | :--- | :--- |
| `/antigravity:task <prompt>` | Autonomous round-trip pipeline: Claude plans $\rightarrow$ Gemini builds in disk $\rightarrow$ Claude audits & fixes. | Gemini + Claude Code |
| `/antigravity:review` | Performs an independent audit on local uncommitted git diffs. | Gemini / Antigravity / Codex |
| `/antigravity:delegate <task>` | Offloads repetitive scaffolding, test generation, or refactoring. | Gemini / Antigravity / Codex |
| `/antigravity:challenge <idea>` | Evaluates technical solutions against edge cases and scalability bottlenecks. | Gemini / Antigravity / Codex |
| `/antigravity:status` | Displays active engine status, executable binary, and runtime diagnostic info. | System |
| `/antigravity:test` | Executes a ping smoke test verifying live end-to-end connectivity. | Backend |

---

### 1. `/antigravity:task <feature-description>`

Orchestrates the entire **Round-Trip Dual-Agent cycle** in a single command. 

```text
/antigravity:task "Create a bulk email module with CSV/Excel recipient upload, rich-text editor, and role permissions"
```

**How it works under the hood:**
1. **Claude Code** structures the technical blueprint, interface contracts, and validation rules.
2. **Gemini / Antigravity** writes the files directly to your disk, creates automated tests, and returns a concise digest.
3. **Claude Code** receives a handoff signal, inspects the created files, runs your test suite (`npm test`), fixes any edge cases or type mismatches, and presents the final verified result.

---

### 2. `/antigravity:review`

Audits your local changes (`git diff HEAD`, staged changes, or untracked modifications) before committing.

```text
/antigravity:review
```

**Output structure:**
- **Security & Injection Risks:** OWASP Top 10, input sanitation, missing authorization checks.
- **Logic, Bugs & Concurrency:** Race conditions, unhandled null pointers, memory leaks.
- **Performance & Best Practices:** N+1 queries, synchronous blocking operations, indexing.
- **Verdict:** Explicit `APPROVED` or `NEEDS ATTENTION` summary.

---

### 3. `/antigravity:delegate <task>`

Instructs the sub-agent to execute heavy local modifications without eating up Claude's token window.

```text
/antigravity:delegate Create unit test suite using Vitest for src/auth/tokenValidator.ts
```

**Returned Digest:**
- Files created / modified
- Summary of changes implemented
- Test execution output
- Pending warnings or manual follow-ups

---

### 4. `/antigravity:challenge <hypothesis>`

Acts as a skeptical senior software architect, stress-testing decisions and spotting architectural blind spots.

```text
/antigravity:challenge Is SQLite in WAL mode suitable for handling 100 concurrent writer workers in Node.js?
```

**Critique report includes:**
- Unforeseen failure conditions & edge cases
- Hardware, I/O, network, or concurrency bottlenecks
- Superior architectural alternatives with trade-offs
- Pragmatic bottom-line recommendation

---

### 5. `/antigravity:status`

Quickly inspect your runtime configuration:

```text
/antigravity:status
```

```text
======================================================
  ESTADO DE INTEGRACIÓN ANTIGRAVITY-CC (v1.0.0)
======================================================
✔ Binario en uso : agy
✔ Tipo de motor  : antigravity
✔ Plataforma     : win32 (x64)
✔ Node.js        : v22.14.0
======================================================
```

---

### 6. `/antigravity:test`

Validates that your CLI backend is connected, authenticated, and answering prompts in headless mode.

```text
/antigravity:test
```

---

## Dual-Agent Round-Trip Workflow (The "Ping-Pong" Pattern)

One of the most powerful workflows enabled by `antigravity-cc` is the **Architect $\rightarrow$ Builder $\rightarrow$ Auditor** round-trip:

```
[User Request]
       |
       v
1. CLAUDE (Architect)
   - Breaks down task into strict specifications, contracts & file paths.
       |
       v  (/antigravity:delegate <specification>)
2. GEMINI / ANTIGRAVITY (Builder)
   - Writes all files, models, boilerplate & tests directly on disk.
   - Returns a concise digest (files modified, test results).
       |
       v  (Digest returned to Claude)
3. CLAUDE (Auditor & Refiner)
   - Reads modified files, executes local test suite (`npm test`, `pytest`, etc.).
   - Refines edge cases, fixes any compiler/linter warnings.
       |
       v
[Complete, Verified Codebase]
```

### The "All-in-One" Prompt Template

You can trigger this entire automated pipeline in a single instruction inside Claude Code. Just paste this:

> *"Claude, plan and architect the full implementation for **[describe your feature here]** (interfaces, folder structure, validation rules). Once your specification is ready, use `/antigravity:delegate` to have Gemini generate all files and implementations on disk. When Gemini returns, inspect the generated code, run our test suite, and apply any necessary fixes or polish."*

### Automating via `CLAUDE.md`

To make this the default behavior in any repository, add the following snippet to your project's `CLAUDE.md`:

```markdown
## Sub-Agent Delegation Rules
When asked to implement new modules or large features:
1. First produce a concise implementation plan with interfaces and contracts.
2. Delegate the heavy file creation and boilerplate to Gemini via `/antigravity:delegate "<plan>"`.
3. Inspect Gemini's generated files and run tests.
4. Apply any required fixes and show the final summary.
```

---

## Engine & Model Configuration

`antigravity-cc` auto-detects your backend environment with the following priority order:

1. `AGY_BIN` environment variable (if explicitly set)
2. `agy` binary in `$PATH`
3. `gemini` CLI binary in `$PATH` (with automatic headless workspace trust)
4. `codex` binary in `$PATH` (when Codex engine is selected)

### Custom Configuration (`.env`)

You can create a `.env` file based on `.env.example`:

```bash
# Custom path to executable binary
AGY_BIN=/usr/local/bin/agy

# Select engine: 'antigravity' (default) or 'codex'
AGY_ENGINE=antigravity

# Select specific model (e.g. gemini-2.5-pro, gemini-2.5-flash)
AGY_MODEL=gemini-2.5-pro

# Path to Codex binary if using Codex engine
CODEX_BIN=codex
```

### CLI Override Flags

You can also override settings dynamically per command:

```bash
node bin/agy-wrapper.mjs challenge "Should we migrate to Kafka?" --engine codex
```

---

## Troubleshooting & Diagnostics

Whenever you need to inspect connectivity, backend engine detection, or authentication state, use the built-in diagnostic tools:

```bash
# Display detected binary, engine type, and active auth method
node bin/agy-wrapper.mjs status

# Run live end-to-end smoke test
node bin/agy-wrapper.mjs test
```

### 1. `429 - Quota exceeded for metric: generate_content_free_tier_requests`

- **Symptom:** Running tests or commands fails with HTTP 429 and references `generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash`.
- **Root Cause:** A free-tier Google AI Studio API key is being picked up instead of your personal Google account with Google AI Pro / Gemini Advanced.
- **Resolution:**
  1. Run `node bin/agy-wrapper.mjs status` to inspect active auth.
  2. If an API key is detected, check your system environment variables in Windows PowerShell:
     ```powershell
     echo $env:GEMINI_API_KEY
     echo $env:GOOGLE_API_KEY
     ```
  3. Clear them from user environment variables:
     ```powershell
     [System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', $null, 'User')
     [System.Environment]::SetEnvironmentVariable('GOOGLE_API_KEY', $null, 'User')
     ```
  4. Ensure your `.env` does not contain `AGY_AUTH_MODE=apikey`.
  5. Restart your terminal, run `gemini` in terminal, and choose **Login with Google**.
  6. Re-test with `node bin/agy-wrapper.mjs test`.

### 2. `IneligibleTierError` / `UNSUPPORTED_CLIENT`

- **Symptom:** Sub-agent throws an auth exception mentioning ineligible tier or client mismatch.
- **Root Cause:** The OAuth token cached in `~/.gemini/oauth_creds.json` is stale, was issued under an older client version, or needs re-authorization.
- **Resolution:**
  1. Open a regular terminal window.
  2. Run `gemini` interactively.
  3. Type `/auth` (or select "Sign in with Google").
  4. Follow the browser prompt to re-authenticate with your primary Google account.
  5. Once completed, `node bin/agy-wrapper.mjs test` will report `PONG: Sub-agent live and answering`.

### 3. Windows `cmd.exe` Command-Line Length Limit (8,191 characters)

- **Symptom:** Large git diffs fail or truncate when executed via standard shell arguments on Windows.
- **Resolution:** `antigravity-cc` solves this natively. `agy-wrapper.mjs` feeds prompts and diffs directly via standard input (`stdin`) streaming, bypassing Windows `cmd.exe` character limits entirely.

### 4. Engine Not Found (`agy` or `gemini` command missing)

- **Symptom:** Wrapper reports: `ERROR: No valid engine binary found`.
- **Resolution:**
  1. Install Gemini CLI globally:
     ```bash
     npm install -g @google/gemini-cli
     ```
  2. Alternatively, specify the explicit binary location in `.env`:
     ```bash
     AGY_BIN=C:\Users\<username>\AppData\Roaming\npm\gemini.cmd
     ```

---

## Platform Specific Notes

### Windows
- **Command-line safety:** Uses a dedicated direct Stdin streaming pipe to bypass Windows `cmd.exe` 8,191-character command line buffer limits. Diff files of arbitrary size are safely piped.
- **NPM Shims:** If you have `@google/gemini-cli` installed, you can create `agy.cmd` and `agy.ps1` shims in `%APPDATA%\npm\` to allow invoking `agy` directly from PowerShell and CMD.

### macOS & Linux
Ensure executable permissions on the wrapper:
```bash
chmod +x bin/agy-wrapper.mjs
```

---

## Security & Privacy Guarantee

This project is built from the ground up for safe publication to public open-source repositories:

- **Zero Hardcoded Secrets:** No API keys, personal bearer tokens, passwords, or machine-specific usernames are stored in this codebase.
- **Airtight `.gitignore`:** Pre-configured to block `.env`, `.env.*`, OAuth credential dumps, SSL certificates (`.pem`, `.key`), `.claude.json`, logs, and session snapshots.
- **In-flight Sanitization:** The wrapper includes defense-in-depth regex masks that redact detected API key formats (`AIza...`, `sk-ant-...`, `sk-...`, `ghp_...`, Bearer tokens) before outputting logs or handling errors.
- **Local Execution:** Prompts run directly on your machine through your local CLI authentication.

---

## Testing & Quality Assurance

`antigravity-cc` includes a zero-dependency automated test suite leveraging Node's native `node:test` runner.

### Run All Tests
```bash
npm test
```

### Run Dedicated Security Audit
```bash
npm run check-security
```

The security audit recursively scans every file in the project against known secret signatures (Google, Anthropic, OpenAI, GitHub, AWS, JWTs, Private Keys) and validates that `.gitignore` and `.env.example` adhere strictly to privacy guidelines.

---

## Repository Structure

```text
antigravity-cc/
├── .claude-plugin/
│   ├── marketplace.json        # Claude Code local marketplace catalog
│   └── plugin.json             # Plugin metadata manifest
├── commands/                   # Claude Code slash commands
│   ├── task.md                 # /antigravity:task
│   ├── review.md               # /antigravity:review
│   ├── delegate.md             # /antigravity:delegate
│   ├── challenge.md            # /antigravity:challenge
│   ├── status.md               # /antigravity:status
│   └── test.md                 # /antigravity:test
├── .codex-plugin/
│   └── plugin.json             # Manifest for Codex interoperability
├── bin/
│   └── agy-wrapper.mjs         # Multi-engine CLI bridge & orchestrator
├── skills/
│   ├── antigravity-task/       # Autonomous dual-agent round-trip skill
│   ├── antigravity-review/     # Dual-agent code review skill
│   ├── antigravity-delegate/   # Deep task & scaffolding delegation skill
│   └── antigravity-challenge/  # Adversarial architecture review skill
├── tests/
│   ├── wrapper.test.mjs        # Functional CLI and command tests
│   └── security-audit.test.mjs # Automated credential & secret exposure scanner
├── .env.example                # Safe environment template (placeholders only)
├── .gitignore                  # Airtight exclusion rules for git
├── CONTRIBUTING.md             # Guidelines for open-source contributors
├── LICENSE                     # Community Open Source (Non-Commercial) License
├── package.json                # Zero-dependency configuration & test scripts
└── README.md                   # Complete documentation
```

---

## Contributing

Contributions are welcome! Please review [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on code style, testing, and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Verify tests and security audit pass (`npm test`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---

## Intellectual Property & License

**Copyright (c) 2026 Kevin Sarria. All rights reserved.**

- **Intellectual Authorship:** This software, its architecture, and integration wrappers are the intellectual property of **Kevin Sarria**.
- **AI-Assisted Creation:** This plugin was conceived, designed, and generated with the assistance of Artificial Intelligence (Claude Code, Google Antigravity, and Gemini).
- **Open Source for the Community:** Free for personal, academic, educational, community use, study, and modification.
- **Strictly Non-Commercial / No-Resale Clause:** This software is **NOT for sale** and **CANNOT be sold, resold, leased, or commercialized to third parties**. It is open source created by and for the community.

For full terms and legal text, please refer to [`LICENSE`](LICENSE).
