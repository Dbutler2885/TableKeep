# Firebase Security Rules Plan

## Security Objectives
- Users can only access campaigns they belong to.
- Player can write only their own character sheet.
- GM has campaign-wide write authority.
- Players cannot access unrevealed images or GM-only map state.
- API/automation endpoints use explicit auth strategy.

## Role Model
Membership docs:
- Canonical campaign membership: `campaigns/{campaignId}/members/{uid}`
- User-scoped membership index: `users/{uid}/campaignMemberships/{campaignId}`

Helper predicates (conceptual):
- `isSignedIn()`
- `isMember(campaignId)`
- `isGM(campaignId)`
- `isPlayer(campaignId)`
- `isCharacterOwner(campaignId, characterId)`

## Firestore Rule Plan by Collection

### `campaigns/{campaignId}`
- Read: members only
- Write:
  - Create: signed-in users
  - Update/delete: GM only

### `members`
- Read: members only
- Write:
  - GM manages memberships
  - User can read own membership

### `users/{uid}/campaignMemberships`
- Read: user owns path
- Write:
  - user self-write for bootstrap
  - GM write for membership management

### `characters`
- Read: members only
- Create: GM or self for own character (choose one implementation path)
- Update:
  - GM can update any
  - Player only if `request.auth.uid == ownerUserId`
- Delete: GM only

### `maps`
- Read: members only
- Write: GM only

### `maps/{mapId}/tokens`
- Read: members only
- Write: GM only (v1)

### `maps/{mapId}/fogChunks`
- Read: members only
- Write: GM only

### `images`
- Read:
  - GM: all
  - Player: only where `revealed == true`
- Write: GM only

### `referenceDocs`
- Read:
  - GM: all
  - Player: only where `visibleToPlayers == true`
- Write: GM only

### `sessionSummaries`
- Read: members only
- Write:
  - GM manual posts
  - API posts via privileged function (Admin SDK bypasses rules)

### `sharedNotes`
- Read: members only
- Write: GM only (v1)

## Storage Rule Plan
- Validate campaign membership from Firestore membership docs.
- Map/reference/image uploads: GM only.
- Portrait upload:
  - GM any portrait
  - Player only under their own character path (optional for v1 simplicity)
- Player reads only revealed/publicly visible content via metadata checks in Firestore or naming + signed URL strategy.

## API Posting Security for Session Summaries
Preferred v1:
- HTTP function protected by a static secret in header (`X-Internal-Api-Key`) stored in function config.
- Optional second layer: Firebase Auth ID token from GM account.

Rationale:
- Simple external posting from local scripts while avoiding public unauthenticated writes.

## Validation Rules
- Enforce immutable ownership fields where needed (`ownerUserId`, `createdAt`).
- Validate role enum values.
- Validate coordinate ranges for tokens.
- Validate max lengths on markdown/text fields to reduce abuse.

## Open Risk
- Firestore rules can become complex around dynamic visibility; if complexity grows, shift sensitive writes to callable/HTTP functions.
