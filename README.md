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
  - [Install as Claude Code Plugin](#1-install-as-claude-code-plugin)
  - [Run as Standalone CLI](#2-run-as-standalone-cli)
- [Command Reference](#command-reference)
  - [1. `/antigravity:review`](#1-antigravityreview)
  - [2. `/antigravity:delegate <task>`](#2-antigravitydelegatetask)
  - [3. `/antigravity:challenge <hypothesis>`](#3-antigravitychallengehypothesis)
  - [4. `/antigravity:status`](#4-antigravitystatus)
  - [5. `/antigravity:test`](#5-antigravitytest)
- [Engine & Model Configuration](#engine--model-configuration)
- [Platform Specific Notes](#platform-specific-notes)
- [Security & Privacy Guarantee](#security--privacy-guarantee)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Repository Structure](#repository-structure)
- [Contributing](#contributing)
- [License](#license)

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

# 2. Install the plugin
/plugin install antigravity@local

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

### 2. `/antigravity:delegate <task>`

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

### 3. `/antigravity:challenge <hypothesis>`

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

### 4. `/antigravity:status`

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

### 5. `/antigravity:test`

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
│   └── plugin.json             # Claude Code slash commands manifest
├── .codex-plugin/
│   └── plugin.json             # Manifest for Codex interoperability
├── bin/
│   └── agy-wrapper.mjs         # Multi-engine CLI bridge & orchestrator
├── skills/
│   ├── antigravity-review/     # Dual-agent code review skill
│   ├── antigravity-delegate/   # Deep task & scaffolding delegation skill
│   └── antigravity-challenge/  # Adversarial architecture review skill
├── tests/
│   ├── wrapper.test.mjs        # Functional CLI and command tests
│   └── security-audit.test.mjs # Automated credential & secret exposure scanner
├── .env.example                # Safe environment template (placeholders only)
├── .gitignore                  # Airtight exclusion rules for git
├── CONTRIBUTING.md             # Guidelines for open-source contributors
├── LICENSE                     # MIT Open Source License
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
