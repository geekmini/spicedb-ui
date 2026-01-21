---
name: review-pr-ci
description: This skill should be used when running automated code review in CI environments like GitHub Actions. Triggers on "review PR", "review this PR", "code review", "review PR in CI", or when running with GITHUB_ACTIONS=true environment variable.
---

# CI Code Review

Perform automated PR code review with intelligent comment management and semantic deduplication.

## CI Environment Check

**Skip explicit CI check** - if this skill is invoked via the code-review workflow, you're already in CI. The GITHUB_ACTIONS environment variable is set by GitHub Actions automatically.

Proceed directly to the review workflow. Do NOT try to run `echo` or other shell commands to check CI status - just trust that if this skill is loaded, it's being used appropriately.

## Guideline Path

Accept optional guideline path in prompt. Default: `docs/codeReviewGuideline.md`

Example prompts:
- `Review this PR` (uses default guideline path)
- `Review this PR with guideline at .github/REVIEW.md`

## Quick Workflow

1. Read guideline from specified path (default: `docs/codeReviewGuideline.md`)
2. Read `CLAUDE.md` for project standards (if exists)
3. **Fetch existing summary and parse INLINE_STATE** (critical for deduplication)
4. Get PR context via `gh pr view` and `gh pr diff`
5. Classify issues: CRITICAL/SUGGESTIONS (inline) vs NITS (summary only)
6. Generate issueHash for each finding and compare against INLINE_STATE
7. **Filter findings to only files in PR diff** (MANDATORY - prevents cross-PR contamination)
8. **Resolve PR HEAD commit SHA** (MANDATORY - use only this for posting)
9. Post only NEW inline comments (skip duplicates)
10. Update summary with new INLINE_STATE

## STRICT RULE: One Summary Per PR (State Tracker)

**There must be exactly ONE summary comment per PR. The summary serves as persistent state across CI runs.**

- ALWAYS search for ALL existing summary comments FIRST (title: `claude-code-review-summary`)
- Include all bot user variants in search: "claude", "claude[bot]", "github-actions[bot]"
- If summary exists → READ its inline state, then UPDATE it (PATCH)
- If no summary exists → CREATE it (POST)
- **If MULTIPLE summaries exist → DUPLICATE BUG: Delete all but the oldest, then UPDATE**
- NEVER create a new summary if one already exists
- **Re-check for summaries right before CREATE** to prevent race conditions
- The summary contains hidden metadata tracking all posted inline comments

## Issue Classification

**CRITICAL** (inline comments):
- Bugs causing failures
- Security vulnerabilities
- Code health degradation
- Architectural violations

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

## Core Principles

- Focus on actionable feedback that improves code health
- Balance critical feedback with non-blocking suggestions
- Technical facts and data override opinions
- Be direct and concise
- If code is fine, don't comment; silence means approval

## STRICT RULE: Only Comment on Files in PR Diff

**CRITICAL: This prevents cross-PR contamination where comments appear on unrelated files.**

- **ONLY post inline comments on files that appear in `gh pr diff --name-only`**
- Files read for context (to understand the codebase) MUST NOT receive inline comments
- Before posting ANY comment, verify the file path is in the PR's changed files list
- Use ONLY the PR's HEAD commit SHA: `gh api repos/{owner}/{repo}/pulls/{pr_number} --jq '.head.sha'`

**Why this matters:** When reading surrounding files for context, you may identify issues. These issues should NOT be commented on because they are outside the PR's scope. Commenting on them causes confusion and pollutes the PR review.

## State-Based Deduplication

Before posting any comment, read state from existing summary:
1. Fetch existing summary comment (contains `INLINE_STATE` metadata)
2. Parse the hidden `INLINE_STATE` JSON to get list of already-posted issues
3. Compare new findings by `path` + `issueHash` (NOT by line number)
4. If issue already posted → SKIP (even if line number changed)
5. If truly new issue → POST_NEW and add to state

This prevents duplicate comments across pushes, even when line numbers drift.

## Fixed Issue Handling

**Preserve review history for human reviewers:**

- ✅ Detect when previously-flagged issues are fixed (code changed/removed)
- ✅ Update summary to show fixed issues with strikethrough
- ✅ Remove fixed issues from INLINE_STATE (allows re-detection if issue returns)
- ❌ Do NOT delete inline comments (preserve for history)
- ❌ Do NOT reply to threads with "fixed" messages

This ensures human reviewers can see the full review history while the summary accurately reflects current code state.

## Detailed Workflow

See [references/workflow.md](references/workflow.md) for:
- Complete 6-phase workflow
- Semantic deduplication algorithm
- **PR diff validation (Step 3.5)** - filters comments to changed files only
- **Commit SHA resolution (Step 4.0)** - ensures correct commit reference
- Fixed issue detection logic
- Comment reconciliation logic
- Summary comment format