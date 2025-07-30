# Movesia - Unity AI Assistant

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Electron](https://img.shields.io/badge/Electron-191970?style=flat&logo=Electron&logoColor=white)](https://electronjs.org/)

> An intelligent desktop AI assistant designed to help Unity developers create, troubleshoot, and optimize their projects through natural conversations.

## 🎯 Overview

**Movesia** is a powerful cross-platform desktop application built with Electron that serves as your personal Unity development companion. Whether you're a beginner learning Unity or an experienced developer working on complex projects, Movesia provides intelligent assistance through an intuitive chat interface.

### ✨ Key Features

- **🤖 AI-Powered Unity Assistant**: Get instant help with Unity development questions, code suggestions, and best practices
- **💬 Conversational Interface**: Natural chat-like interaction with dual modes:
  - **Agent Mode**: Comprehensive AI assistance with detailed responses
  - **Ask Mode**: Quick answers to specific questions
- **📎 File Attachment Support**: Share code snippets, scripts, and project files for contextual help
- **🌙 Modern Dark Theme**: Sleek, developer-friendly interface optimized for long coding sessions
- **⚡ Cross-Platform**: Native performance on Windows, macOS, and Linux
- **🔒 Secure Architecture**: Built with security best practices and isolated contexts

## 🛠️ Technology Stack

- **Frontend**: React 19 with TypeScript
- **Desktop Framework**: Electron 37
- **Build Tool**: Vite 7
- **UI Components**: Radix UI primitives
- **Styling**: Tailwind CSS 4
- **Package Manager**: pnpm
- **Code Quality**: ESLint with Neostandard configuration

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **pnpm** (v10.11.0 or higher)
- **Git**

## 🚀 Getting Started

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/movesia.git
   cd movesia
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start the development server**
   ```bash
   pnpm dev
   ```

The application will open automatically in development mode with hot-reload enabled.

### Development Scripts

```bash
# Start development server
pnpm dev

# Build the application for production
pnpm make

# Package the application (without creating distributables)
pnpm package

# Run linting
pnpm lint

# Fix linting issues automatically
pnpm lint:fix

# Clean all generated files and dependencies
pnpm clean
```

## 📦 Building & Distribution

### Create Distributables

```bash
# Build distributables for your current platform
pnpm make

# Build for specific platforms (configured in forge.config.ts)
pnpm package
```

### Supported Platforms

- **Windows**: `.exe` installer via Squirrel
- **macOS**: `.zip` archive
- **Linux**: `.deb` and `.rpm` packages

## 🏗️ Project Structure

```
movesia/
├── src/
│   ├── app/                    # React renderer process
│   │   ├── components/         # UI components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── screens/           # Application screens
│   │   └── styles/            # Global styles
│   ├── channels/              # IPC channel definitions
│   ├── ipc/                   # Inter-process communication
│   ├── menu/                  # Application menus
│   ├── main.ts                # Electron main process
│   ├── preload.ts             # Preload script
│   └── appWindow.ts           # Window management
├── config/                    # Vite configuration files
├── assets/                    # Static assets and icons
└── forge.config.ts           # Electron Forge configuration
```

## 🎮 Usage

### Getting Started with Movesia

1. **Launch the Application**: Start Movesia from your desktop or run `pnpm dev` for development
2. **Choose Your Mode**: 
   - Select **Agent Mode** for comprehensive assistance
   - Select **Ask Mode** for quick questions
3. **Start Chatting**: Type your Unity-related questions or requests
4. **Attach Files**: Use the paperclip icon to share code files or screenshots
5. **Get Instant Help**: Receive AI-powered assistance tailored to Unity development

### Example Conversations

- *"Help me create a player controller script for a 2D platformer"*
- *"What's the best way to optimize performance in my Unity mobile game?"*
- *"How do I implement a save/load system using ScriptableObjects?"*
- *"Can you review this script and suggest improvements?"*

## 🔧 Configuration

### Window Settings

- **Minimum Size**: 960x660 pixels
- **Default Theme**: Dark mode
- **Frame**: Custom titlebar (frameless)
- **State Persistence**: Window size and position are remembered

### Security Features

- Context isolation enabled
- Node integration disabled in renderer
- Secure preload script implementation
- ASAR integrity validation

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests and linting: `pnpm lint`
5. Commit your changes: `git commit -m 'Add your feature'`
6. Push to the branch: `git push origin feature/your-feature`
7. Submit a pull request

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🆘 Support & Community

- **Issues**: Report bugs or request features on [GitHub Issues](https://github.com/your-username/movesia/issues)
- **Discussions**: Join the conversation in [GitHub Discussions](https://github.com/your-username/movesia/discussions)

## 🚧 Roadmap

- [ ] Unity project integration
- [ ] Real-time code analysis
- [ ] Asset store integration
- [ ] Custom AI model training
- [ ] Collaborative features
- [ ] Plugin system

---

<div align="center">
  <p><strong>Made with ❤️ for the Unity development community</strong></p>
  <p>Star ⭐ this repository if you find it helpful!</p>
</div>
