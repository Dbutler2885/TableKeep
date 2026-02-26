# Firestore Data Model (Draft)

## Design Principles
- Campaign-scoped multi-tenancy from day one.
- Role checks based on campaign membership.
- Keep frequently updated entities in separate documents/subcollections.

## Collections

### `users/{userId}`
Profile and preferences.

Fields:
- `displayName: string`
- `email: string`
- `photoURL: string | null`
- `createdAt: timestamp`
- `lastLoginAt: timestamp`

Subcollections:

#### `users/{userId}/campaignMemberships/{campaignId}`
User-scoped membership index used by app reads and security checks.

Fields:
- `campaignId: string`
- `userId: string`
- `role: 'gm' | 'player'`
- `status: 'active' | 'inactive'`
- `joinedAt: timestamp`

### `campaigns/{campaignId}`
Core campaign/module container.

Fields:
- `name: string`
- `slug: string`
- `status: 'active' | 'archived'`
- `createdBy: userId`
- `createdAt: timestamp`
- `updatedAt: timestamp`
- `activeMapId: string | null`

Subcollections:

#### `campaigns/{campaignId}/members/{userId}`
Fields:
- `role: 'gm' | 'player'`
- `joinedAt: timestamp`
- `displayNameOverride: string | null`

#### `campaigns/{campaignId}/characters/{characterId}`
Fields:
- `ownerUserId: userId`
- `name: string`
- `class: string`
- `level: number`
- `xp: number`
- `attributes: object` (STR/INT/WIS/DEX/CON/CHA)
- `saves: object`
- `hp: object` (current/max)
- `ac: number`
- `inventory: array`
- `spells: array`
- `customSections: array` (title/content blocks)
- `portraitPath: string | null` (Storage path)
- `isActive: boolean`
- `createdAt: timestamp`
- `updatedAt: timestamp`
- `updatedBy: userId`

#### `campaigns/{campaignId}/maps/{mapId}`
Fields:
- `name: string`
- `imagePath: string` (Storage path)
- `width: number`
- `height: number`
- `fogEnabled: boolean`
- `fogGridSize: number` (e.g., 128)
- `gmOnlyNotes: string | null`
- `createdAt: timestamp`
- `updatedAt: timestamp`

Subcollections under map:

##### `tokens/{tokenId}`
Fields:
- `name: string`
- `icon: 'pawn' | string`
- `x: number` (normalized 0..1)
- `y: number` (normalized 0..1)
- `color: string`
- `createdAt: timestamp`
- `updatedAt: timestamp`
- `updatedBy: userId`

##### `fogChunks/{chunkId}`
Fields:
- `chunkX: number`
- `chunkY: number`
- `bitset: string` (base64 compressed cells)
- `revision: number`
- `updatedAt: timestamp`
- `updatedBy: userId`

#### `campaigns/{campaignId}/images/{imageId}`
Fields:
- `title: string`
- `imagePath: string`
- `revealed: boolean`
- `sortOrder: number`
- `createdAt: timestamp`
- `updatedAt: timestamp`

#### `campaigns/{campaignId}/referenceDocs/{docId}`
Fields:
- `title: string`
- `pdfPath: string`
- `visibleToPlayers: boolean`
- `createdAt: timestamp`
- `updatedAt: timestamp`

#### `campaigns/{campaignId}/sessionSummaries/{summaryId}`
Fields:
- `sessionNumber: number | null`
- `title: string`
- `summaryMarkdown: string`
- `postedBy: userId | 'api'`
- `sourceType: 'manual' | 'api'`
- `createdAt: timestamp`

#### `campaigns/{campaignId}/sharedNotes/{noteId}`
Fields:
- `title: string`
- `contentMarkdown: string`
- `createdAt: timestamp`
- `updatedAt: timestamp`
- `updatedBy: userId`

## Indexing (Expected)
- `campaigns` by `slug`
- `campaigns/{id}/members` by `role`
- `campaigns` by `createdBy`
- `sessionSummaries` by `createdAt desc`
- `images` by `revealed, sortOrder`
- `referenceDocs` by `visibleToPlayers`

## Storage Paths
- `campaigns/{campaignId}/maps/{mapId}`
- `campaigns/{campaignId}/portraits/{characterId}`
- `campaigns/{campaignId}/images/{imageId}`
- `campaigns/{campaignId}/references/{docId}`

## Notes
- Keep each fog chunk document well below Firestore doc size limits.
- For future transcript/Q&A, add separate `transcripts` and `embeddings` pipeline collections later.
