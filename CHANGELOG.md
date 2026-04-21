# Changelog

## [2.0.0]

### Added
- `brain watch` — auto-rescan on file changes (polling with snapshot diff)
- `brain projects` — list registered projects
- `brain register <n> <path>` — register a project by name
- `brain use <n>` — scan a registered project by name
- `projects.json` registry with atomic writes
- `setup.sh` interactive setup with project auto-detection and menu
- `prompts/` folder with reusable Antigravity prompt templates
- Language-agnostic agent: responds in user's language, graph stays in English
- Elixir and C/C++ language support
- `--interval` flag for watch mode

### Changed
- All project internals and node types are now in English
- `install.sh` replaced by `setup.sh` (interactive, with project picker)
- `brain scan` is now a subcommand (`brain scan .` instead of `brain .`)
- Default node type changed from `arquivo` to `file`

### Security
- All previous security improvements from v1.1.0 carried forward
