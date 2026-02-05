//! File change event handlers
//!
//! Processes notify events and converts them to WatchEvents

use std::path::Path;

use notify::{Event, EventKind};

use super::WatchEvent;

/// Handle a file system event
pub fn handle_event(event: Event) -> Option<WatchEvent> {
    let paths = &event.paths;

    if paths.is_empty() {
        return None;
    }

    let path = &paths[0];

    match event.kind {
        EventKind::Create(_) => handle_create(path),
        EventKind::Modify(_) => handle_modify(path),
        EventKind::Remove(_) => handle_remove(path),
        _ => None,
    }
}

/// Handle file creation
fn handle_create(path: &Path) -> Option<WatchEvent> {
    // Check if it's a JSONL file
    if !is_jsonl_file(path) {
        return None;
    }

    // Check if it's a subagent log
    if is_subagent_log(path) {
        let (session_id, agent_id) = extract_subagent_info(path)?;
        return Some(WatchEvent::SubagentCreated {
            session_id,
            agent_id,
            path: path.to_path_buf(),
        });
    }

    // Regular session file
    let session_id = extract_session_id(path)?;
    Some(WatchEvent::NewSession {
        session_id,
        path: path.to_path_buf(),
    })
}

/// Handle file modification
fn handle_modify(path: &Path) -> Option<WatchEvent> {
    if !is_jsonl_file(path) {
        return None;
    }

    let session_id = extract_session_id(path)?;
    Some(WatchEvent::SessionUpdated {
        session_id,
        path: path.to_path_buf(),
    })
}

/// Handle file removal
fn handle_remove(path: &Path) -> Option<WatchEvent> {
    if !is_jsonl_file(path) {
        return None;
    }

    Some(WatchEvent::FileDeleted {
        path: path.to_path_buf(),
    })
}

/// Check if a path is a JSONL file
fn is_jsonl_file(path: &Path) -> bool {
    path.extension()
        .map(|ext| ext == "jsonl")
        .unwrap_or(false)
}

/// Check if a path is a subagent log
fn is_subagent_log(path: &Path) -> bool {
    path.to_string_lossy().contains(".subagents/")
}

/// Extract session ID from path
/// Path format: .../sessions/<session_id>/session.jsonl
fn extract_session_id(path: &Path) -> Option<String> {
    // Get parent directory (should be session directory)
    let parent = path.parent()?;

    // Get session ID from directory name
    parent.file_name()?.to_str().map(|s| s.to_string())
}

/// Extract subagent info from path
/// Path format: .../sessions/<session_id>/.subagents/<agent_hash>/agent.jsonl
fn extract_subagent_info(path: &Path) -> Option<(String, String)> {
    let parent = path.parent()?;
    let agent_id = parent.file_name()?.to_str()?.to_string();

    // Go up to .subagents, then up to session
    let subagents_dir = parent.parent()?;
    let session_dir = subagents_dir.parent()?;
    let session_id = session_dir.file_name()?.to_str()?.to_string();

    Some((session_id, agent_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_is_jsonl_file() {
        assert!(is_jsonl_file(Path::new("/path/to/session.jsonl")));
        assert!(!is_jsonl_file(Path::new("/path/to/session.json")));
        assert!(!is_jsonl_file(Path::new("/path/to/session.txt")));
    }

    #[test]
    fn test_is_subagent_log() {
        assert!(is_subagent_log(Path::new("/sessions/abc/.subagents/xyz/agent.jsonl")));
        assert!(!is_subagent_log(Path::new("/sessions/abc/session.jsonl")));
    }

    #[test]
    fn test_extract_session_id() {
        let path = PathBuf::from("/home/user/.claude/projects/myproject/sessions/abc123/session.jsonl");
        assert_eq!(extract_session_id(&path), Some("abc123".to_string()));
    }

    #[test]
    fn test_extract_subagent_info() {
        let path = PathBuf::from("/sessions/session123/.subagents/agent456/agent.jsonl");
        let (session_id, agent_id) = extract_subagent_info(&path).unwrap();
        assert_eq!(session_id, "session123");
        assert_eq!(agent_id, "agent456");
    }
}
