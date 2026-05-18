# Group / Campaign Backend Notes

## Purpose

Translate the agreed group and campaign model into backend responsibilities, Firestore shape, and migration boundaries.

This is not yet an implementation plan or a full migration script specification.

## Target Domain Model

### Users

`users/{userId}`

Essential fields:

- `email`
- `username`
- `createdAt`
- `updatedAt`
- `lastLoginAt`

Users exist independently of groups and campaigns.

### Groups

`groups/{groupId}`

Essential fields:

- `name`
- `slug`
- `currentCampaignId`
- `createdBy`
- `createdAt`
- `updatedAt`

Group responsibilities:

- social container
- current campaign pointer
- membership
- invites

### Group Memberships

`groups/{groupId}/members/{userId}`

Essential fields:

- `userId`
- `role`
- `status`
- `joinedAt`
- `updatedAt`

Current expectation:

- source of truth is group-scoped membership
- no array of members on group doc
- no array of groups on user doc as source of truth

### Invites

`groups/{groupId}/invites/{inviteId}`

Essential fields:

- `groupId`
- `createdBy`
- `targetUsername`
- `targetUserId`
- `status`
- `createdAt`
- `acceptedByUserId`

Current direction:

- in-app invite only
- target must already be a user
- target must already have a username

### Campaigns

`groups/{groupId}/campaigns/{campaignId}`

Essential fields:

- `groupId`
- `name`
- `slug`
- `system`
- `status`
- `createdBy`
- `gmUserId`
- `createdAt`
- `updatedAt`

`status`:

- `draft`
- `active`
- `inactive`

## Campaign-Owned Data

All game-state data should live under campaign:

- `characters`
- `sessionSummaries`
- `npcs`
- `maps`
- `items`
- `tables`

Target examples:

- `groups/{groupId}/campaigns/{campaignId}/characters/{characterId}`
- `groups/{groupId}/campaigns/{campaignId}/sessionSummaries/{summaryId}`
- `groups/{groupId}/campaigns/{campaignId}/maps/{mapId}`

Map-owned subcollections remain nested under maps:

- `tokens`
- `annotations`
- `fogChunks`

## Current Campaign Semantics

The source of truth for the default open campaign is:

- `groups/{groupId}.currentCampaignId`

Rules:

- may be `null`
- if set, must reference an `active` campaign
- only one current campaign exists per group

When a campaign is made current:

- if it is `draft`, it becomes `active`
- if it is `inactive`, it becomes `active`
- previous current campaign becomes `inactive`

## Permissions Model

Current product direction is trust-based, not adversarial.

Working rules:

- any group member can create a draft campaign
- creator of a draft becomes that campaign's GM
- draft is private to its GM
- any campaign GM can make that campaign current
- invites can be sent by group members

The current design intentionally does not introduce `campaignMembership`.

## Why Campaign Membership Is Deferred

It is not needed for the current operating model because:

- active/current campaigns are group-shared
- draft campaigns are private to their GM
- inactive campaigns are shared history
- opting out of a group's campaigns is handled by leaving the group

This may need to change later if the product needs:

- co-GM private draft collaboration
- per-campaign player rosters
- campaign-specific access control

## User-Scoped Campaign UI State

The current app stores campaign-local user state in:

- `users/{userId}/campaignMemberships/{campaignId}`

Examples already in use:

- `currentCharacterId`
- `lastSeenCliffhangerNoteId`

This no longer fits the new model cleanly as-is.

Open design question:

Where should per-user campaign UI state live in the new model?

Candidate directions:

- `users/{userId}/groups/{groupId}/campaignState/{campaignId}` style index
- `groups/{groupId}/members/{userId}` for group-level defaults plus a nested campaign state area
- a new dedicated per-user per-campaign state collection

This should be resolved before implementation work begins on migrated reads.

## API Implications

The current summary ingestion endpoint writes directly to a campaign path.

That endpoint must eventually become group-aware and campaign-explicit.

Important rule for future ingestion:

- external workflows must target a specific campaign
- writes should not infer a destination from whichever campaign is current

This is especially important because campaigns from different groups or systems may coexist in the app.

## Migration Framing

The app has one real live group using it today.

That simplifies the first migration significantly:

- existing live campaign data can be treated as belonging to one implicit group
- the initial migration wraps that world in one explicit `group`

The application code speaks only the nested structure. It does not retain a legacy read path for top-level `campaigns/{campaignId}` data. Migration is a one-time offline data transform that reshapes the old data into the new structure before the app is repointed at it — it is not a runtime compatibility concern.

High-level migration direction:

1. take a full backup of the live data
2. create one group
3. copy the live campaign's data into the nested group campaign path, reshaped to the new structure
4. derive group memberships from current campaign membership data
5. repoint the app at the migrated group; delete the inert top-level data once the migration is trusted

This document does not specify the cutover sequence, only that it is a deliberate, supervised, planned-downtime event run between sessions.

## Main Backend Risks

- correctness of the one-time migration data transform (mitigated by a pre-migration backup and a supervised between-sessions cutover)
- deciding where per-user campaign UI state belongs
- updating security rules from campaign-scoped membership to group-scoped membership plus campaign ownership
- preventing external API writes from targeting the wrong campaign

## Next Backend Decisions

- resolve `gmUserId` vs `gmUserIds`
- resolve per-user campaign UI state location
- define exact old-to-new collection mapping
- define security rule model for groups, drafts, and inactive campaigns
