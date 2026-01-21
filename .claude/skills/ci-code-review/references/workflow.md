# CI Code Review Workflow

## Arguments

```
$ARGUMENTS
```

## PR Number Resolution

Parse arguments for PR number. If not provided, auto-detect:

1. Get current branch:
   ```bash
   git branch --show-current
   ```

2. Find PR for branch:
   ```bash
   gh pr view --json number --jq '.number'
   ```

3. If no PR found:
   ```
   Error: No PR found for current branch.
   ```

## Repository Info

```bash
gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
```

---

## Error Handling

**Rate Limiting (HTTP 403):** Exit gracefully with message about retry on next push.

**Permission Errors (HTTP 403/401):** Log permission needed, post summary if possible, exit.

**Network Failures:** Retry once with 5-second delay.

**PR State Changes:** If closed/merged during execution, exit gracefully.

**GraphQL Errors:** Log error, fall back to REST API if available.

**Critical vs Non-Critical:**
- Critical: Fetching PR diff, posting summary
- Non-Critical: Individual inline comments, orphan cleanup

---

## Phase 1: Code Review Analysis

### Step 1.1: Read Guideline

Parse guideline path from prompt. Default: `docs/codeReviewGuideline.md`

Use the Read tool to check if the guideline file exists:
- Read `docs/codeReviewGuideline.md` (or custom path from prompt)
- If file exists, use it as primary review criteria
- If file doesn't exist, proceed without custom guidelines

Also reference `CLAUDE.md` for project standards (if exists).

### Step 1.2: Execute Review

1. `gh pr view` for context and description
2. `gh pr diff` for changes
3. Read source files for deeper context
4. Evaluate against code quality standards

### Step 1.3: Classify Issues

**CRITICAL** (inline comments):
- Bugs, security vulnerabilities
- Code health degradation
- Architectural violations
- Tech stack anti-patterns

**SUGGESTIONS** (inline comments):
- Performance issues
- Maintainability concerns
- Missing error handling
- Actionable improvements

**NITS** (summary table only - NO inline comments):
- Style inconsistencies
- Alternative approaches
- Educational comments
- Optional refactoring
- Naming preferences

Store: `critical_issues`, `suggestions`, and `nits` arrays.

---

## Phase 2: State Discovery (Summary-Based)

### Step 2.1: Fetch ALL Existing Summaries (CRITICAL - DO THIS FIRST)

**IMPORTANT: Fetch ALL matching summaries, not just the first one. This is required for duplicate detection and cleanup.**

```bash
gh api repos/{owner}/{repo}/issues/{pr_number}/comments \
  --jq '[.[] | select((.user.login == "github-actions[bot]" or .user.login == "claude[bot]" or .user.login == "claude") and (.body | contains("## claude-code-review-summary"))) | {id, body, created_at}]'
```

**Parse the result:**
- If result is `[]` or empty → No existing summary, `INLINE_STATE = []`, `existing_summary_id = null`
- If result has exactly 1 entry → Use that as the existing summary
- If result has multiple entries → **DUPLICATE DETECTED** (see Step 2.1a)

### Step 2.1a: Handle Duplicate Summaries (MANDATORY)

**If multiple summaries exist, you MUST clean them up:**

1. Sort summaries by `created_at` (oldest first)
2. Keep the OLDEST summary (it has the most complete state history)
3. Delete ALL other summaries:

```bash
# For each duplicate summary (all except the oldest):
gh api repos/{owner}/{repo}/issues/comments/{duplicate_id} -X DELETE
```

4. Log the cleanup:
```
Duplicate summaries detected: {count}
Deleted {count-1} duplicate summaries, kept oldest (ID: {kept_id})
```

5. Use the oldest summary as `existing_summary_id`

### Step 2.2: Parse INLINE_STATE from Summary

If summary exists, extract the JSON between `INLINE_STATE_START` and `INLINE_STATE_END`:

```
The summary body contains:
<!-- INLINE_STATE_START
[{"path":"src/foo.ts","issueHash":"abc123","line":42,"commentId":123456},...]
INLINE_STATE_END -->
```

Parse this JSON array into `existing_issues` list. Each entry has:
- `path`: file path
- `issueHash`: MD5/short hash of the issue description (first 8 chars)
- `line`: line number when posted (for reference only, not for matching)
- `commentId`: GitHub comment ID (for potential updates)

**If no INLINE_STATE block found or parsing fails:** `existing_issues = []`

### Step 2.3: Get PR Diff Files

```bash
gh pr diff {pr_number} --name-only
```

### Step 2.4: Fetch Resolved Threads (Optional Cleanup)

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            isResolved
            comments(first: 1) {
              nodes { databaseId path }
            }
          }
        }
      }
    }
  }
' -f owner="{owner}" -f repo="{repo}" -F pr={pr_number}
```

Use this to identify resolved threads for cleanup from state.

---

## Phase 3: State-Based Deduplication (MANDATORY)

### Step 3.1: Generate Issue Hash for Each Finding

For each critical issue or suggestion, generate a unique hash:

```
issueHash = first 8 characters of MD5(path + ":" + normalized_issue_description)
```

**Normalize issue description:**
- Lowercase
- Remove line numbers from description
- Remove extra whitespace
- Keep only the core issue (e.g., "missing null check", "potential sql injection")

Example:
- Path: `src/auth.ts`
- Issue: "Missing null check on user input"
- Normalized: `src/auth.ts:missing null check on user input`
- Hash: `a1b2c3d4`

### Step 3.2: Compare Against Existing State

For each new finding with `{path, issueHash}`:

1. Search `existing_issues` (from Phase 2) for matching `path` AND `issueHash`
2. If match found → `SKIP` (already posted, even if line changed)
3. If no match → `POST_NEW`

**Important:** Do NOT compare by line number. Line numbers drift between pushes.

### Step 3.3: Output Decision Table (MANDATORY)

```
Deduplication Analysis:
| New Issue | Path | Hash | Existing | Decision |
| --------- | ---- | ---- | -------- | -------- |
| null check | src/auth.ts | a1b2c3d4 | YES | SKIP |
| sql inject | src/db.ts | e5f6g7h8 | NO | POST_NEW |
```

### Step 3.4: Build Post Queue

Create `to_post` array containing only `POST_NEW` decisions:
```json
[{"path": "src/db.ts", "line": 42, "issueHash": "e5f6g7h8", "body": "...", "severity": "CRITICAL"}]
```

### Step 3.5: Validate Findings Against PR Diff (MANDATORY - PREVENTS CROSS-PR CONTAMINATION)

**CRITICAL: This step prevents commenting on files not in the PR. Skip this step = risk of posting comments on wrong files.**

1. Get the list of changed files from Phase 2 Step 2.3:
```bash
changed_files=$(gh pr diff {pr_number} --name-only)
```

2. For each item in `to_post` queue, verify the path exists in changed files:
```
For each finding in to_post:
  IF finding.path NOT IN changed_files:
    REMOVE from to_post
    Log: "Filtered out comment on '{path}' - file not in PR diff"
```

3. Output validation summary:
```
PR Diff Validation:
- Total findings: {n}
- In PR diff: {n} (will post)
- Filtered out: {n} (not in PR diff)
```

**Why this matters:** When reading source files for context (Step 1.2.3), you may identify issues in files that are NOT part of the PR. These MUST be filtered out before posting.

---

## Phase 4: Comment Reconciliation

### Step 4.0: Resolve Commit SHA (MANDATORY - PREVENTS CROSS-PR CONTAMINATION)

**CRITICAL: Use ONLY the PR's HEAD commit SHA for inline comments. Using wrong commit SHA causes comments to appear on wrong files.**

1. Get the HEAD commit of the PR:
```bash
commit_sha=$(gh api repos/{owner}/{repo}/pulls/{pr_number} --jq '.head.sha')
```

2. Verify the commit belongs to this PR:
```bash
# Get all commits in PR
pr_commits=$(gh api repos/{owner}/{repo}/pulls/{pr_number}/commits --jq '.[].sha')

# Verify HEAD commit is in the list
echo "$pr_commits" | grep -q "$commit_sha" || echo "ERROR: commit_sha not in PR"
```

3. Store `commit_sha` for use in Step 4.1. Do NOT use any other commit reference.

**Why this matters:** If concurrent workflow runs share state, using incorrect commit SHA causes comments to reference files from other PRs.

### Step 4.1: Post New Issues and Track IDs

For each item in `to_post` queue, post and capture the comment ID:

```bash
# Post inline comment and capture response
response=$(gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  -X POST \
  -f body="**{severity}**: {issue_description}" \
  -f commit_id="{commit_sha}" \
  -f path="{path}" \
  -F line={line} \
  -f side="RIGHT")

# Extract comment ID from response
comment_id=$(echo "$response" | jq '.id')
```

**Track each posted comment:**
```json
{"path": "src/db.ts", "issueHash": "e5f6g7h8", "line": 42, "commentId": 123456}
```

Add to `new_posted_issues` array.

### Step 4.2: Merge State

Combine existing state with newly posted:
```
final_state = existing_issues + new_posted_issues
```

Remove entries for:
- Files no longer in diff (orphaned)
- Threads that were resolved by user

### Step 4.3: Log Actions

```
Posted: {n} new inline comments
Skipped: {n} duplicates (already in state)
Removed: {n} orphaned/resolved from state
```

---

## Phase 5: Fixed Issue Detection (State Update Only)

**IMPORTANT: Preserve all inline comments for human review history. Do NOT delete comments or reply to threads.**

### Step 5.1: Detect Fixed Issues

Compare `existing_issues` (from INLINE_STATE) against current findings:

1. For each issue in `existing_issues`:
   - Check if the same `path` + `issueHash` exists in current findings
   - If NOT found in current findings → Mark as `FIXED`
   - If found → Still active

2. Build `fixed_issues` array:
```json
[{"path": "src/auth.ts", "issueHash": "a1b2c3d4", "line": 42, "commentId": 123456, "status": "FIXED"}]
```

### Step 5.2: Update State (Keep Comments, Update Tracking)

**Do NOT:**
- ❌ Delete inline comments (preserve for human review)
- ❌ Reply to threads with "fixed" messages
- ❌ Auto-resolve threads

**DO:**
- ✅ Remove fixed issues from `INLINE_STATE` (so they won't block re-detection if issue returns)
- ✅ Track fixed issues in summary for visibility
- ✅ Update summary to reflect current state

The inline comments remain visible in the PR for human reviewers to see the full review history.

### Step 5.3: Build Final State

```
final_state = active_issues_only (exclude fixed issues)
```

This ensures:
- Fixed issues won't block re-detection if the same issue returns in a future commit
- Human reviewers can still see all historical comments
- Summary accurately reflects current code state

---

## Phase 6: Summary Comment (STRICT: ONE SUMMARY ONLY)

**CRITICAL RULE: There must be exactly ONE summary comment per PR. The summary contains the INLINE_STATE that tracks all posted comments.**

### Step 6.1: Re-Check for Existing Summary (RACE CONDITION GUARD)

**IMPORTANT: Before creating a new summary, re-check if one was created since Phase 2.**

This prevents race conditions where two workflow runs both pass the initial check before either creates a summary.

```bash
# Re-fetch summaries right before creating
gh api repos/{owner}/{repo}/issues/{pr_number}/comments \
  --jq '[.[] | select((.user.login == "github-actions[bot]" or .user.login == "claude[bot]" or .user.login == "claude") and (.body | contains("## claude-code-review-summary"))) | {id, body}]'
```

**Decision logic:**
- If summary now exists (wasn't there in Phase 2) → Switch to UPDATE mode
- If still no summary → Proceed with CREATE
- If multiple summaries exist → Clean up duplicates first (Step 2.1a), then UPDATE

### Step 6.2: Use Summary ID

- If `existing_summary_id` exists → UPDATE (PATCH)
- If no existing summary after re-check → CREATE (POST)

### Step 6.3: Build Summary Content with INLINE_STATE

**The summary MUST include the hidden INLINE_STATE block:**

```markdown
## claude-code-review-summary

<!-- INLINE_STATE_START
[{"path":"src/auth.ts","issueHash":"a1b2c3d4","line":42,"commentId":123456},{"path":"src/db.ts","issueHash":"e5f6g7h8","line":87,"commentId":789012}]
INLINE_STATE_END -->

### Overview
<Brief description of changes reviewed>

### Active Issues
**{N} active issue(s)** ({critical} critical, {suggestions} suggestions)

| Severity | File | Line | Issue |
| -------- | ---- | ---- | ----- |
| CRITICAL | `src/auth.ts` | 42 | Missing null check |
| SUGGESTION | `src/db.ts` | 87 | Consider parameterized query |

### Fixed Issues ✅
*Issues from previous reviews that appear to be addressed (comments preserved for history):*

| Severity | File | Original Line | Issue |
| -------- | ---- | ------------- | ----- |
| ~~CRITICAL~~ | `src/old.ts` | 15 | ~~SQL injection vulnerability~~ |

*If no fixed issues, omit this section.*

### Nits (Minor Issues)

| File | Line | Issue |
| ---- | ---- | ----- |
| `src/utils.ts` | 15 | Consider using const |

*These are minor style/preference items - address if you have time.*

### What's Good
<Positive aspects - be specific>

### Review Stats
- New comments posted: {n}
- Duplicates skipped: {n}
- Issues fixed: {n}
- Total active issues: {n}

---
*Generated with [Claude Code](https://claude.com/claude-code)*
```

### Step 6.4: Post or Update Summary

**IF existing summary found:**
```bash
gh api repos/{owner}/{repo}/issues/comments/{existing_summary_id} \
  -X PATCH \
  -f body="<summary content with INLINE_STATE>"
```

**ONLY IF no existing summary:**
```bash
gh api repos/{owner}/{repo}/issues/{pr_number}/comments \
  -X POST \
  -f body="<summary content with INLINE_STATE>"
```

### Step 6.5: Verify (MANDATORY)

After posting/updating, verify the INLINE_STATE is correctly saved:
```bash
gh api repos/{owner}/{repo}/issues/comments/{summary_id} --jq '.body' | grep -o 'INLINE_STATE_START.*INLINE_STATE_END'
```

---

## Constraints

### Scope Constraints (CRITICAL - Prevents Cross-PR Contamination)

- **ONLY comment on files in PR diff** - Before posting ANY inline comment, verify the file path exists in `gh pr diff --name-only` output. Files read for context MUST NOT receive comments.
- **Use ONLY PR's HEAD commit SHA** - Always resolve commit SHA via `gh api repos/{owner}/{repo}/pulls/{pr_number} --jq '.head.sha'`. Never use stale or cached commit references.
- **Validate before posting** - Step 3.5 (diff validation) and Step 4.0 (commit SHA resolution) are MANDATORY, not optional.

### Comment Management

- CI-only: Designed for CI environment
- Critical and Suggestions as inline comments
- Nits go to summary table ONLY (no inline comments for nits)
- **State-based deduplication is MANDATORY** - compare by path + issueHash, NOT line numbers
- Do NOT auto-resolve threads

### Summary Management

- **ONE SUMMARY COMMENT PER PR** - This is a STRICT rule. ALWAYS update existing summary, NEVER create duplicates
- **Summary title MUST be `## claude-code-review-summary`** - this is used for detection
- **INLINE_STATE block is MANDATORY** - this tracks all posted inline comments across CI runs
- **Fetch ALL summaries, not just first** - Required for duplicate detection and cleanup
- **Clean up duplicate summaries** - If multiple summaries exist, delete all but the oldest and log the cleanup
- **Re-check before creating** - Always re-fetch summaries right before POST to prevent race conditions
- **Include "claude" in user detection** - The bot may appear as "claude", "claude[bot]", or "github-actions[bot]"

### History Preservation

- **PRESERVE ALL INLINE COMMENTS** - Never delete inline comments; they provide valuable review history for human reviewers
- **NO REPLY TO THREADS** - Do not post "fixed" replies to resolved/fixed issues
- **UPDATE SUMMARY FOR FIXED ISSUES** - When issues are fixed, update the summary to show them as fixed (with strikethrough) but keep the original inline comments