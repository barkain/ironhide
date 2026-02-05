# Claude Analytics

A native desktop application for analyzing Claude Code sessions with deep insights, metrics, and recommendations.

![Claude Analytics Dashboard](./screenshots/dashboard-placeholder.png)

## Features

### Dashboard
- **Session Overview**: View all your Claude Code sessions at a glance
- **Key Metrics**: Track token usage, costs, conversation patterns, and tool interactions
- **Time-based Analysis**: Filter sessions by date range and see trends over time

### Session Analysis
- **Conversation Timeline**: Visualize the flow of your coding sessions
- **Tool Usage Breakdown**: See which tools Claude used most frequently
- **Token Analytics**: Understand input/output token distribution
- **Cost Tracking**: Monitor API usage costs per session

### Deep Insights
- **Behavior Patterns**: Identify common interaction patterns
- **Performance Metrics**: Track response times and session efficiency
- **Recommendation Engine**: Get actionable suggestions to improve your workflow

### Data Export
- Export session data to CSV for further analysis
- Generate reports for team sharing

## Installation

### Pre-built Binaries

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | [Claude.Analytics_*.dmg (arm64)](https://github.com/YOUR_USERNAME/claude-code-analytics-dashboard/releases/latest) |
| macOS (Intel) | [Claude.Analytics_*.dmg (x64)](https://github.com/YOUR_USERNAME/claude-code-analytics-dashboard/releases/latest) |
| Windows | [Claude.Analytics_*-setup.exe](https://github.com/YOUR_USERNAME/claude-code-analytics-dashboard/releases/latest) |
| Linux (AppImage) | [Claude.Analytics_*.AppImage](https://github.com/YOUR_USERNAME/claude-code-analytics-dashboard/releases/latest) |
| Linux (Debian) | [Claude.Analytics_*.deb](https://github.com/YOUR_USERNAME/claude-code-analytics-dashboard/releases/latest) |
| Linux (Fedora) | [Claude.Analytics_*.rpm](https://github.com/YOUR_USERNAME/claude-code-analytics-dashboard/releases/latest) |

### Build from Source

#### Prerequisites

- [Bun](https://bun.sh) (v1.0 or later)
- [Rust](https://rustup.rs) (stable)
- Platform-specific dependencies:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools, WebView2
  - **Linux**: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

#### Steps

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/claude-code-analytics-dashboard.git
cd claude-code-analytics-dashboard

# Install dependencies
bun install

# Run in development mode
bun run tauri:dev

# Build for production
bun run tauri:build
```

The built application will be in `src-tauri/target/release/bundle/`.

## Usage

1. **Launch the app** - The dashboard will automatically detect your Claude Code sessions
2. **Select a session** - Click on any session to view detailed analytics
3. **Explore insights** - Navigate through different views using the sidebar
4. **Export data** - Use the export feature to save data for external analysis

### Configuration

The app automatically reads Claude Code session data from:
- **macOS**: `~/.claude/projects/`
- **Linux**: `~/.claude/projects/`
- **Windows**: `%USERPROFILE%\.claude\projects\`

## Screenshots

> Screenshots coming soon

<!--
![Dashboard](./screenshots/dashboard.png)
![Session View](./screenshots/session.png)
![Analytics](./screenshots/analytics.png)
-->

## Development

### Project Structure

```
claude-code-analytics-dashboard/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── pages/             # Page components
│   ├── hooks/             # Custom React hooks
│   ├── stores/            # Zustand state stores
│   └── lib/               # Utility functions
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── commands/      # Tauri commands
│   │   ├── analysis/      # Analytics engine
│   │   └── lib.rs         # Main library
│   └── tauri.conf.json    # Tauri configuration
├── docs/                   # Documentation
└── package.json
```

### Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Recharts
- **Backend**: Rust, Tauri 2
- **State Management**: Zustand, TanStack Query
- **Build**: Vite, Bun

### Available Scripts

```bash
# Development
bun run dev           # Start Vite dev server
bun run tauri:dev     # Start Tauri in dev mode

# Building
bun run build         # Build frontend only
bun run tauri:build   # Build complete app
bun run tauri:build:debug  # Build with debug symbols

# Other
bun run preview       # Preview built frontend
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Auto-Update

The app includes auto-update functionality. When a new version is available, you'll be prompted to update.

To enable auto-updates for your own builds:

1. Generate a key pair:
   ```bash
   bun tauri signer generate -w ~/.tauri/claude-analytics.key
   ```

2. Set the public key in `tauri.conf.json` under `plugins.updater.pubkey`

3. Add secrets to your GitHub repository:
   - `TAURI_SIGNING_PRIVATE_KEY`: Contents of the private key file
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password for the private key

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

- Built with [Tauri](https://tauri.app)
- UI components inspired by [shadcn/ui](https://ui.shadcn.com)
- Charts powered by [Recharts](https://recharts.org)
