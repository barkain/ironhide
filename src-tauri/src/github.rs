use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::Arc;
use tokio::sync::Semaphore;

/// Detect GitHub token from gh CLI or environment variables.
pub fn detect_github_token() -> Option<String> {
    // 1. Try gh auth token
    if let Ok(output) = Command::new("gh")
        .args(["auth", "token"])
        .output()
    {
        if output.status.success() {
            let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !token.is_empty() {
                return Some(token);
            }
        }
    }

    // 2. Try GITHUB_TOKEN env var
    if let Ok(token) = std::env::var("GITHUB_TOKEN") {
        if !token.is_empty() {
            return Some(token);
        }
    }

    // 3. Try GH_TOKEN env var
    if let Ok(token) = std::env::var("GH_TOKEN") {
        if !token.is_empty() {
            return Some(token);
        }
    }

    None
}

/// Detect GitHub username from gh CLI.
pub fn detect_github_username() -> Option<String> {
    if let Ok(output) = Command::new("gh")
        .args(["api", "user", "--jq", ".login"])
        .output()
    {
        if output.status.success() {
            let username = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !username.is_empty() {
                return Some(username);
            }
        }
    }
    None
}

/// Parse owner and repo from a git remote URL.
/// Handles:
///   https://github.com/owner/repo.git
///   https://github.com/owner/repo
///   git@github.com:owner/repo.git
///   git@github.com:owner/repo
pub fn parse_github_remote(url: &str) -> Option<(String, String)> {
    let url = url.trim();

    // SSH format: git@github.com:owner/repo.git
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let rest = rest.trim_end_matches(".git");
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }

    // HTTPS format: https://github.com/owner/repo.git
    if url.contains("github.com") {
        let rest = url
            .replace("https://github.com/", "")
            .replace("http://github.com/", "");
        let rest = rest.trim_end_matches(".git");
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }

    None
}

/// Detect owner/repo from git remote of a given directory.
pub fn detect_github_repo(project_path: &str) -> Option<(String, String)> {
    if let Ok(output) = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(project_path)
        .output()
    {
        if output.status.success() {
            let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return parse_github_remote(&url);
        }
    }
    None
}

#[derive(Debug, Deserialize)]
pub struct GitHubCommit {
    pub sha: String,
    pub commit: GitHubCommitDetail,
}

#[derive(Debug, Deserialize)]
pub struct GitHubCommitDetail {
    pub author: Option<GitHubCommitAuthor>,
}

#[derive(Debug, Deserialize)]
pub struct GitHubCommitAuthor {
    pub date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchResult {
    pub items: Vec<SearchItem>,
    pub total_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchItem {
    pub number: u32,
    pub repository_url: String,  // "https://api.github.com/repos/owner/repo"
    pub pull_request: Option<SearchPullRequest>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SearchPullRequest {
    pub merged_at: Option<String>,
}

#[derive(Debug)]
pub struct SprintGitHubData {
    pub prs_merged: u32,
    pub concurrent_commit_days: u32,
    pub sprint_days: u32,
}

/// Extract owner/repo from a GitHub API repository_url.
/// Format: "https://api.github.com/repos/{owner}/{repo}"
fn parse_repo_from_api_url(url: &str) -> Option<(String, String)> {
    let prefix = "https://api.github.com/repos/";
    if let Some(rest) = url.strip_prefix(prefix) {
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

/// Fetch all commits for a single PR, paginating if necessary.
async fn fetch_pr_commits(
    client: &reqwest::Client,
    token: &str,
    owner: &str,
    repo: &str,
    pr_number: u32,
    since: &str,
    until: &str,
) -> Vec<(String, u32)> {
    let mut all_date_pairs = Vec::new();
    let mut page = 1u32;

    loop {
        let commits_url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}/commits?per_page=100&page={}",
            owner, repo, pr_number, page
        );
        let resp = match client.get(&commits_url)
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "ironhide")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => break,
        };

        if !resp.status().is_success() {
            break;
        }

        let commits: Vec<GitHubCommit> = resp.json().await.unwrap_or_default();
        let count = commits.len();

        for commit in commits {
            if let Some(author) = commit.commit.author {
                if let Some(date_str) = author.date {
                    if date_str.len() >= 10 {
                        let date = date_str[..10].to_string();
                        // Bug 3 fix: use exclusive upper bound (date < until)
                        if date.as_str() >= since && date.as_str() < until {
                            all_date_pairs.push((date, pr_number));
                        }
                    }
                }
            }
        }

        // If we got fewer than 100 commits, no more pages
        if count < 100 {
            break;
        }
        page += 1;
    }

    all_date_pairs
}

/// Fetch merged PRs and commit concurrency data from GitHub for a date range.
/// Searches across ALL repos the user has contributed to using the GitHub Search API.
pub async fn fetch_sprint_github_data(
    client: &reqwest::Client,
    token: &str,
    username: &str,
    since: &str,  // ISO date like "2026-03-01"
    until: &str,  // ISO date like "2026-03-14"
    sprint_days: u32,
) -> Result<SprintGitHubData, String> {
    // Search for all merged PRs by this user in the date range across all repos
    let query = format!(
        "is:pr is:merged author:{} merged:{}..{}",
        username, since, until
    );
    let url = format!(
        "https://api.github.com/search/issues?q={}&per_page=100",
        urlencoding::encode(&query)
    );
    let resp = client.get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "ironhide")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("GitHub Search API error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub Search API returned {}", resp.status()));
    }

    let search_result: SearchResult = resp.json().await
        .map_err(|e| format!("JSON parse error: {}", e))?;

    // Bug 2 fix: use total_count for accurate PR count without full pagination
    let prs_merged = search_result.total_count;

    // Paginate search results to get all items for concurrency calculation
    let mut all_items = search_result.items;
    let total_count = prs_merged;

    if total_count > 100 {
        let total_pages = ((total_count as f64) / 100.0).ceil() as u32;
        let max_pages = total_pages.min(10); // Safety limit
        for page in 2..=max_pages {
            let page_url = format!("{}&page={}", url, page);
            let resp = client.get(&page_url)
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "ironhide")
                .header("Accept", "application/vnd.github+json")
                .send()
                .await
                .map_err(|e| format!("GitHub Search API pagination error: {}", e))?;

            if !resp.status().is_success() {
                break;
            }

            let page_result: SearchResult = resp.json().await
                .map_err(|e| format!("JSON parse error on page {}: {}", page, e))?;

            if page_result.items.is_empty() {
                break;
            }
            all_items.extend(page_result.items);
        }
    }

    // Bug 4 fix: fetch commits for all PRs concurrently with a semaphore
    let semaphore = Arc::new(Semaphore::new(10));
    let mut handles = Vec::new();

    for item in &all_items {
        let (owner, repo) = match parse_repo_from_api_url(&item.repository_url) {
            Some(pair) => pair,
            None => continue,
        };

        let sem = semaphore.clone();
        let client = client.clone();
        let token = token.to_string();
        let number = item.number;
        let since = since.to_string();
        let until = until.to_string();

        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            fetch_pr_commits(&client, &token, &owner, &repo, number, &since, &until).await
        }));
    }

    // Collect results into the date_to_prs map
    let mut date_to_prs: HashMap<String, HashSet<(String, u32)>> = HashMap::new();
    let results = futures::future::join_all(handles).await;
    for result in results {
        if let Ok(date_pairs) = result {
            for (date, pr_number) in date_pairs {
                // Find the repo key from the pr_number by looking up in all_items
                if let Some(item) = all_items.iter().find(|i| i.number == pr_number) {
                    if let Some((owner, repo)) = parse_repo_from_api_url(&item.repository_url) {
                        let pr_key = format!("{}/{}", owner, repo);
                        date_to_prs.entry(date).or_default().insert((pr_key, pr_number));
                    }
                }
            }
        }
    }

    // Count concurrent commit days (days with commits to >1 PR)
    let concurrent_commit_days = date_to_prs.values().filter(|prs| prs.len() > 1).count() as u32;

    Ok(SprintGitHubData {
        prs_merged,
        concurrent_commit_days,
        sprint_days,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_remote_https() {
        let result = parse_github_remote("https://github.com/barkain/ironhide.git");
        assert_eq!(result, Some(("barkain".to_string(), "ironhide".to_string())));
    }

    #[test]
    fn test_parse_github_remote_https_no_git() {
        let result = parse_github_remote("https://github.com/owner/repo");
        assert_eq!(result, Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_github_remote_ssh() {
        let result = parse_github_remote("git@github.com:owner/repo.git");
        assert_eq!(result, Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_github_remote_invalid() {
        assert_eq!(parse_github_remote("not-a-url"), None);
    }
}
