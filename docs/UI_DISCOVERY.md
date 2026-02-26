# UI Discovery Interview

## Date
February 26, 2026

## Objective
Define v1 app layout and navigation flow for Home Boys House before deep component behavior work.

## Decisions Captured

### Navigation Structure
- Mobile: side drawer navigation.
- Desktop: left sidebar navigation.

### Player Entry Flow
- On login, player lands on character selector view.
- Default selected character is player's own created character.
- Main content defaults to character sheet.
- User can switch to other characters via dropdown/select control.

### Primary Navigation Order
- Character
- Maps
- NPCs
- Notes
- Rules

### Visual Direction
- Clean modern interpretation of OSE styling.
- Use OSE-inspired palette and restrained visual language.
- Black lines/borders, clear hierarchy, clean text.
- Decently sized headers.

## Deferred (Intentional)
The following are explicitly postponed until after overall app flow is implemented:
- Map interaction details
- Density tuning
- Mobile gesture behavior on map
- Notes information architecture details
- GM image reveal interaction details
- Final typography fine-tuning

## Notes from User
- Prioritize flow over polish details.
- Build required surfaces first, then iterate visually.
