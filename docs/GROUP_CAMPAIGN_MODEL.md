# Group / Campaign Model Design

## Purpose

Define the target domain model for evolving Home Boys House from a single live campaign app into a multi-group, multi-campaign app while preserving a simple operating model for the current active game.

This document is intentionally about shape and concepts first. It is not yet an implementation plan.

## Current Reality

Today the app is effectively organized around a single active campaign:

- top-level `campaigns/{campaignId}`
- campaign-owned subcollections under that campaign
- user-scoped campaign state under `users/{userId}/campaignMemberships/{campaignId}`

This works for one live game, but it breaks down for:

- users who belong to multiple groups
- groups with multiple campaigns over time
- campaigns using different game systems
- external workflows posting data into the wrong campaign

## Design Goals

- A user can exist without belonging to any group.
- A user can belong to multiple groups.
- A group is the stable social container.
- A group can have multiple campaigns over time.
- A campaign belongs to exactly one group.
- A campaign owns its game system.
- A group has at most one current campaign at a time.
- A new campaign can be prepared privately before becoming current.
- Previously run campaigns can stop being current and later become current again.
- The model should support trust-based collaboration without requiring heavy governance workflows.

Non-goal for this phase:

- A group does not own a game system. System belongs to campaign.

## Core Concepts

### User

A platform-level identity that exists independently of groups and campaigns.

A user may belong to zero, one, or many groups.

Essential fields:

- `email`
- `username`
- `createdAt`
- `updatedAt`
- `lastLoginAt`

Not part of the essential model right now:

- `photoURL`
- `displayName`
- profile decoration fields

### Group

The stable social container. A group is the thing a person belongs to over time.

A group owns:

- its identity
- its members
- its invites
- its list of campaigns
- a pointer to the current campaign

Essential fields:

- `name`
- `slug`
- `currentCampaignId`
- `createdBy`
- `createdAt`
- `updatedAt`

### Group Membership

The relationship between a user and a group.

Source of truth should be group-scoped membership documents, not arrays on user or group docs.

Essential fields:

- `userId`
- `role`
- `status`
- `joinedAt`
- `updatedAt`

Initial model:

- keep `role` simple, likely `member`
- leave room for `admin` later if needed

### Group Invite

The path by which a non-member becomes a member of a group.

Essential fields:

- `groupId`
- `createdBy`
- `email`
- `status`
- `createdAt`
- `expiresAt`
- `acceptedByUserId`

### Campaign

A specific game instance inside a group.

A campaign owns:

- its system
- its game data
- its lifecycle state
- its single GM/prep owner (`gmUserId`, exactly one user — never an array)

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

`system` examples:

- `ose`
- `vtm`

## Campaign Lifecycle

Campaign status is:

- `draft`
- `active`
- `inactive`

Meaning:

### `draft`

- private prep state
- not group-visible in ordinary use
- not current
- visible to the campaign GM/creator

### `active`

- available to the group
- eligible to be current
- may be current or not current

### `inactive`

- not current
- still part of the group's campaign history
- can become active/current again later
- not treated as permanently archived

Rule:

- `groups.currentCampaignId` must be `null` or point to an `active` campaign

## Current Campaign

Current-ness belongs to the group, not the campaign.

Source of truth:

- `groups/{groupId}.currentCampaignId`

This is preferred over an `isCurrent` boolean on campaigns because:

- only one current campaign is allowed
- a single pointer is easier to reason about
- it avoids drift between multiple campaign docs

## Visibility and Trust Model

The current product direction is trust-first, with UX safeguards against accidental actions.

Working assumptions:

- users in a group are trusted collaborators
- accidental switching is a UX problem first, not a complex permissions problem
- any campaign GM can make their campaign current
- campaign switching should be made explicit in the UI
- switching current is reversible; the group can switch back easily if someone changes it unintentionally

Operational rule for v1:

- any campaign GM can make their campaign current
- current campaign switching is not treated as an adversarial permission problem
- the product should focus on making the effect of switching clear before the action is confirmed

The design has no campaign-specific membership documents (settled — see
"Membership, Participation, and Per-User State").

## Membership, Participation, and Per-User State (Resolved)

There is no `campaignMembership` concept, and there is no campaign-level `members`
collection. This is a settled decision, not a deferral.

Three distinct facts, three distinct homes — each with exactly one source of truth:

- **Access** is `groups/{groupId}/members/{userId}`. Being in this collection grants
  access to the group and every campaign in it. Security rules consult only this for
  group/campaign access.
- **GM** is `campaigns/{campaignId}.gmUserId` — a single user id, never an array.
  This is the only signal of GM-ness.
- **Participation** is implicit: a player is participating in a campaign if and only
  if they own a character in it. There is no roster, flag, or join record. Sitting a
  campaign out means simply not having a character; the user stays a group member.

`role`, `status`, and `username` are never duplicated onto a campaign-level doc.
Role-in-group lives in group members; GM lives on the campaign doc; username lives
in `users/{userId}`.

Any "who is actively playing" logic derives from character ownership in the
campaign, never from a membership-style collection.

## Target Firestore Shape

### Top-level

- `users/{userId}`
- `groups/{groupId}`

### Group-owned

- `groups/{groupId}/members/{userId}`
- `groups/{groupId}/invites/{inviteId}`
- `groups/{groupId}/campaigns/{campaignId}`

### Campaign-owned

Under:

- `groups/{groupId}/campaigns/{campaignId}/...`

Store:

- `characters`
- `sessionSummaries`
- `npcs`
- `maps`
- `items`
- `tables`
- `userState/{userId}` — private per-user UI scratch only: `currentCharacterId`,
  `lastSeenCliffhangerNoteId`. Owner-read/write only. There is deliberately no
  campaign-level `members` collection; `userState` is named to make clear it is
  scratch, not membership or access.

Map-owned subcollections can stay nested under maps:

- `tokens`
- `annotations`
- `fogChunks`

## Migration Implications

There is already one active live campaign using the current schema.

That means the migration problem is not theoretical. Existing live data must be preserved.

Important simplification:

- there is currently one real group using the app
- that live group is the only production group that needs to be wrapped into the new model initially

That means the initial migration can treat the existing app data as belonging to one implicit group and reshape it into the new structure.

Decided approach:

- The application code speaks only the nested structure. It does not read or write top-level `campaigns/{campaignId}` data, and it carries no dual-path / legacy-read compatibility.
- Migration is a one-time, offline data transform, not a code compatibility concern. The migration script reshapes the old data so it already looks like new-structure data before the app ever points at it.
- The cutover is a deliberate, supervised, planned-downtime event run between sessions, with a full backup taken first. Rollback is "restore the backup," not "fall back to legacy reads."

High-level migration shape:

- create one group
- copy the live campaign's data into `groups/{groupId}/campaigns/{campaignId}/...` in the new structure
- derive group members from the existing campaign membership data
- repoint the app at the migrated group; the old top-level data becomes inert and is deleted once the migration is trusted

This document does not define the cutover sequence. That should be handled in a separate migration plan.

## Resolved Decisions

- Campaign ownership stays `gmUserId` — exactly one GM, never `gmUserIds`.
- Per-user campaign UI state lives in `groups/{groupId}/campaigns/{campaignId}/userState/{userId}`
  (current character, last seen cliffhanger). No user-scoped membership index is kept;
  group membership is the only access source of truth.
- There is no campaign-level `members` collection and no `campaignMembership` concept;
  participation is character ownership.

Still treated as separate work (not open design questions):

- inactive-campaign default visibility is a UI/UX detail, resolved in the UI flow doc
- security rules, the migration script, and invite-flow verification follow from the
  decisions above

## Out of Scope For This Document

- exact migration script mechanics
- security rules redesign
- final UI flows and modal copy
- external summary ingestion contract
- system-specific sheet architecture details
