# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **MAJOR** – breaking changes (renamed commands, removed options, changed environment variables).
- **MINOR** – new backwards-compatible features.
- **PATCH** – backwards-compatible bug fixes.

## [Unreleased]

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

[Unreleased]: https://github.com/kevin-sarria/antigravity-cc/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/kevin-sarria/antigravity-cc/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/kevin-sarria/antigravity-cc/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/kevin-sarria/antigravity-cc/releases/tag/v1.0.0
