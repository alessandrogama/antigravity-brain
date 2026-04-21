# Antigravity Second Brain

This is a local, terminal-based tool that scans your codebase, figures out how files and components are connected, and builds a JSON knowledge graph (`brain.json`). It comes with a standalone HTML viewer so you can visualize your project architecture in a node graph, similar to Obsidian.

We built this specifically to feed contextual architecture data into the Antigravity IDE. It helps the IDE understand your whole project structure before making code changes, rather than blindly editing individual files.

## How it works under the hood

1. **Scanner**: Traverses your project and extracts imports and dependencies (supports 15+ languages).
2. **Classifier**: Sends a minimal summary to the Gemini API to group files into concepts, tech stacks, and domains.
3. **Graph**: Compiles the result into a lightweight `brain.json` file.
4. **Viewer**: Open `brain_viewer.html` in your browser to see a force-directed graph of your project.

## Requirements

- Python 3.8+
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com/)

---

## Setup — Linux / macOS / WSL

```bash
git clone https://github.com/alessandrogama/antigravity-brain
cd antigravity-brain
bash setup.sh
source ~/.bashrc
```

The setup script will install dependencies, ask for your API key, and create the `brain` shell alias automatically.

---

## Setup — Windows (PowerShell)

```powershell
git clone https://github.com/alessandrogama/antigravity-brain
cd antigravity-brain

# Allow local scripts to run (only needed once)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force

# Run the installer
.\install.ps1
```

The installer will:
1. Create the `.venv` and install dependencies
2. Add the project folder to your user PATH (permanent)
3. Add a `brain` function to your PowerShell profile (permanent)
4. Ask for your Gemini API key and save it to your user environment

After install, reload your profile and test it:

```powershell
. $PROFILE
brain
```

If you skipped the API key during install, set it manually:

```powershell
[System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "your-key-here", "User")
```

---

## Usage

Type `brain` alone to see your graph status and all available commands.

```bash
# Scan the current directory
brain scan .

# Scan a specific project folder
brain scan ~/projects/my-api

# Scan all registered projects at once
brain scan-all

# Open the graph viewer in your browser (starts server automatically)
brain view

# Watch mode -- re-scans automatically when files change
brain watch .

# Limit scan to 40 files (good for large projects)
brain scan . --max-files 40

# Register a project by name for quick access
brain register my-api ~/projects/backend

# Scan a registered project by name
brain use my-api

# List all registered projects
brain projects

# Add a manual node (tech, person, resource, etc.)
brain add "Redis" "Used for session caching" "tech"

# Reset brain.json and start fresh
brain clear
```

---

## Visualizing the Graph

Run this command from any terminal and it will start a local server and open the browser automatically:

```bash
brain view
```

This works on Windows, Linux, macOS, and WSL. It always serves from the correct project directory regardless of where you run the command from.

The viewer supports English, Spanish, and Portuguese (selector in the top-right corner).

---

## Using it with Antigravity IDE

**Option A (Recommended):** Go to IDE settings and paste the contents of `prompts/AGENT_PROMPT.md` into the System Prompt.

**Option B:** Drag and drop `prompts/AGENT_PROMPT.md` into the chat at the start of each session.

Once loaded, the IDE will automatically consult your project's architecture before proposing code changes and show an impact plan before editing any file.

---

## Adding manual context

The scanner maps code well, but you can also inject abstract context directly:

```bash
brain add "Redis" "Session cache" "tech"
brain add "John" "DevOps lead" "person"
brain add "Stripe" "Payment gateway" "resource"
```

Valid node types: `project`, `tech`, `concept`, `person`, `resource`, `file`

---

## Supported Languages

`Dart`, `Python`, `JS/TS`, `Vue`, `PHP`, `C#`, `Java`, `Kotlin`, `Go`, `Rust`, `Swift`, `Elixir`, `C/C++`, `Markdown` (wikilinks), `JSON/YAML`

---

## Security & Privacy

- `brain.json` and `projects.json` are local-only and in `.gitignore` — never committed.
- Your Gemini API key is never printed in logs or committed to the repo.
- The scanner blocks symlinks that point outside the project root (path traversal prevention).

---

## Contributing

Open issues or PRs. Things on the roadmap:
- Exporting to Obsidian native format (`.md` with frontmatter)
- Monorepo support (multiple `brain.json` per sub-project)
- VS Code extension

## License

MIT
