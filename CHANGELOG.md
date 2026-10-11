# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **MAJOR** – breaking changes (renamed commands, removed options, changed environment variables).
- **MINOR** – new backwards-compatible features.
- **PATCH** – backwards-compatible bug fixes.

## [Unreleased]

## [1.5.0] - 2026-10-11

### Added
- **`/antigravity:model`**: pick the model and effort from a menu, or in one line (`/antigravity:model pro alto`).
  The choice is saved as the default for every command in `~/.antigravity-cc/config.json`.
- Short model names (`flash`, `pro`, `opus`, `sonnet`, `gpt`) that follow the newest version in `agy models`,
  and efforts in Spanish (`bajo`, `medio`, `alto`). New `AGY_EFFORT` and `AGY_CONFIG_DIR` variables.
- The receipt line names the model that answered, and `/antigravity:setup` shows the active model.
- `--file <path>` reads the text for review, adversarial-review, challenge, delegate and task from a file.

### Changed
- `AGY_MODEL` accepts the short names too.

### Fixed
- A model combined with an effort it does not offer (e.g. `--model gemini-3.1-pro-high --effort low`) made
  `agy` silently fall back to Flash. The wrapper now always sends one exact model ID and rejects impossible
  combinations with the list of valid efforts.
- `/antigravity:task` failed with `unexpected EOF while looking for matching '` when Claude put a long
  spec with quotes inside a Bash heredoc. Claude now saves the spec with the Write tool and passes
  `--file`. The rescue subagent and the delegate skill do the same for long briefs.

## [1.4.0] - 2026-10-11

### Added
- **Structured reviews.** `review` now returns a verdict and findings with severity, `file:line`,
  confidence and a recommendation, enforced with `agy --json-schema`
  (`schemas/review-output.schema.json`) and rendered ordered from critical to low.
- **`/antigravity:adversarial-review`**: a review that tries to break the change and questions
  the design (auth, data loss, races, rollback, migrations).
- **Review targets**: `--base <branch>` reviews the current branch against a branch, and
  `--scope auto|working-tree|branch` picks what to review. Working-tree reviews now include the
  content of new untracked files.
- **Background jobs**: `--background` on review, adversarial-review, challenge, delegate and task,
  plus `/antigravity:status`, `/antigravity:result` and `/antigravity:cancel`. Every run is recorded
  per repository in `~/.antigravity-cc/state/` (`AGY_STATE_DIR`). Background runs are not bound by
  Claude Code's 10-minute Bash limit (`AGY_BACKGROUND_TIMEOUT_MS`, default 30 min). Crashed workers
  are detected, and cancel kills the worker and `agy`.
- **`--resume` / `--conversation <id>`** continue an earlier `agy` conversation for delegate, task
  and challenge.
- **`--model` and `--effort`** per run.
- **`/antigravity:setup`**: checks Node, git, Antigravity CLI and the session, and offers to
  install `agy` when it is missing.
- **`antigravity-rescue` subagent**: Claude can hand it substantial tasks on its own initiative.
- **`antigravity-result-handling` skill**: findings are shown verbatim, and Claude asks before
  fixing anything after a review.
- **Release tooling**: `npm run bump-version` and `npm run check-version`, plus a GitHub Actions CI
  that runs the tests on Windows, macOS and Linux and validates the plugin manifests.

### Changed
- `/antigravity:status` now lists the repository's jobs. Backend diagnostics moved to
  `/antigravity:setup`.
- The wrapper is split into modules under `lib/`. Every git call runs without a shell.
- Review and delegate commands accept their options inside the text (e.g. `--base main revisa la auth`).

### Fixed
- Background runs and probes no longer open console windows on Windows (`windowsHide`).

## [1.3.0] - 2026-10-11

### Added
- Every successful Antigravity run ends with a verifiable receipt line: `agy` conversation ID,
  duration, tokens used and working folder. The ID matches
  `~/.gemini/antigravity-cli/conversations/<id>.db`.
- Commands tell Claude to always show the receipt to the user verbatim.
- README section "How do I know the answer really came from Antigravity?".
- Test that keeps the version in sync across `package.json`, both plugin manifests,
  the marketplace entry and the wrapper.

## [1.2.0] - 2026-10-11

### Changed
- **Backend switched to the official Google Antigravity CLI (`agy`).** Gemini CLI stopped
  serving personal accounts (free, Google AI Pro, Ultra) on 2026-06-18. It remains only as
  a legacy engine for Standard/Enterprise accounts (`AGY_ENGINE=gemini`).
- Prompts are sent to `agy` as `stream-json` events over stdin. User text is never placed on
  the command line, and `agy.exe` is spawned without a shell.
- Commands pass arguments through quoted heredocs and request the 10-minute Bash timeout.
- Skills use `${CLAUDE_PLUGIN_ROOT}`. The `task` and `delegate` skills are user-invoked only.

### Added
- `/antigravity:login`: opens a console window for interactive sign-in.
- Permission model: read-only for `review`/`challenge`/`test`, `--mode accept-edits` for
  `delegate`/`task`, and opt-in `AGY_APPROVAL_MODE=yolo`.
- Tool rules in every prompt, plus a `DENIED` diagnosis when a headless turn is cut short by a
  denied tool.
- Detection of the real `agy` binary in PATH and in its install locations. Aliases that only
  run `gemini` are skipped.
- `AGY_TIMEOUT_MS` (default 570 s) and `AGY_DEBUG=1` for raw backend events.
- `review` includes untracked files and truncates very large diffs.
- Tests with fake `agy`/`gemini` backends. The security audit now flags any personal home path
  or email address.

### Fixed
- `delegate`/`task` could not write files: the headless sub-agent denied every write.
- Shell-injection risk on Windows when prompts were passed as command-line arguments.
- Codex engine: prompts are read from stdin with the proper sandbox, and an explicit Codex
  request no longer falls back silently to another engine.

## [1.0.0] - 2026-10-11

### Added
- Initial release: `/antigravity:task`, `review`, `delegate`, `challenge`, `status` and `test`
  commands, matching skills, Claude Code marketplace manifest and security audit tests.

[Unreleased]: https://github.com/kevin-sarria/antigravity-cc/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/kevin-sarria/antigravity-cc/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/kevin-sarria/antigravity-cc/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/kevin-sarria/antigravity-cc/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/kevin-sarria/antigravity-cc/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/kevin-sarria/antigravity-cc/releases/tag/v1.0.0
