---
name: worktree-setup
description: Create a git worktree for parallel AI agent work. Asks what you're working on, generates a branch name, creates the worktree from dev, and runs npm install.
---

Set up a new git worktree for parallel work.

## Steps

1. **Ask the user** what they're working on (a short description of the task).
2. **Generate a branch name** from the description — kebab-case, concise, descriptive (e.g., `fix-items-stack-overflow`, `add-combat-initiative`).
3. **Confirm** the branch name with the user before proceeding.
4. **Create the worktree** by running:
   ```
   git worktree add ../HomeBoysHouse-worktrees/<branch-name> -b <branch-name> dev
   ```
   The worktrees directory is `~/Documents/Code/HomeBoysHouse-worktrees/`.
5. **Run `npm install`** inside the new worktree directory.
6. **Report the path** to the user so they can open a terminal there:
   ```
   ~/Documents/Code/HomeBoysHouse-worktrees/<branch-name>/
   ```

## Rules
- Always branch from `dev`.
- Never reuse an existing branch name. If one exists, ask the user for a different name.
- Do not start a dev server or make any code changes.
