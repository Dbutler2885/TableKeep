# Group / Campaign UI Flow

## Purpose

Capture the intended user flow for moving through:

- account without a group
- group selection
- group home
- current campaign workspace
- draft creation
- campaign switching

This document is UI-first and should inform the backend model, not the other way around.

## Core Navigation Model

The app is now organized in four layers:

1. user
2. group
3. campaign
4. campaign workspace

The navigation rule is:

- if a selected group has a current campaign, open that campaign by default
- the user must go back from the campaign workspace to reach group-level management

## Entry States

### Signed-in user with no groups

Landing screen:

- `Group Picker`

Primary states:

- `No groups yet`
- pending invites, if any

Actions:

- accept invite
- decline invite
- create group

There is no code-based or email-based invite flow in the current design.
Invites are in-app and username-based.

### Signed-in user with groups

Landing screen:

- `Group Picker`, unless a later optimization auto-enters the last-used group

Each group card should show:

- group name
- user relationship to the group, if needed
- current campaign summary if one exists
- `No current campaign` if none exists

## Group Picker

Purpose:

- choose which social space to enter
- accept or decline pending invitations
- create a new group

Required content:

- signed-in username
- pending invites section, if any
- list of groups
- create group action

Recommended invite interaction:

- invite card shows group name and inviter
- explicit `Accept` and `Decline` actions

## Group Home

Purpose:

- manage the group
- browse campaign states
- create new draft campaigns
- review membership and invites

Important:

- `Group Home` is not only a fallback for groups with no current campaign
- it remains the management layer even when a current campaign exists

Sections:

- current campaign
- my drafts
- inactive campaigns
- members
- invites

Core actions:

- `+ New draft`
- browse inactive campaigns
- invite member by username

## Current Campaign Behavior

If a group has `currentCampaignId`, opening that group should land the user in the current campaign workspace immediately.

The campaign workspace should show:

- group context
- current campaign name
- campaign shell navigation

Back navigation should return to `Group Home`, not to the group picker.

## No Current Campaign State

When a group has no current campaign:

- opening the group should land on `Group Home`
- the current campaign panel should explicitly say there is no current campaign
- any member should still be able to create a new draft
- any member should be able to browse inactive campaigns

## Draft Campaigns

Draft campaigns are private to their creator and invisible to other group members.

Creation flow:

1. user enters a group
2. user opens `Group Home`
3. user clicks `+ New draft`
4. user enters campaign name and system
5. campaign is created as `draft`
6. creator becomes that campaign's GM
7. creator is taken into the draft workspace

Draft properties:

- private to the creating GM
- not current
- not visible to other members

## Making A Campaign Current

`Make current` is the main campaign promotion action.

It should:

- promote `draft -> active` if needed
- promote `inactive -> active` if needed
- set `group.currentCampaignId`
- move the previously current campaign to `inactive`

This should be one action, not multiple actions.

### Confirmation

The action should be confirmed when replacing an existing current campaign.

The warning should communicate:

- which campaign is current now
- which campaign will become current
- that group members will land in the new current campaign
- that the change is reversible

## Inactive Campaigns

Inactive campaigns are:

- shared
- browsable
- not default

Users should be able to open an inactive campaign and see the normal campaign workspace.

The main behavior change from current/active mode is:

- players cannot edit their character sheets

Otherwise, players should be able to browse whatever they had access to when that campaign was active.

That includes:

- session summaries
- maps they could see
- NPCs they could see
- any other player-visible campaign content

## Invite Flow

Invites are in-app and username-based.

Assumptions:

- invited users already have accounts
- invited users already have usernames
- invited users may currently belong to zero groups

Send flow:

1. member opens `Group Home`
2. member clicks `Invite member`
3. member enters a username
4. app validates that the target username exists
5. invite is created

Receive flow:

1. invited user signs in
2. invited user lands on `Group Picker`
3. pending invite is shown
4. user accepts or declines
5. on accept, group membership is created

## Suggested Primary Screens

- `Group Picker`
- `Create Group`
- `Group Home`
- `Campaign Workspace`
- `Campaign List`
- `Create Draft Campaign`
- `Make Current Confirmation`

## Open UI Questions

- should the app auto-enter the last-used group, or always show the picker first?
- where should inactive campaigns live in the group home layout relative to current campaign and drafts?
- should inactive campaign browsing be launched from a list section or a dedicated campaign browser screen?
- what exact affordance should return the user from campaign workspace to group home on mobile vs desktop?
