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
  - [Options](#options)
  - [Reviews](#reviews)
  - [Background jobs](#background-jobs)
  - [Continuing a conversation](#continuing-a-conversation)
  - [`/antigravity:task <requirement>`](#antigravitytask-requirement)
  - [Typical flows](#typical-flows)
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

In Claude Code:

```text
/plugin marketplace add kevin-sarria/antigravity-cc
/plugin install antigravity@antigravity-marketplace
/reload-plugins
/antigravity:setup
```

`/antigravity:setup` tells you whether Antigravity CLI is installed and signed in, and offers to install it if it is missing.

To work on the plugin itself, clone it and register the local folder instead:

```bash
git clone https://github.com/kevin-sarria/antigravity-cc.git
cd antigravity-cc
npm test
```

```text
/plugin marketplace add C:Users<username>path	oantigravity-cc
/plugin install antigravity@antigravity-marketplace
```

### 2. Run as Standalone CLI

Every command also works from a normal terminal, inside the repository you want to work on:

```bash
node /path/to/antigravity-cc/bin/agy-wrapper.mjs setup
node /path/to/antigravity-cc/bin/agy-wrapper.mjs review --base main
echo "--background revisa la auth" | node /path/to/antigravity-cc/bin/agy-wrapper.mjs adversarial-review
node /path/to/antigravity-cc/bin/agy-wrapper.mjs status
node /path/to/antigravity-cc/bin/agy-wrapper.mjs --help
```

---

## Command Reference

| Command | What it does | Sub-agent permissions |
| :--- | :--- | :--- |
| `/antigravity:setup` | Checks Node, git, Antigravity CLI and your session; offers to install `agy` if it is missing. | — |
| `/antigravity:review` | Structured review of your uncommitted changes or your branch: verdict, findings by severity with `file:line`. | Read-only |
| `/antigravity:adversarial-review` | Review that tries to **break** the change and questions the design (auth, data loss, races, rollback). | Read-only |
| `/antigravity:challenge <idea>` | Skeptical architecture critique of a proposal or decision. | Read-only |
| `/antigravity:delegate <task>` | Hands a task to Antigravity, which edits files on disk and returns a digest. | Read + edit files |
| `/antigravity:task <requirement>` | Full pipeline: Claude writes the spec, Antigravity builds it, Claude audits and fixes. | Read + edit files |
| `/antigravity:status [id]` | Running and recent jobs for this repository, or the details of one job. | — |
| `/antigravity:result [id]` | Stored output of a finished job (the latest one by default). | — |
| `/antigravity:cancel [id]` | Stops a running job. | — |
| `/antigravity:login` | Opens a console window running `agy` so you can sign in. | — |
| `/antigravity:test` | Quick connectivity smoke test. | Read-only |

There is also an **`antigravity-rescue` subagent** (see `/agents`). Claude can hand it a substantial task on its own initiative, for example when it is stuck on a bug or wants an independent second pass. You can also ask for it directly: *"pídele a Antigravity que investigue por qué fallan los tests"*.

### Options

Write options before the text; they work in any order:

| Option | Applies to | Effect |
| :--- | :--- | :--- |
| `--background` | review, adversarial-review, challenge, delegate, task | Runs as a background job. The command returns at once with a job ID, and the 10-minute limit of Claude Code no longer applies (`AGY_BACKGROUND_TIMEOUT_MS`, default 30 min). |
| `--wait` | review, adversarial-review | Runs in the foreground without asking. |
| `--base <branch>` | review, adversarial-review | Reviews the current branch against `<branch>`, e.g. `--base main`. |
| `--scope auto\|working-tree\|branch` | review, adversarial-review | `auto` (default) reviews uncommitted changes when there are any, otherwise the branch against the default branch. |
| `--resume` | delegate, task, challenge | Continues the last Antigravity conversation of that kind in this repository. Send only the new instruction. |
| `--conversation <id>` | delegate, task, challenge | Continues a specific `agy` conversation. |
| `--model <name>` | all runs | Model for this run (`agy models` lists them). |
| `--effort <low\|medium\|high\|xhigh\|max>` | all runs | Reasoning effort for this run. |

> [!IMPORTANT]
> In headless mode, `agy` auto-denies every tool that needs permission **and ends the turn without an answer**. The wrapper handles it like this:
> - `review`, `adversarial-review`, `challenge` and `test` run in the default mode: the agent can read files inside the project, but not write or run commands.
> - `delegate` and `task` run with `--mode accept-edits`: the agent can also create and edit files, but not run shell commands, so Claude runs the tests afterwards.
> - Every prompt starts with tool rules (no terminal commands, stay inside the project folder), and a turn cut short by a denied tool is reported as `DENIED: ...`.
>
> Set `AGY_APPROVAL_MODE=yolo` to let `delegate`/`task` run commands too (`--dangerously-skip-permissions`; it approves everything).

### Reviews

What gets reviewed:
- **Uncommitted changes**: staged, unstaged and **the content of new untracked files**.
- **Or your branch** against `main` (or `--base <branch>`): commit list, diff stat and full diff.

Antigravity answers in a fixed JSON schema (`schemas/review-output.schema.json`, enforced with `agy --json-schema`). The wrapper renders it like this:

```text
# Revisión: cambios sin confirmar

**Veredicto:** ⚠️ REQUIERE ATENCIÓN

El cambio introduce una inyección SQL crítica en deleteUser...

## Hallazgos (1)

### 1. 🔴 CRÍTICO — Inyección SQL en deleteUser
`db.js:7` · confianza 100%

Se concatena req.query.name en la sentencia DELETE...

**Recomendación:** Usar consultas parametrizadas...

## Próximos pasos
- Reemplazar la concatenación por consultas parametrizadas.

---
🛰️ Respondido por Antigravity CLI (agy) · conversación 95301bf1-... · 64.1 s · 70.3k tokens · carpeta: ...
```

Reviews never change code. After a review, Claude shows the findings and **asks which ones to fix** instead of fixing them on its own.

```text
/antigravity:review
/antigravity:review --base main revisa sobre todo la autorización
/antigravity:adversarial-review --background piensa en qué pasa si el pago falla a la mitad
```

### Background jobs

Every run, foreground or background, is recorded as a job for the current repository. The state is kept outside the repository, in `~/.antigravity-cc/state/` (`AGY_STATE_DIR` changes the location). It holds each job's status, output and `agy` conversation ID, and the last 50 jobs per repository are kept.

```text
/antigravity:review --background
/antigravity:status                 # table of running and recent jobs
/antigravity:status agy-mv4fvk7a    # details of one job (unique ID prefixes work)
/antigravity:result                 # output of the latest finished job
/antigravity:cancel agy-mv4fvk7a    # stop it (kills the worker and agy)
```

If a background worker disappears (closed terminal, reboot), `status` marks the job as failed instead of leaving it "running" forever.

### Continuing a conversation

`agy` keeps conversations, so follow-ups don't need the whole context again:

```text
/antigravity:delegate Crea tests de integración para src/payments
/antigravity:delegate --resume ahora cubre también los reembolsos parciales
```

### `/antigravity:task <requirement>`

Orchestrates the round-trip in one command:
1. **Claude** turns the requirement into a technical spec (files, contracts, validation rules, tests).
2. **Antigravity** writes the files on disk and returns a digest.
3. **Claude** checks the real changes with `git diff`, runs your test suite, fixes what's wrong and reports.

```text
/antigravity:task Crear módulo de envío masivo de correos con carga de destinatarios desde Excel
```

### Typical flows

```text
# Before committing
/antigravity:review

# Before shipping something risky
/antigravity:adversarial-review --base main --background

# Stuck on a bug
/antigravity:delegate investiga por qué falla el test de login y aplica el arreglo mínimo

# Long task
/antigravity:task --background <requerimiento>
/antigravity:status
/antigravity:result
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
AGY_TIMEOUT_MS=570000             # max time per foreground run
AGY_BACKGROUND_TIMEOUT_MS=1800000 # max time per background job
AGY_STATE_DIR=                    # where job state is stored (default ~/.antigravity-cc/state)
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
# Check Node, git, Antigravity CLI and your session
node bin/agy-wrapper.mjs setup

# Run live end-to-end smoke test
node bin/agy-wrapper.mjs test
```

### How do I know the answer really came from Antigravity?

Every successful `agy` run ends with a receipt line that only `agy` can produce:

```text
🛰️ Respondido por Antigravity CLI (agy) · conversación b31196d3-ee51-488d-9b0e-787b1da38f6f · 3.6 s · 12.1k tokens · carpeta: C:\path\to\your\project
```

- The **conversation ID** matches a file written by `agy`. Check it with `Test-Path "$env:USERPROFILE\.gemini\antigravity-cli\conversations\<ID>.db"` (PowerShell) or `ls ~/.gemini/antigravity-cli/conversations/<ID>.db`.
- Each run also writes a log in `~/.gemini/antigravity-cli/log/`. Its `workspaceDirs=[...]` line shows the folder `agy` worked in.
- **carpeta** must be your project folder. If it shows another folder, open Claude Code inside the project and run the command again.
- In Claude Code, expand the Bash call of the command: it shows the `node .../agy-wrapper.mjs <action>` execution and its raw output.

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
- **Job state stays local:** job outputs and prompts (which can include your diffs) are stored in `~/.antigravity-cc/state/`, outside your repository, and are never sent anywhere except to your own `agy`.

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

### Releasing a new version
```bash
# 1. Write the changes under "## [Unreleased]" in CHANGELOG.md
# 2. Bump every version reference and date the changelog section
npm run bump-version -- minor        # or patch / major / 1.5.0
npm test
# 3. Commit, tag and push
git commit -am "chore(release): vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main vX.Y.Z
```

`npm run check-version` fails when any version reference drifts. GitHub Actions (`.github/workflows/ci.yml`) runs it and the full test suite on Windows, macOS and Linux for every push and pull request, and validates the plugin manifests.

The security audit recursively scans every file in the project against known secret signatures (Google, Anthropic, OpenAI, GitHub, AWS, JWTs, Private Keys) and validates that `.gitignore` and `.env.example` adhere strictly to privacy guidelines.

---

## Repository Structure

```text
antigravity-cc/
├── .claude-plugin/
│   ├── marketplace.json        # Claude Code marketplace catalog
│   └── plugin.json             # Plugin metadata manifest
├── .codex-plugin/
│   └── plugin.json             # Manifest for Codex interoperability
├── .github/workflows/ci.yml    # Tests on Windows/macOS/Linux + plugin validation
├── agents/
│   └── antigravity-rescue.md   # Subagent Claude can hand substantial tasks to
├── bin/
│   └── agy-wrapper.mjs         # CLI entry point and action orchestrator
├── lib/
│   ├── args.mjs                # Flag parsing (argv and leading flags in stdin text)
│   ├── backend.mjs             # agy/gemini/codex detection, arguments, headless runs
│   ├── git.mjs                 # Review target selection and context collection
│   ├── jobs.mjs                # Per-repository job registry (status/result/cancel/resume)
│   └── review.mjs              # Review prompts, structured output parsing and rendering
├── commands/                   # Slash commands: setup, review, adversarial-review, challenge,
│                               # delegate, task, status, result, cancel, login, test
├── schemas/
│   └── review-output.schema.json  # JSON schema enforced on review answers
├── scripts/
│   └── bump-version.mjs        # Release helper (bump + --check)
├── skills/
│   ├── antigravity-review/     # When to request a review (auto-invocable)
│   ├── antigravity-challenge/  # When to request an architecture critique (auto-invocable)
│   ├── antigravity-delegate/   # Delegation (user-invoked)
│   ├── antigravity-task/       # Round-trip pipeline (user-invoked)
│   └── antigravity-result-handling/  # Internal rules for presenting results
├── tests/                      # node:test suites with fake agy backends and temp git repos
├── .env.example                # Safe environment template (placeholders only)
├── CHANGELOG.md                # Release history (Semantic Versioning)
├── CONTRIBUTING.md             # Guidelines for contributors
├── LICENSE                     # Community Open Source (Non-Commercial) License
├── package.json                # Zero-dependency configuration & scripts
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
