# Combat & System Design Requirements
_Captured 2026-02-28_

---

## Map / Combat UI Needs

### Save Rolls
- Players and GM need to roll saves directly from the map UI
- Dropdown to select save type (D/W/P/B/S), no physical dice or external roller needed
- Results saved to a session log

### Per-Attack Bonuses & Penalties
- GM needs to apply a bonus or penalty to a specific attack or save in the moment
- Example: "you're aiming for the eye, that's −6 to attack"
- Communicated verbally by GM, applied in the UI by player or GM

### Skip Turns
- Need the ability to skip a character's turn in the initiative order
- Use cases: charmed character, stunned, etc.

### Token Actions During Combat
- GM can move tokens to represent charm effects (e.g. move charmed PC toward the nixie)
- GM can add new tokens mid-combat to represent summoned creatures (e.g. giant bass)
  — no need to mechanize summoning, just add the token at the table

---

## Items Tab (New)

- GM creates and manages items
- Item fields: name, type (weapon / armor / consumable / magic / misc), description, gp value, stats
- Items can be possessed/carried by monsters or characters
- Monster sheet gets a "Carries / Drops" multi-select field linked to the Items tab
- TT field (existing) stays — references OSE random treasure table, rolled during play
- Specific Drops (new) = named items this monster actually carries, linked to Items tab
- Separate tab, similar scope to the Monsters tab

### Scope Clarification (2026-02-28)
- Do **not** build a separate "Equipment Catalog" tab right now.
- Mundane weapons/armor can stay book-referenced for now (OSE tables used at the table).
- Items tab focus: special/custom items (especially unique magic/story items).
- Regular bandit/monster/NPC mundane gear can be assigned in monster/NPC workflows later, without making those weapons user-authored Items entries.

### Planned Follow-On (Out of Current Items-Tab Build)
- Monster/NPC tabs: add "Carries" fields so holders can have specific item records attached.
- For holder-specific variants (e.g. a particular +1 sword carried by one NPC), store that as the carried instance tied to that holder.
- Map layer: support ground/ambient loot entities so map-placed objects and dropped objects share pickup flow.
- Corpse/loot pickup flow: when a monster/NPC dies, offer a transfer action to assign dropped items to a PC inventory (exact UX TBD).
- Keep treasure tables and treasure-value drops separate from concrete item objects.

---

## What Does NOT Need to Be Mechanized

| Thing | How to Handle Instead |
|---|---|
| Summoning (e.g. nixie → giant bass) | GM adds token at the table |
| Water breathing | Narrative / story only |
| Charm movement | GM moves token toward charmer |
| Location attack penalties (mouth/eye) | GM calls penalty verbally, applied via in-combat bonus UI |
| Complex group abilities (e.g. 10 nixies for charm) | GM judgment at the table |
| STR drain (e.g. Dragon venom) | Not yet mechanized — gap noted for future on-hit effects |
| Breath weapon "remaining HP as damage" | Trait card text, GM narrates and calls saves |
