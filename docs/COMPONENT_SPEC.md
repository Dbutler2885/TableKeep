# Component Specification (Flow Layer)

## AppShell
Responsibilities:
- Role-aware shell frame
- Header + sign-out
- Responsive navigation mode switch (sidebar/drawer)

Props/state:
- `role`
- `activeTab`
- `setActiveTab`

## NavigationMenu
Responsibilities:
- Render top-level nav items
- Highlight active item
- Trigger tab changes

Items:
- Character
- Maps
- NPCs
- Notes
- Rules

## CharacterHome
Responsibilities:
- Render character selector control
- Default selected character logic
- Render character sheet container

Dependencies:
- Character list source (campaign-scoped)
- Current user identity

## ContentPlaceholder Components (v1 shell)
- `MapsScreen`
- `NpcsScreen`
- `NotesScreen`
- `RulesScreen`

Purpose:
- Maintain flow continuity while detailed features are built next.

## Deferred Components
- FogMapCanvas
- TokenLayer
- NotesTimeline
- ImageRevealManager
- RulesPdfViewer
