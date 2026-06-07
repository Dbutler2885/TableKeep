---
name: implement-slice
description: Implement one PRD implementation slice from thoughts/shared/slices from Not started to merged-quality code. Use when the user asks to implement a slice, start a slice, continue a slice, or take a prd-to-slices ticket through blocker checks, planning, implementation, verification, and status updates.
---

# Implement Slice

Use this skill to take one implementation slice produced by `prd-to-slices` from `Not started` to merged-quality code. A slice is a ticket, not a plan: it states what and why with behavioral acceptance criteria, but it may not contain current-state analysis, file:line references, or concrete code changes. Bridge that gap by either implementing directly when the slice is already plan-equivalent, or by writing and approving a plan first, then implementing through the `implement-plan` skill gate.

## Getting Started

When given a slice path, such as `thoughts/shared/slices/04-duplicate-token-naming.md`:

1. Read the slice file fully, with no limit or offset.
2. Read the parent PRD linked at the top of `thoughts/shared/slices/README.md`, focusing on the sections the slice references.
3. Read `thoughts/shared/slices/README.md` to see the dependency table and the status of every slice.
4. Verify blockers are done. For each `Blocked by` entry, confirm that slice's status is `Done` in both the README table and the slice file's `Status:` line. If a blocker is not done, stop and tell the user which blocker is outstanding. Do not implement against an unbuilt dependency.

If no slice path is provided, ask for one, or list the slices in `thoughts/shared/slices/` and ask which slice to implement.

## Routing

State the routing decision and reasoning to the user before acting.

### Implement Directly

Skip planning only when all of these are true:

- The slice `Type` is `AFK`.
- The work is mostly new files, such as a pure module under `lib/`, rather than surgical edits to large existing files.
- The acceptance criteria are concrete, testable, and already read like a spec.
- Little or no current-state archaeology is required.

In this case, treat the slice itself as the plan. Build a todo list from the acceptance criteria and implement it following the implementation discipline below.

### Plan First

Plan first when any of these are true:

- The slice `Type` is `HITL`.
- The slice rewires a large existing file, such as `MapsTab.tsx`, or touches many integration points.
- The acceptance criteria are behavioral or vague enough that the implementation path is non-obvious.
- You are unsure.

In this case:

1. Research the current code. Read the real files and locate current behavior. Use read-only locator or analyzer agents only if the user has asked for agents or the surface is genuinely large.
2. Write a detailed implementation plan to `thoughts/shared/plans/{NN-slice-title}.md`. Include phases, relevant file:line specifics, risks, and success criteria split into `Automated` and `Manual`.
3. Present the plan and get approval. For `HITL` slices, this is the human checkpoint. Do not proceed to implementation until the user approves. Surface genuine design decisions as questions rather than guessing.
4. After approval, follow the `implement-plan` skill/workflow against that plan. The approved plan plus `implement-plan` is the gate for implementation.

When in doubt, prefer plan-first. The cost of an unnecessary plan is small; the cost of mis-implementing a surgical edit to a large file is not.

## Implementation Discipline

Whether direct or plan-gated:

- Implement the full vertical slice across every layer the slice names: logic, wiring, UI, tests, and docs/status updates. A slice is done only when it is demoable or verifiable on its own.
- Follow existing codebase patterns. Pure logic belongs in `lib/` with unit tests. Stateful concerns belong in hooks. Match the testing style already in the repo.
- Write tests required by the slice acceptance criteria and the PRD's testing decisions. Tests should assert behavior, state, and commands, not DOM structure or which function was called.
- Respect cross-cutting regressions noted in the slices README: persistent map/token/fog/annotation/character data must keep saving normally, and player map mode must stay unchanged unless the slice explicitly changes it.
- Tick the slice's acceptance-criteria checkboxes from `- [ ]` to `- [x]` as each is satisfied. If a plan was produced, also tick its success criteria.

If reality contradicts the slice, stop and present the mismatch clearly:

```text
Mismatch in Slice NN:
Expected: [what the slice/PRD implies]
Found: [actual situation]
Why it matters: [explanation]
How should I proceed?
```

Do not force the slice as written when the codebase has moved or a slice assumption is wrong.

## Verification

At natural stopping points, and before declaring the slice done:

- Run the project's checks: typecheck, lint, and the test suite via this repo's `npm run` scripts.
- Run the new unit tests for any pure module.
- Fix failures before moving on.
- Report results faithfully. If a check fails or a manual step is unverifiable, say so.

## Completion

When the slice is implemented and verified:

1. Set the slice file's `Status:` to `Done`.
2. Update the matching row in `thoughts/shared/slices/README.md` to `Done`.
3. Summarize what was built, which acceptance criteria are met, what needs manual verification, and which slices this unblocks per the README dependency table.
4. Do not commit or push unless the user asks. If they do ask, branch first if on the default branch and follow the repo's commit conventions.
