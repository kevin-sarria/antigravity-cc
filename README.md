# Antigravity Plugin for Claude Code (`agy-cc`)

[![License: Community Open Source](https://img.shields.io/badge/License-Community%20Open%20Source%20(Non--Commercial)-orange.svg)](LICENSE)
[![Author: Kevin Sarria](https://img.shields.io/badge/Author-Kevin%20Sarria-blue.svg)](#intellectual-property--license)
[![Generated with: AI](https://img.shields.io/badge/Built%20with-AI%20Assistance-purple.svg)](#intellectual-property--license)
[![Node: >=18](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org/)
[![Multi-Agent](https://img.shields.io/badge/Architecture-Dual--Agent%20Pairing-blue.svg)](#architecture)
[![Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(Pure%20Node)-success.svg)](package.json)
[![Security: Audited](https://img.shields.io/badge/Security-Credential%20Clean-brightgreen.svg)](#security--privacy)

> **Unofficial community plugin** (not affiliated with Google or Anthropic). **Harmonious multi-agent pairing:** Connect **Claude Code** with **Google Antigravity CLI (`agy`)** and **Codex** as deep execution sub-agents.
>
> **Author & Intellectual Property:** Conceived, architected, and owned by **Kevin Sarria**. Generated with AI assistance. Open source by and for the community (**Strictly Non-Commercial / Not for Sale**).

Claude Code leads project direction, interactive architecture decisions, and high-level reasoning. Meanwhile, Antigravity acts as a dedicated worker sub-agent executing independent code reviews, massive scaffolding, and adversarial stress-testing directly against your local filesystem—**shielding Claude's context window from token exhaustion**.

---

## Table of Contents

- [Why agy-cc?](#why-agy-cc)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [Authentication (Google AI Pro)](#authentication-google-ai-pro)
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
2. **Unbiased Cross-Model Audits:** Claude writes code, and Antigravity audits the local git diff with zero confirmation bias, catching edge cases, race conditions, and OWASP vulnerabilities.
3. **Adversarial Architecture Critique:** Before committing to a risky design choice or library, submit your proposal to an independent skeptical AI architect for stress-testing.
4. **Universal Backend Support:** Works with Google Antigravity CLI (`agy`, default), OpenAI Codex (`codex`), and legacy Gemini CLI for enterprise accounts.
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
|  - Multi-engine resolution (agy / codex / legacy gemini)    |
|  - Windows/POSIX safe Stdin pipe (no cmd buffer limits)     |
+-------------------------------------------------------------+
                               |
                  spawn(engine, args) via Stdin
                               v
+-------------------------------------------------------------+
|                  ANTIGRAVITY CLI / CODEX                    |
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
- **Google Antigravity CLI (`agy`)**, the official successor of Gemini CLI:
  ```powershell
  # Windows
  winget install Google.AntigravityCLI
  # or: irm https://antigravity.google/cli/install.ps1 | iex
  ```
  ```bash
  # macOS / Linux
  curl -fsSL https://antigravity.google/cli/install.sh | bash
  ```
- Optional: **OpenAI Codex CLI (`codex`)** for the Codex engine.

> [!IMPORTANT]
> **Gemini CLI no longer works with personal Google accounts.** Google stopped serving Gemini CLI requests for free, Google AI Pro and Ultra accounts on **June 18, 2026** and replaced it with Antigravity CLI. With a personal account, Gemini CLI fails with `IneligibleTierError ... UNSUPPORTED_CLIENT ... migrate to the Antigravity suite`. `antigravity-cc` therefore uses `agy` by default and keeps Gemini CLI only as a legacy engine for Standard/Enterprise accounts (`AGY_ENGINE=gemini`).
>
> If you previously created an `agy` alias that just runs `gemini` (`agy.cmd` / `agy.ps1` in `%APPDATA%\npm`), remove or rename it: it shadows the real `agy`. The wrapper ignores such aliases on its own: it checks `agy --help` for Antigravity-only flags.

---

## Quick Start

### Authentication (Google AI Pro)

Antigravity CLI uses your Google account, the same one you use in the Antigravity app. If you already use Antigravity on this machine, `agy` is usually signed in already. Check it with:

```text
/antigravity:test
```

If it isn't signed in, run `/antigravity:login`. Claude Code's Bash tool is not interactive, so this opens a **new console window** running `agy`. Follow the sign-in link there with **the account that holds the Google AI Pro subscription**, close the window, and run `/antigravity:test` again. (Standalone: `node bin/agy-wrapper.mjs login`.)

By default the wrapper removes `GEMINI_API_KEY` / `GOOGLE_API_KEY` from the sub-agent environment, so a stray free-tier API key never replaces your account session. Set `AGY_AUTH_MODE=apikey` only if you really want to pass those keys through.

### 1. Install as Claude Code Plugin

Clone or download this repository to your preferred tools or plugins directory:

```bash
# Clone the repository
git clone https://github.com/kevin-sarria/antigravity-cc.git ~/plugins/antigravity-cc
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

| Command | Description | Sub-agent permissions |
| :--- | :--- | :--- |
| `/antigravity:task <prompt>` | Autonomous round-trip pipeline: Claude plans $\rightarrow$ Antigravity builds on disk $\rightarrow$ Claude audits & fixes. | Read + edit files |
| `/antigravity:review [focus]` | Performs an independent audit on local uncommitted changes (diff + untracked files). | Read-only |
| `/antigravity:delegate <task>` | Offloads repetitive scaffolding, test generation, or refactoring. | Read + edit files |
| `/antigravity:challenge <idea>` | Evaluates technical solutions against edge cases and scalability bottlenecks. | Read-only |
| `/antigravity:login` | Opens a console window running `agy` so you can sign in with your Google AI Pro account. | — |
| `/antigravity:status` | Displays active engine, CLI version, binary path, permissions and timeout. | — |
| `/antigravity:test` | Executes a smoke test verifying live end-to-end connectivity and auth. | Read-only |

> [!IMPORTANT]
> In headless mode, `agy` auto-denies every tool that needs permission **and ends the turn without an answer**. The wrapper handles it like this:
> - `review`, `challenge` and `test` run in the default mode: the agent can read files inside the project, but not write or run commands.
> - `delegate` and `task` run with `--mode accept-edits`: the agent can also create and edit files, but not run shell commands, so Claude runs the tests afterwards.
> - Every prompt starts with tool rules (no terminal commands, stay inside the project folder), so the agent doesn't trip over a denied tool.
> - If a turn still ends because of a denied tool, the wrapper reports `DENIED: ...` and names the tool.
>
> Set `AGY_APPROVAL_MODE=yolo` to let `delegate`/`task` run commands too (`--dangerously-skip-permissions`; it approves everything).

Claude Code's Bash tool stops commands after 10 minutes at most. The commands ask Claude for that maximum, and the wrapper stops the sub-agent after `AGY_TIMEOUT_MS` (default 570 s) with a clear error, so split very large tasks.

---

### 1. `/antigravity:task <feature-description>`

Orchestrates the entire **Round-Trip Dual-Agent cycle** in a single command. 

```text
/antigravity:task "Create a bulk email module with CSV/Excel recipient upload, rich-text editor, and role permissions"
```

**How it works under the hood:**
1. **Claude Code** structures the technical blueprint, interface contracts, and validation rules.
2. **Antigravity** writes the files directly to your disk, creates automated tests, and returns a concise digest.
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
  ESTADO DE INTEGRACIÓN ANTIGRAVITY-CC (v1.2.0)
======================================================
✔ Motor            : Antigravity CLI (agy) v1.3.3
✔ Binario          : C:\Users\<you>\AppData\Local\Microsoft\WinGet\Packages\Google.AntigravityCLI_...\agy.exe
✔ Autenticación    : cuenta de Antigravity (sesión gestionada por agy; cámbiala con /antigravity:login)
✔ Modo lectura     : review, challenge, test (escrituras y comandos denegados)
✔ Modo escritura   : delegate, task (--mode accept-edits, sin comandos de shell)
✔ Timeout          : 570 s
✔ Plataforma       : win32 (x64)
✔ Node.js          : v22.14.0
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
2. ANTIGRAVITY (Builder)
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

> *"Claude, plan and architect the full implementation for **[describe your feature here]** (interfaces, folder structure, validation rules). Once your specification is ready, use `/antigravity:delegate` to have Antigravity generate all files and implementations on disk. When Antigravity returns, inspect the generated code, run our test suite, and apply any necessary fixes or polish."*

### Automating via `CLAUDE.md`

To make this the default behavior in any repository, add the following snippet to your project's `CLAUDE.md`:

```markdown
## Sub-Agent Delegation Rules
When asked to implement new modules or large features:
1. First produce a concise implementation plan with interfaces and contracts.
2. Delegate the heavy file creation and boilerplate to Antigravity via `/antigravity:delegate <plan>`.
3. Inspect Antigravity's generated files and run tests.
4. Apply any required fixes and show the final summary.
```

---

## Engine & Model Configuration

`antigravity-cc` auto-detects your backend environment with the following priority order:

1. `AGY_BIN` environment variable, if set. The wrapper checks whether it points to `agy` or to Gemini CLI.
2. With `AGY_ENGINE=codex` / `--engine codex`: `CODEX_BIN` or `codex` in `$PATH`. If it is missing the wrapper fails instead of silently using another engine.
3. The official **Antigravity CLI (`agy`)**, searched in `$PATH` and in its install locations (WinGet package folder, `%LOCALAPPDATA%\agy\bin`, `~/.local/bin`). The install locations matter because an editor started before the install keeps a stale `PATH`. Fake `agy` aliases of `gemini` are skipped.
4. Legacy **Gemini CLI** (`gemini`) as a last resort (or with `AGY_ENGINE=gemini`). It only works with Standard/Enterprise accounts, and `status` warns when it is being used as a fallback.

All prompts (including diffs and your task text) are sent through **stdin**. For `agy` that is a `stream-json` user event (`agy` doesn't read plain stdin), and for Gemini/Codex it is plain text. Command-line arguments are fixed, validated tokens, and `agy.exe` is spawned without a shell. This avoids shell injection and the Windows command-line length limits.

### Configuration variables

These are read from the environment of the process that runs the wrapper (see `.env.example` for the full list):

```bash
AGY_BIN=/home/me/.local/bin/agy   # custom binary (agy or gemini, auto-detected)
AGY_ENGINE=antigravity            # 'antigravity' (default), 'gemini' (legacy, enterprise only) or 'codex'
AGY_MODEL=                        # model override (list them with `agy models`)
AGY_APPROVAL_MODE=auto_edit       # delegate/task: 'auto_edit' (default) or 'yolo' (also shell commands)
AGY_TIMEOUT_MS=570000             # max time per sub-agent run
AGY_DEBUG=1                       # print the raw backend events to stderr
AGY_AUTH_MODE=google              # 'google' (default) or 'apikey' (keeps GEMINI_API_KEY in the sub-agent env)
CODEX_BIN=codex                   # Codex binary when using the Codex engine
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

### 1. `IneligibleTierError` / `UNSUPPORTED_CLIENT` ("migrate to the Antigravity suite")

- **Symptom:** `test` or any command fails with `This client is no longer supported for Gemini Code Assist for individuals`. Logging in again doesn't help.
- **Root Cause:** The wrapper is using the legacy **Gemini CLI**, which Google stopped serving for personal accounts (free, AI Pro and Ultra) on 2026-06-18.
- **Resolution:** Install Antigravity CLI (`winget install Google.AntigravityCLI` on Windows, `curl -fsSL https://antigravity.google/cli/install.sh | bash` on macOS/Linux), then run `/antigravity:status`. It should show `Motor: Antigravity CLI (agy)`. Finish with `/antigravity:test`. If you had an `agy` alias pointing to `gemini`, rename or delete it.

### 2. `DENIED: agy.exe se detuvo sin responder ...`

- **Symptom:** A command fails and names a tool (`RunCommand`, `ViewFile`, `WriteToFile`...).
- **Root Cause:** In headless mode `agy` ends the turn when a tool isn't permitted. Typical causes are a shell command, a write in a read-only command, or a read **outside the project folder** (for example a project the agent remembers from other Antigravity conversations).
- **Resolution:** Run the command from the project root and phrase the task so it doesn't need shell commands. For `delegate`/`task`, `AGY_APPROVAL_MODE=yolo` approves everything, including commands. Use `AGY_DEBUG=1` to see the exact tool call and path.

### 3. `429` / quota exceeded

- **Root Cause:** The account hit its usage limits, or a free API key is being used (`AGY_AUTH_MODE=apikey`).
- **Resolution:** Remove `AGY_AUTH_MODE=apikey` so your Google AI Pro session is used. Otherwise wait for the quota to reset or pick another model (`agy models`, `AGY_MODEL=...`).

### 4. `TIMEOUT: ...`

- **Root Cause:** The sub-agent ran longer than `AGY_TIMEOUT_MS` (default 570 s). Claude Code's Bash tool can't wait more than 10 minutes.
- **Resolution:** Split the task into smaller pieces.

### 5. Engine Not Found

- **Symptom:** `NOT_INSTALLED: No se encontró Antigravity CLI (agy)`.
- **Resolution:** Install Antigravity CLI (see [Prerequisites](#prerequisites)), or point `AGY_BIN` to the binary, e.g. `AGY_BIN=C:\Users\<username>\AppData\Local\agy\bin\agy.exe`.

---

## Platform Specific Notes

### Windows
- **Command-line safety:** Prompts and diffs go through stdin, and `agy.exe` is spawned directly without `cmd.exe`, so there is no shell injection and no 8,191-character limit.
- **Stale PATH:** After `winget install Google.AntigravityCLI`, apps that were already open (VS Code, terminals) keep the old `PATH`. The wrapper still finds `agy` in the WinGet package folder, but restart your terminal to use `agy` by hand.
- **Old aliases:** An `agy.cmd` / `agy.ps1` in `%APPDATA%\npm` that runs `gemini` shadows the real `agy` in new shells. Rename or delete it.

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
│   ├── login.md                # /antigravity:login
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
│   ├── backend.test.mjs        # Arg building, stdin transport & fake-backend tests
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
