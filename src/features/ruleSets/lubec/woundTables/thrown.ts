import type { LubecWoundTable } from './types'

// Generated once from lubec-hit-location-tables/report.md, section 3, "Thrown Objects" (PROVISIONAL DRAFT).
// This file is now the source: edit a row here to change the game.
export const LUBEC_THROWN_TABLE: LubecWoundTable = {
  key: 'thrown',
  name: 'Thrown Objects',
  locations: [
    {
      parts: ["head"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Ducked into it", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Rock to the head, Minor Concussion", "text": "", "save": {"successTrauma": 0, "success": "Only Dazed, and 0 Trauma instead of +1.", "failure": "Minor Concussion, which is Dazed and -10 Handle until a Long Rest."}},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Struck in the face", "text": "Dazed. -20 Handle on ranged and visually precise actions until recovered."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Broken nose or cheekbone", "text": "Lose the next Action Stage. Visually precise actions at Disadvantage until treated.", "injury": "Broken jaw"},
        {"impact": 5, "severity": "Severe", "trauma": 2, "name": "Severe Concussion", "text": "", "save": {"successTrauma": 1, "success": "A Minor Concussion instead (Dazed and -10 Handle until a Long Rest), and +1 Trauma instead of +2.", "failure": "Dazed and -40 Handle; after a Long Rest the penalty steps down to -10, and after a second Long Rest it clears."}},
        {"impact": 6, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Skull fracture", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["neck"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Clipped", "text": "Next attack at Disadvantage."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Wrenched neck", "text": "Lose the next Movement Stage. -20 Handle on upper-body actions until recovered."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Throat strike", "text": "Lose the next Action Stage, choking."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Bruised windpipe", "text": "Lose the next Action Stage. Speech badly impaired. Half Movement. No Evasive Movement."},
        {"impact": 5, "severity": "Severe", "trauma": 2, "name": "Fractured larynx", "text": "Dazed. Disadvantage on all physical Checks. Bleeding timer (the airway is swelling shut): +1 Trauma in d4 turns unless First Aid.", "injury": "Damaged throat"},
        {"impact": 6, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Crushed windpipe or broken neck", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["torso"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Thump", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Winded", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Bruised ribs", "text": "Disadvantage on Strength and Speed Checks involving exertion. Half Movement. No Evasive Movement."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Broken rib(s)", "text": "Physical Checks involving exertion at Disadvantage. Half Movement. No Evasive Movement or heavy lifting.", "injury": "Broken ribs"},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Broken rib(s)", "text": "Knocked down. Physical Checks involving exertion at Disadvantage. Half Movement. No Evasive Movement or heavy lifting.", "injury": "Broken ribs"},
        {"impact": 6, "severity": "Severe", "trauma": 2, "name": "Caved ribs", "text": "Dazed. Half Movement. Disadvantage on Strength Checks and Body Saves. Strenuous exertion is impossible.", "injury": "Broken ribs"},
        {"impact": 7, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Crushed chest or stopped heart", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["waist"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Thump in the gut", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Doubled over", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Body injury", "text": "Disadvantage on physical Checks involving exertion. Another Serious-or-worse physical wound before a Long Rest needs a Body Save or the victim is Dazed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Body injury", "text": "Disadvantage on physical Checks involving exertion. Another Serious-or-worse physical wound before a Long Rest needs a Body Save or the victim is Dazed."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Kidney blow", "text": "Dazed, then the Body injury above."},
        {"impact": 6, "severity": "Severe", "trauma": 2, "name": "Internal bleeding", "text": "Disadvantage on all physical Checks. Bleeding timer: +1 Trauma in d4 turns unless First Aid.", "injury": "Internal injury"},
        {"impact": 7, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Ruptured liver or spleen", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["groin"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Flinch", "text": "Next attack at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Flinch", "text": "Next attack at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Groin strike", "text": "Knocked down and Dazed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Groin strike", "text": "Knocked down and Dazed."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Damaged hip", "text": "Half Movement. No Evasive Movement."},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Broken pelvis", "text": "Knocked down. Crawl only without help. Disadvantage on all physical Checks.", "injury": "Broken pelvis"},
      ],
    },
    {
      parts: ["upperarm"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Stinger", "text": "Next attack at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Numb arm", "text": "Next roll using that arm at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Shoulder injury", "text": "-20 Handle on fighting, grappling, climbing, throwing and other upper-body actions. Two-handed actions likewise."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Shoulder injury", "text": "-20 Handle on fighting, grappling, climbing, throwing and other upper-body actions. Two-handed actions likewise."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Dislocated shoulder", "text": "Arm unusable until reduced, then -20 Handle with that arm until recovered.", "injury": "Dislocated shoulder"},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Broken collarbone", "text": "Arm unusable; if forced, -40 Handle. Lose the next Action Stage.", "injury": "Broken arm"},
      ],
    },
    {
      parts: ["forearm"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Blocked it", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Knocked loose", "text": "Whatever that hand holds is dropped unless a Handle Check succeeds."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Forearm injury", "text": "-20 Handle (dominant side) or -10 (other side) on actions with that hand."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Forearm injury", "text": "-20 Handle (dominant side) or -10 (other side) on actions with that hand."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Broken forearm", "text": "Arm unusable for fighting, climbing, carrying or heavy work until treated.", "injury": "Broken arm"},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Shattered forearm", "text": "Arm unusable; if forced, -40 Handle. Lose the next Action Stage.", "injury": "Broken arm"},
      ],
    },
    {
      parts: ["hand"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Stung hand", "text": "Next roll with that hand at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Knocked loose", "text": "Whatever that hand holds is dropped unless a Handle Check succeeds."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Jammed fingers", "text": "-20 Handle (dominant) or -10 (other) on actions with that hand."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Jammed fingers", "text": "-20 Handle (dominant) or -10 (other) on actions with that hand."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Fractured hand / wrist", "text": "-40 Handle with that hand. No heavy grip or precise work with it until treated.", "injury": "Broken hand"},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Crushed hand", "text": "Hand unusable until real medical care. Lose the next Action Stage.", "injury": "Broken hand"},
      ],
    },
    {
      parts: ["thigh"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Thump", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Dead leg", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Deep thigh bruise", "text": "Half Movement until a Long Rest. No Evasive Movement."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Deep thigh bruise", "text": "Half Movement until a Long Rest. No Evasive Movement."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Leg buckles", "text": "Knocked down, then the deep thigh bruise above."},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Broken thighbone", "text": "Knocked down. Crawl only without help. Disadvantage on all physical Checks.", "injury": "Broken leg"},
      ],
    },
    {
      parts: ["shin", "feet"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Barked shin / stubbed foot", "text": "Next Speed Check at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Barked shin / stubbed foot", "text": "Next Speed Check at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Knee / ankle injury", "text": "Half Movement. No Evasive Movement."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Knee / ankle injury", "text": "Half Movement. No Evasive Movement."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Fractured or dislocated knee / ankle", "text": "Knocked down. Half Movement after standing. No Evasive Movement until treated.", "injury": "Damaged knee or ankle"},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Shattered knee, shin or ankle", "text": "Knocked down. Crawl only without help.", "injury": "Broken leg"},
      ],
    },
  ],
}
