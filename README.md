# Antigravity Second Brain

This is a local, terminal-based tool that scans your codebase, figures out how files and components are connected, and builds a JSON knowledge graph (`brain.json`). It comes with a standalone HTML viewer so you can visualize your project architecture in a node graph, similar to Obsidian.

We built this specifically to feed contextual architecture data into the Antigravity IDE. It helps the IDE understand your whole project structure before making code changes, rather than blindly editing individual files.

## How it works under the hood

1. **Scanner**: It traverses your project and extracts imports, exports, and dependencies (supports 15+ languages).
2. **Classifier**: It sends a minimal summary to the Gemini API (`google-genai`) to group files into concepts, tech stacks, and domains.
3. **Graph**: The result is compiled into a lightweight `brain.json` file.
4. **Viewer**: Open `brain_viewer.html` in your browser to see a local, force-directed graph of your project.

## Requirements

- Python 3.8+
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com/)

## Step-by-Step Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/alessandrogama/antigravity-brain
   cd antigravity-brain
   ```

2. **Run the setup script**
   This script will install the required Python packages, ask for your API key, and configure the `brain` terminal alias.
   ```bash
   bash setup.sh
   ```

3. **Reload your shell**
   ```bash
   source ~/.bashrc
   ```

## Usage

Navigate to any project you want to map out and run the scan command. 

```bash
# Scan the current directory
brain scan .

# Run a scan and limit it to 40 core files (good for huge projects)
brain scan . --max-files 40

# Add a project to your local registry for quick access
brain register my-api ~/projects/backend
```

### Visualizing the Graph

Since the viewer is a local HTML file, some browsers block loading local JSON files due to CORS. The easiest way to view your graph is to start a quick local server in the project folder:

```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000/brain_viewer.html` in your browser.

## Using it with Antigravity IDE

If you want to use the generated graph with Antigravity IDE, you have two options:

**Option A (Recommended):** Go to your IDE settings and paste the contents of `prompts/AGENT_PROMPT.md` into the System Prompt.

**Option B:** Just drag and drop `prompts/AGENT_PROMPT.md` into the chat window when starting a new session.

Once loaded, the IDE will automatically run `brain scan` in the background and consult your project's architecture before proposing code changes. It also forces the IDE to show you an impact plan before it edits files.

## Adding manual context

The scanner does a good job mapping code, but sometimes you want to add abstract context (like a product rule, a specific person, or a cloud resource). You can inject these directly into the graph:

```bash
brain add "Redis" "Used for session caching" "tech"
brain add "John Doe" "DevOps lead" "person"
```

## Supported Languages

The local AST scanner currently extracts import/dependency statements from:
`Dart`, `Python`, `JS/TS`, `Vue`, `PHP`, `C#`, `Java`, `Kotlin`, `Go`, `Rust`, `Swift`, `Elixir`, `C/C++`, `Markdown` (wikilinks), and standard `JSON/YAML` config files.

## Security & Privacy

- `brain.json` and `projects.json` are strictly local and added to `.gitignore`.
- Your Gemini API key is never printed in logs or sent anywhere besides Google's servers.
- The scanner respects `.gitignore` out of the box and has built-in protection against path traversal via symlinks.
- We never automatically commit any AI-generated files.

## Contributing

Feel free to open issues or PRs. Some things on the roadmap:
- Exporting the graph directly to Obsidian (`.md` files with frontmatter)
- Proper monorepo support (multiple `brain.json` files per sub-project)
- A dedicated VS Code extension

## License

MIT
