# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-04-08

### Added
- Core pin store with project, global, and session scopes
- CLI with add, list, remove, clear, generate commands
- PreCompact hook — expires TTL pins, regenerates context file
- SessionStart hook — re-injects pins into context after compaction
- Proactive pinning — Claude suggests pins during conversation
- Onboarding message on first session
- Session pins that survive compaction but clear on next startup
- Pin lifetime: permanent (default), temporary (--context), session (--session)
- Skills: /context-pin:add, /context-pin:list, /context-pin:remove, /context-pin:clear
- 141 tests (unit, CLI integration, hooks integration, schema validation)
- Security: input sanitization, schema validation, file locking, .gitignore protection
- Privacy: 100% local, zero network calls, restrictive file permissions

