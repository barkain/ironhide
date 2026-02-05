//! File watcher module
//!
//! Watches Claude Code session directories for changes:
//! - New session files
//! - Updates to existing sessions
//! - Subagent creation

pub mod handler;

use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use thiserror::Error;

/// Watcher errors
#[derive(Error, Debug)]
pub enum WatcherError {
    #[error("Notify error: {0}")]
    Notify(#[from] notify::Error),

    #[error("Channel error: {0}")]
    Channel(String),

    #[error("Path not found: {0}")]
    PathNotFound(PathBuf),
}

/// Events emitted by the watcher
#[derive(Debug, Clone)]
pub enum WatchEvent {
    /// A new session was created
    NewSession {
        session_id: String,
        path: PathBuf,
    },
    /// An existing session was updated
    SessionUpdated {
        session_id: String,
        path: PathBuf,
    },
    /// A new subagent was created
    SubagentCreated {
        session_id: String,
        agent_id: String,
        path: PathBuf,
    },
    /// A file was deleted
    FileDeleted {
        path: PathBuf,
    },
}

/// Session directory watcher
pub struct SessionWatcher {
    watcher: RecommendedWatcher,
    sessions_path: PathBuf,
    rx: Receiver<Result<Event, notify::Error>>,
}

impl SessionWatcher {
    /// Create a new session watcher
    pub fn new(sessions_path: PathBuf) -> Result<Self, WatcherError> {
        let (tx, rx) = channel();

        let watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default().with_poll_interval(Duration::from_secs(1)),
        )?;

        Ok(Self {
            watcher,
            sessions_path,
            rx,
        })
    }

    /// Start watching the sessions directory
    pub fn start(&mut self) -> Result<(), WatcherError> {
        if !self.sessions_path.exists() {
            return Err(WatcherError::PathNotFound(self.sessions_path.clone()));
        }

        self.watcher.watch(&self.sessions_path, RecursiveMode::Recursive)?;

        tracing::info!("Started watching: {:?}", self.sessions_path);

        Ok(())
    }

    /// Stop watching
    pub fn stop(&mut self) -> Result<(), WatcherError> {
        self.watcher.unwatch(&self.sessions_path)?;
        Ok(())
    }

    /// Poll for new events (non-blocking)
    pub fn poll(&self) -> Vec<WatchEvent> {
        let mut events = Vec::new();

        while let Ok(result) = self.rx.try_recv() {
            match result {
                Ok(event) => {
                    if let Some(watch_event) = handler::handle_event(event) {
                        events.push(watch_event);
                    }
                }
                Err(e) => {
                    tracing::error!("Watch error: {:?}", e);
                }
            }
        }

        events
    }
}

/// Get the default Claude sessions path
pub fn default_sessions_path() -> Option<PathBuf> {
    // Try ~/.claude/projects first
    if let Some(home) = dirs::home_dir() {
        let claude_path = home.join(".claude").join("projects");
        if claude_path.exists() {
            return Some(claude_path);
        }
    }

    // Try macOS Application Support
    if let Some(data_dir) = dirs::data_dir() {
        let app_support_path = data_dir.join("Claude").join("projects");
        if app_support_path.exists() {
            return Some(app_support_path);
        }
    }

    // Try Linux config
    if let Some(config_dir) = dirs::config_dir() {
        let config_path = config_dir.join("claude").join("projects");
        if config_path.exists() {
            return Some(config_path);
        }
    }

    None
}
