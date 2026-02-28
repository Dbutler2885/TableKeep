# Items Tab Operation Steps
_Captured 2026-02-28_

## Scope Intent
- Build the Items tab in phases.
- Prioritize form and data shape before persistence.
- Defer map/ruleset integration until core item workflow is stable.

## Clarification: "Model Cross-Links"
- "Cross-links" means storing relationships between entities by ID, not by free text.
- Example: monster carries item via `itemId` reference, not `"Longsword"` string.
- Benefit: avoids rename breakage and supports filtering/searching later.

## Phase 1: Form First (No Persistence Yet)
- Create Items tab UI and route entry.
- Build compact, space-efficient list + detail layout matching Monsters tab style.
- Implement required item fields as structured controls:
  - `name` (text)
  - `type` (enum: weapon | armor | consumable | magic | misc)
  - `description` (text/textarea)
  - `gpValue` (number)
  - `stats` (structured key/value controls; avoid unbounded random text)
- Use local state only while schema is still changing.
- Add inline validation for obvious constraints (required name, numeric gp >= 0, etc.).

## Phase 2: Item Data Object Definition
- Freeze the first stable TypeScript shape for `ItemRecord`.
- Separate machine fields from display/helper text.
- Keep field names canonical and explicit (no overloaded generic blobs unless intentional).
- Define defaults/template creator (like `newItemTemplate()`).

## Phase 3: Carry / Drop Workflow Model
- Design ownership/possession model after item shape is stable.
- Add references for:
  - Character inventory links
  - Monster carries/specific drops links
- Start with simple relations (item IDs + quantity + notes), then expand if needed.
- Keep TT/random treasure logic separate from specific item links.

## Phase 4: Persistence Layer
- Add Firestore schema/docs only after field model stabilizes.
- Persist items and possession links with campaign scope.
- Add migration-safe guards for optional/new fields.

## Phase 5: Ruleset + Map Integration
- Wire item effects to ruleset-specific behavior incrementally.
- Add map/combat hooks only for immediate value use-cases.
- Keep non-mechanized behavior narrative/GM-driven until rules interactions are clearly defined.

## Done Criteria by Phase
- Phase 1 done: Items form is usable and compact; editing works in local state.
- Phase 2 done: `ItemRecord` is stable enough that field churn is low.
- Phase 3 done: Monsters/characters can reference items consistently.
- Phase 4 done: Reloading preserves items and links.
- Phase 5 done: Key map/ruleset touchpoints consume the persisted item model.
