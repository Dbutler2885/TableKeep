---
name: worktree-teardown
description: Tear down a git worktree after work is complete. Asks whether to merge into dev or discard, then removes the worktree and deletes the branch.
---

Tear down a git worktree after testing is complete.

## Steps

1. **Identify the worktree.** List existing worktrees with `git worktree list`. If there's more than one (besides the main worktree), ask the user which one to tear down.
2. **Ask the user**: "Merge into dev or discard?"
3. **If merge:**
   a. From the main worktree directory (`~/Documents/Code/HomeBoysHouse/`), run:
      ```
      git checkout dev
      git merge <branch-name>
      ```
   b. If there are merge conflicts, stop and tell the user. Do not force or auto-resolve.
4. **If discard:** Skip the merge.
5. **Remove the worktree:**
   ```
   git worktree remove ../HomeBoysHouse-worktrees/<branch-name>
   ```
6. **Delete the branch:**
   ```
   git branch -d <branch-name>
   ```
   If discarding (not merged), use `git branch -D <branch-name>` instead.
7. **Confirm** cleanup is complete.

## Rules
- The user must have committed all changes before calling this skill. If `git status` in the worktree shows uncommitted changes, warn the user and stop.
- Never force-resolve merge conflicts.
- Always run worktree and branch cleanup even if the user chose to discard.
