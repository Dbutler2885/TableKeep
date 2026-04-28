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
- its current GM/prep owner in the first version

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

The design does not currently require campaign-specific membership documents.

## Why Campaign Membership Is Not Included Yet

`campaignMembership` is intentionally excluded from the first target model.

Reason:

- all group members participate in the group's active campaign
- draft campaigns are private to their creator/GM before they go live
- the current requirement does not need per-campaign player rosters or collaborative private prep
- leaving the group is the way a user opts out entirely
- private prep is modeled by campaign lifecycle state, not by separate campaign membership records

This may need to change later if the app needs:

- multiple private co-GMs on a draft
- per-campaign player lists
- campaign-specific visibility rules

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

That means the initial migration can treat the existing app data as belonging to one implicit group and wrap that data in the new structure.

High-level migration shape:

- create one group
- move or copy the current live campaign into `groups/{groupId}/campaigns/{campaignId}`
- derive group members from the existing campaign membership data
- update the app to navigate through `group -> current campaign`

This document does not define the cutover sequence. That should be handled in a separate migration plan.

## Open Questions

- Should campaign ownership remain `gmUserId`, or should it become `gmUserIds` sooner?
- Should inactive campaigns be visible to all group members by default, or only when explicitly browsed?
- Should the app keep a user-scoped membership index for convenience, even if group membership is the source of truth?
- Where should per-user campaign UI state live in the new model:
  - current character
  - last seen cliffhanger
  - future campaign-local preferences

## Out of Scope For This Document

- exact migration script mechanics
- security rules redesign
- final UI flows and modal copy
- external summary ingestion contract
- system-specific sheet architecture details
