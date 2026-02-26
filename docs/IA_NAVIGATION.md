# Information Architecture & Navigation

## App Shell
- Header
  - App title
  - Account identity
  - Sign out
- Navigation
  - Desktop: left sidebar
  - Mobile: drawer
- Content area
  - Active screen panel

## Top-Level Screens
1. Character (default)
2. Maps
3. NPCs
4. Notes
5. Rules

## Character Screen IA
- Character selector (dropdown)
- Character sheet content
- Future: character portrait + editable sections

## Navigation State Rules
- Default route after login: `Character`
- Selected character persists during session (v1 in-memory is acceptable)
- Tab switch preserves current campaign context

## Future IA Extensions
- GM-only admin tools section
- Session summary timeline refinement
- Map-specific sub-navigation
