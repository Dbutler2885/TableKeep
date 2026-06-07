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

The design has no `campaignMembership` (settled — see "No Campaign Membership").

## No Campaign Membership (Resolved)

There is no `campaignMembership` and no campaign-level `members` collection. This is
settled, not deferred. The three facts and their single sources of truth:

- **Access**: `groups/{groupId}/members/{userId}`. Grants the group and all its
  campaigns. Security rules read only this for group/campaign access.
- **GM**: `campaigns/{campaignId}.gmUserId` — exactly one user id, never an array.
- **Participation**: implicit — a player participates iff they own a character in the
  campaign. No roster. Sitting out = no character, while staying a group member.

`role`/`status`/`username` are never copied onto a campaign-level doc. "Who is
actively playing" is derived from character ownership, never a membership collection.

## User-Scoped Campaign UI State (Resolved)

Per-user campaign UI state lives in:

- `groups/{groupId}/campaigns/{campaignId}/userState/{userId}`

Fields (private scratch only):

- `currentCharacterId`
- `lastSeenCliffhangerNoteId`

Rules: owner-only read/write (`request.auth.uid == userId`). The collection is named
`userState`, not `members`, specifically so it is never mistaken for membership or
access. The legacy `users/{userId}/campaignMemberships/{campaignId}` location is
removed; the migration maps it directly to `userState/{userId}` (UI fields only).

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
- updating security rules to group-scoped membership plus single-GM campaign ownership
- preventing external API writes from targeting the wrong campaign

## Next Backend Work

The data model is frozen (see resolved sections above). Remaining items are
implementation following from it, not open design:

- define exact old-to-new collection mapping and write the migration script
- define the security rule model: group access via `groups/{groupId}/members/{userId}`,
  GM-only writes via `campaigns/{campaignId}.gmUserId`, `userState/{userId}` owner-only
- verify the invite flow end to end
