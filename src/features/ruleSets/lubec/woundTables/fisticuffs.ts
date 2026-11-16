import type { LubecWoundTable } from './types'

// Generated once from lubec-hit-location-tables/report.md, section 3, "Fisticuffs" (PROVISIONAL DRAFT).
// This file is now the source: edit a row here to change the game.
export const LUBEC_FISTICUFFS_TABLE: LubecWoundTable = {
  key: 'fisticuffs',
  name: 'Fisticuffs',
  locations: [
    {
      parts: ["head"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Rocked", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Cover up / flinch", "text": "Next attack at Disadvantage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Seeing stars", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Knocked down", "text": ""},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Minor Concussion", "text": "", "save": {"successTrauma": 0, "success": "Only Dazed, and 0 Trauma instead of +1.", "failure": "Minor Concussion, which is Dazed and -10 Handle until a Long Rest."}},
        {"impact": 6, "severity": "Serious", "trauma": 1, "name": "Eye / face injury", "text": "-20 Handle on ranged and visually precise actions until recovered."},
        {"impact": 7, "severity": "Serious", "trauma": 1, "name": "Broken jaw or cheekbone", "text": "Lose the next Action Stage. Speech and eating badly impaired.", "injury": "Broken jaw"},
        {"impact": 8, "severity": "Severe", "trauma": 2, "name": "Severe Concussion", "text": "", "save": {"successTrauma": 1, "success": "A Minor Concussion instead (Dazed and -10 Handle until a Long Rest), and +1 Trauma instead of +2.", "failure": "Dazed and -40 Handle; after a Long Rest the penalty steps down to -10, and after a second Long Rest it clears."}},
        {"impact": 9, "severity": "Severe", "trauma": 2, "name": "Knocked unconscious", "text": "Out of the fight; concussion consequences afterward.", "out": true},
        {"impact": 10, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Catastrophic head injury", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["neck"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Off balance", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Flinch", "text": "Next attack at Disadvantage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Choking", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Knocked down, gagging", "text": ""},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Throat punch", "text": "Dazed. Speech hoarse until a Long Rest."},
        {"impact": 6, "severity": "Serious", "trauma": 1, "name": "Wrenched neck", "text": "-20 Handle on upper-body actions until recovered."},
        {"impact": 7, "severity": "Serious", "trauma": 1, "name": "Wrenched neck", "text": "-20 Handle on upper-body actions until recovered."},
        {"impact": 8, "severity": "Severe", "trauma": 2, "name": "Blow to the side of the neck", "text": "Knocked unconscious.", "out": true},
        {"impact": 9, "severity": "Severe", "trauma": 2, "name": "Blow to the side of the neck", "text": "Knocked unconscious.", "out": true},
        {"impact": 10, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Catastrophic neck injury", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["torso"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Driven back", "text": "Knocked back out of striking reach. Lose the next Movement Stage, so the attacker chooses whether to step in and attack again or keep them back."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Cover up", "text": "Next attack at Disadvantage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Winded", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Doubled over", "text": "Knocked down."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Breath knocked out", "text": "Dazed."},
        {"impact": 6, "severity": "Serious", "trauma": 1, "name": "Rib injury", "text": "Badly bruised or cracked ribs. Disadvantage on Strength and Speed Checks involving strenuous exertion. Half Movement. No Evasive Movement."},
        {"impact": 7, "severity": "Serious", "trauma": 1, "name": "Broken rib(s)", "text": "Physical Checks involving exertion at Disadvantage. Half Movement. No Evasive Movement or heavy lifting.", "injury": "Broken ribs"},
        {"impact": 8, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Body shot drop", "text": "Knocked down and Dazed. Disadvantage on all physical Checks until a Long Rest."},
      ],
    },
    {
      parts: ["waist"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Driven back", "text": "Knocked back out of striking reach. Lose the next Movement Stage, so the attacker chooses whether to step in and attack again or keep them back."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Cover up", "text": "Next attack at Disadvantage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Winded", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Doubled over", "text": "Knocked down."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Breath knocked out", "text": "Dazed."},
        {"impact": 6, "severity": "Serious", "trauma": 1, "name": "Body injury", "text": "Disadvantage on physical Checks involving exertion. Another Serious-or-worse physical wound before a Long Rest needs a Body Save or the victim is Dazed."},
        {"impact": 7, "severity": "Serious", "trauma": 1, "name": "Liver or kidney shot", "text": "Knocked down, then Body injury: Disadvantage on physical Checks involving exertion. Another Serious-or-worse physical wound before a Long Rest needs a Body Save or the victim is Dazed."},
        {"impact": 8, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Body shot drop", "text": "Knocked down and Dazed. Disadvantage on all physical Checks until a Long Rest."},
      ],
    },
    {
      parts: ["groin"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Off line", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Flinch", "text": "Next attack at Disadvantage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Winded", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 4, "orMore": true, "severity": "Serious", "trauma": 1, "name": "Groin shot", "text": "Knocked down and Dazed."},
      ],
    },
    {
      parts: ["upperarm"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Arm knocked aside", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Arm knocked aside", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Arm knocked aside", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Shoulder injury", "text": "-20 Handle on fighting, grappling, climbing, throwing and other upper-body actions. Two-handed actions likewise."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Shoulder injury", "text": "-20 Handle on fighting, grappling, climbing, throwing and other upper-body actions. Two-handed actions likewise."},
        {"impact": 6, "severity": "Serious", "trauma": 1, "name": "Shoulder injury", "text": "-20 Handle on fighting, grappling, climbing, throwing and other upper-body actions. Two-handed actions likewise."},
        {"impact": 7, "orMore": true, "severity": "Serious", "trauma": 1, "name": "Dislocated shoulder", "text": "Arm unusable until the shoulder is reduced, then -20 Handle on actions with that arm until recovered.", "injury": "Dislocated shoulder"},
      ],
    },
    {
      parts: ["forearm"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Arm knocked aside", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Arm knocked aside", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Arm knocked aside", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Hand / wrist injury", "text": "If the fiction has not set which hand, roll d4: 1-2 other hand, 3-4 dominant hand. -20 Handle (dominant) or -10 (other) on actions with that hand. A penalty, not a ban: the character can still punch, shoot, grapple, reload and use tools."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Hand / wrist injury", "text": "If the fiction has not set which hand, roll d4: 1-2 other hand, 3-4 dominant hand. -20 Handle (dominant) or -10 (other) on actions with that hand. A penalty, not a ban: the character can still punch, shoot, grapple, reload and use tools."},
        {"impact": 6, "severity": "Serious", "trauma": 1, "name": "Hand / wrist injury", "text": "If the fiction has not set which hand, roll d4: 1-2 other hand, 3-4 dominant hand. -20 Handle (dominant) or -10 (other) on actions with that hand. A penalty, not a ban: the character can still punch, shoot, grapple, reload and use tools."},
        {"impact": 7, "orMore": true, "severity": "Serious", "trauma": 1, "name": "Broken forearm", "text": "Arm unusable for fighting, climbing, carrying or heavy work until treated.", "injury": "Broken arm"},
      ],
    },
    {
      parts: ["hand"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Arm knocked aside", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Arm knocked aside", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Arm knocked aside", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Hand / wrist injury", "text": "If the fiction has not set which hand, roll d4: 1-2 other hand, 3-4 dominant hand. -20 Handle (dominant) or -10 (other) on actions with that hand. A penalty, not a ban: the character can still punch, shoot, grapple, reload and use tools."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Hand / wrist injury", "text": "If the fiction has not set which hand, roll d4: 1-2 other hand, 3-4 dominant hand. -20 Handle (dominant) or -10 (other) on actions with that hand. A penalty, not a ban: the character can still punch, shoot, grapple, reload and use tools."},
        {"impact": 6, "severity": "Serious", "trauma": 1, "name": "Hand / wrist injury", "text": "If the fiction has not set which hand, roll d4: 1-2 other hand, 3-4 dominant hand. -20 Handle (dominant) or -10 (other) on actions with that hand. A penalty, not a ban: the character can still punch, shoot, grapple, reload and use tools."},
        {"impact": 7, "orMore": true, "severity": "Serious", "trauma": 1, "name": "Fractured hand / wrist", "text": "The hand is badly compromised. -40 Handle on actions with that hand. No heavy grip or precise work with it until treated.", "injury": "Broken hand"},
      ],
    },
    {
      parts: ["thigh"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Off balance", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Off balance", "text": "Lose the next Movement Stage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Dead leg", "text": "Next Speed Check at Disadvantage."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Legs kicked out", "text": "Knocked down."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Legs kicked out", "text": "Knocked down."},
        {"impact": 6, "severity": "Serious", "trauma": 1, "name": "Dead leg", "text": "Half Movement until a Long Rest."},
        {"impact": 7, "orMore": true, "severity": "Serious", "trauma": 1, "name": "Leg buckles", "text": "Knocked down, then half Movement until a Long Rest."},
      ],
    },
    {
      parts: ["shin", "feet"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Off balance", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Off balance", "text": "Lose the next Movement Stage."},
        {"impact": 3, "severity": "Minor", "trauma": 0, "name": "Dead leg", "text": "Next Speed Check at Disadvantage."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Legs kicked out", "text": "Knocked down."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Legs kicked out", "text": "Knocked down."},
        {"impact": 6, "severity": "Serious", "trauma": 1, "name": "Knee / ankle injury", "text": "Half Movement. No Evasive Movement."},
        {"impact": 7, "orMore": true, "severity": "Serious", "trauma": 1, "name": "Fractured or dislocated knee / ankle", "text": "Knocked down. Half Movement after standing. No Evasive Movement until treated.", "injury": "Damaged knee or ankle"},
      ],
    },
  ],
}
