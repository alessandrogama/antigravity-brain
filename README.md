# 🧠 Antigravity Second Brain

**Antigravity** is a high-performance knowledge graph and project analysis tool designed for developers who want to maintain a "satellite view" of their complex codebases. Powered by Gemini AI, it scans your projects, identifies architectural patterns, and visualizes everything in a stunning Neural HUD.

It's not just a visualizer; it's a **persistent memory layer** for you and your AI coding assistant.

---

## 🚀 Quick Start (Windows)

The easiest way to get up and running on Windows:

1. **Open PowerShell as Administrator** and run the installer:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
   .\install.ps1
   ```
2. **Restart your terminal** to activate the `brain` command globally.
3. **Register your first project**:
   ```powershell
   brain register my-app C:\path\to\your\project
   ```
4. **Scan and Visualize**:
   ```powershell
   brain use my-app
   brain view
   ```

---

## 🛠️ Step-by-Step Usage

### 1. Mapping your Terrain (`scan`)
Scan any folder to generate a `brain.json` map. This is where the AI analyzes your logic, tech stack, and dependencies.
```powershell
brain scan .
```

### 2. Live Synchronization (`watch`)
The most powerful way to work. Run this in a background terminal. Every time you save a file, the brain updates instantly.
```powershell
brain watch .
```

### 3. Neural HUD (`view`)
Open the immersive, glassmorphic visualization in your browser. It automatically starts a local server and handles the layout for you.
```powershell
brain view
```

### 4. Project Management
Organize multiple projects under nicknames for quick switching.
```powershell
brain register webapp C:\Projetos\my-site
brain projects  # List all nicknames
brain use webapp # Jumps to folder and scans
```

---

## 🤖 The Antigravity Protocol (AI Interaction)

When working with an AI assistant (like me!), follow these steps to ensure **perfect context persistence**:

1. **Always Scan First**: Before asking for a major refactor, run `brain scan`. This gives the AI the latest "satellite map" of your project.
2. **Contextual Inquiries**: You can ask things like: *"Based on the brain graph, where is the best place to inject a logging service?"*
3. **Auto-Update**: If the AI makes changes, ensure a re-scan happens (or use `watch` mode) so the brain never falls behind your code.

---

## 🎨 Neural HUD Features

The new visualization engine includes:
- **Glassmorphism Design**: Floating panels with real-time blur and neon accents.
- **Brain-Shape Physics**: Nodes naturally stabilize into two hemispheres.
- **O(1) Performance**: Instant lookups and smooth 60fps rendering even for large graphs.
- **i18n Support**: Switch between **English, Portuguese, and Spanish** on the fly.

---

## 🐧 Linux / WSL Setup

If you are on Ubuntu/WSL:
1. Make the setup script executable: `chmod +x setup.sh`
2. Run it: `./setup.sh`
3. The `brain` alias will be added to your `.bashrc` or `.zshrc`.

---

## 🔒 Security & Privacy

- **Local First**: All your code analysis stays in `brain.json` on your machine.
- **Safe Scanning**: Automatically ignores `node_modules`, `.git`, `build`, and sensitive files.
- **API Security**: Your `GEMINI_API_KEY` is stored safely in your OS environment variables, never committed to git.

---

*“Antigravity isn’t just about seeing your code; it’s about never feeling lost in it again.”*
