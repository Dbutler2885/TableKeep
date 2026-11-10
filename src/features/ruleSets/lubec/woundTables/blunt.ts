import type { LubecWoundTable } from './types'

// Generated once from lubec-hit-location-tables/report.md, section 3, "Blunt Force" (PROVISIONAL DRAFT).
// This file is now the source: edit a row here to change the game.
export const LUBEC_BLUNT_TABLE: LubecWoundTable = {
  key: 'blunt',
  name: 'Blunt Force',
  locations: [
    {
      parts: ["head"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Rocked", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Minor Concussion", "text": "", "save": {"successTrauma": 0, "success": "Only Dazed, and 0 Trauma instead of +1.", "failure": "Now: Dazed. Lasting: -10 Handle. After 1 Long Rest: healed."}},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Eye / face injury", "text": "Now: Dazed. Lasting: -20 Handle on ranged and visually precise actions. After 1 Long Rest: healed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Broken jaw or cheekbone", "text": "Now: Lose the next Action Stage. Lasting (Broken jaw): Speech and eating badly impaired. After 1 Long Rest: healed.", "injury": "Broken jaw"},
        {"impact": 5, "severity": "Severe", "trauma": 2, "name": "Severe Concussion", "text": "", "save": {"successTrauma": 1, "success": "A Minor Concussion instead, and +1 Trauma instead of +2: Now: Dazed. Lasting: -10 Handle. After 1 Long Rest: healed.", "failure": "Now: Dazed. Lasting: -40 Handle. After 1 Long Rest: -10 Handle. After 2 Long Rests: healed."}},
        {"impact": 6, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Skull fracture", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["neck"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Clipped", "text": "Next attack at Disadvantage."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Wrenched neck", "text": "Now: Lose the next Movement Stage. Lasting: -20 Handle on upper-body actions. After 1 Long Rest: healed."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Throat strike", "text": "Lose the next Action Stage, choking."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Bruised windpipe", "text": "Now: Lose the next Action Stage. Lasting: Speech badly impaired. Half Movement. No Evasive Movement. After 1 Long Rest: healed."},
        {"impact": 5, "severity": "Severe", "trauma": 2, "name": "Fractured larynx", "text": "Now: Dazed. Bleeding timer (the airway is swelling shut): +1 Trauma in d4 turns unless First Aid. Lasting (Damaged throat): Speech badly impaired. Disadvantage on all physical Checks. After 1 Long Rest: speech badly impaired only. After 2 Long Rests: healed.", "injury": "Damaged throat"},
        {"impact": 6, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Broken neck or crushed windpipe", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["torso"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Driven back", "text": "Knocked back out of striking reach. Lose the next Movement Stage, so the attacker chooses whether to step in and attack again or keep them back."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Winded", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Bruised ribs", "text": "Lasting: Disadvantage on Strength and Speed Checks involving exertion. No Evasive Movement. After 1 Long Rest: healed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Broken rib(s)", "text": "Lasting (Broken ribs): Physical Checks involving exertion at Disadvantage. Half Movement. No Evasive Movement or heavy lifting. After 1 Long Rest: healed.", "injury": "Broken ribs"},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Broken rib(s)", "text": "Now: Knocked down. Lasting (Broken ribs): Physical Checks involving exertion at Disadvantage. Half Movement. No Evasive Movement or heavy lifting. After 1 Long Rest: healed.", "injury": "Broken ribs"},
        {"impact": 6, "severity": "Severe", "trauma": 2, "name": "Caved ribs", "text": "Now: Dazed. Lasting (Broken ribs): Strength Checks automatically fail. Half Movement. No Evasive Movement. After 1 Long Rest: as Broken rib(s) at Impact 4. After 2 Long Rests: healed.", "injury": "Broken ribs"},
        {"impact": 7, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Crushed chest, stopped heart or broken upper back", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["waist"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Doubled over", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Gut punch", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Body injury", "text": "Lasting: Disadvantage on physical Checks involving exertion. Another Serious-or-worse physical wound in that time needs a Body Save or the victim is Dazed. After 1 Long Rest: healed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Body injury", "text": "Lasting: Disadvantage on physical Checks involving exertion. Another Serious-or-worse physical wound in that time needs a Body Save or the victim is Dazed. After 1 Long Rest: healed."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Kidney blow", "text": "Now: Dazed. Lasting: the Body injury above. After 1 Long Rest: healed."},
        {"impact": 6, "severity": "Severe", "trauma": 2, "name": "Internal bleeding", "text": "Now: Bleeding timer: +1 Trauma in d4 turns unless First Aid. Lasting (Internal injury): Disadvantage on all physical Checks. After 1 Long Rest: as Body injury at Impact 3. After 2 Long Rests: healed.", "injury": "Internal injury"},
        {"impact": 7, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Ruptured liver or spleen, or broken lower spine", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["groin"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Off line", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Flinch", "text": "Next attack at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Groin strike", "text": "Knocked down and Dazed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Groin strike", "text": "Knocked down and Dazed."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Damaged hip", "text": "Lasting: Half Movement. No Evasive Movement. After 1 Long Rest: healed."},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Broken pelvis", "text": "Now: Knocked down. Lasting (Broken pelvis): Crawl only without help. Disadvantage on all physical Checks. After 1 Long Rest: as Damaged hip at Impact 5. After 2 Long Rests: healed.", "injury": "Broken pelvis"},
      ],
    },
    {
      parts: ["upperarm"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Stinger", "text": "Next attack at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Numb arm", "text": "Next roll using that arm at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Shoulder injury", "text": "Lasting: -20 Handle on fighting, grappling, climbing, throwing and other upper-body actions, and on two-handed actions. After 1 Long Rest: healed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Shoulder injury", "text": "Lasting: -20 Handle on fighting, grappling, climbing, throwing and other upper-body actions, and on two-handed actions. After 1 Long Rest: healed."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Dislocated shoulder", "text": "Lasting (Dislocated shoulder): Arm unusable until reduced, then -20 Handle with that arm. After 1 Long Rest: healed.", "injury": "Dislocated shoulder"},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Broken upper arm or collarbone", "text": "Now: Lose the next Action Stage. Lasting (Broken arm): Arm unusable; if forced, -40 Handle. After 1 Long Rest: as Shoulder injury at Impact 3. After 2 Long Rests: healed.", "injury": "Broken arm"},
      ],
    },
    {
      parts: ["forearm"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Stinger", "text": "Next attack with that arm at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Knocked loose", "text": "Whatever that hand holds is dropped unless a Handle Check succeeds."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Forearm injury", "text": "Lasting: -20 Handle (dominant side) or -10 (other side) on actions with that hand. After 1 Long Rest: healed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Forearm injury", "text": "Lasting: -20 Handle (dominant side) or -10 (other side) on actions with that hand. After 1 Long Rest: healed."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Broken forearm", "text": "Lasting (Broken arm): Arm unusable for fighting, climbing, carrying or heavy work. After 1 Long Rest: healed.", "injury": "Broken arm"},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Shattered forearm (bone through skin)", "text": "Now: Bleeding timer: +1 Trauma in d4 turns unless First Aid. Lasting (Broken arm): Arm unusable; if forced, -40 Handle. After 1 Long Rest: as Broken forearm at Impact 5. After 2 Long Rests: healed.", "injury": "Broken arm"},
      ],
    },
    {
      parts: ["hand"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Stung hand", "text": "Next roll with that hand at Disadvantage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Knocked loose", "text": "Whatever that hand holds is dropped unless a Handle Check succeeds."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Hand / wrist injury", "text": "Lasting: -20 Handle (dominant) or -10 (other) on actions with that hand. After 1 Long Rest: healed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Hand / wrist injury", "text": "Lasting: -20 Handle (dominant) or -10 (other) on actions with that hand. After 1 Long Rest: healed."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Fractured hand / wrist", "text": "Lasting (Broken hand): -40 Handle with that hand. No heavy grip or precise work with it. After 1 Long Rest: healed.", "injury": "Broken hand"},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Crushed hand", "text": "Now: Lose the next Action Stage. Lasting (Broken hand): Hand unusable. After 1 Long Rest: as Fractured hand / wrist at Impact 5. After 2 Long Rests: healed.", "injury": "Broken hand"},
      ],
    },
    {
      parts: ["thigh"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Driven back", "text": "Knocked back out of striking reach. Lose the next Movement Stage, so the attacker chooses whether to step in and attack again or keep them back."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Dead leg", "text": "Next relevant physical Check at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Deep thigh bruise", "text": "Lasting: Half Movement. No Evasive Movement. After 1 Long Rest: healed."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Deep thigh bruise", "text": "Lasting: Half Movement. No Evasive Movement. After 1 Long Rest: healed."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Leg buckles", "text": "Now: Knocked down. Lasting: the deep thigh bruise above. After 1 Long Rest: healed."},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Broken thighbone", "text": "Now: Knocked down. Lasting (Broken leg): Crawl only without help. Disadvantage on all physical Checks. After 1 Long Rest: as Deep thigh bruise at Impact 3. After 2 Long Rests: healed.", "injury": "Broken leg"},
      ],
    },
    {
      parts: ["shin", "feet"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Off balance", "text": "Lose the next Movement Stage."},
        {"impact": 2, "severity": "Minor", "trauma": 0, "name": "Barked shin / stamped foot", "text": "Next Speed Check at Disadvantage."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Swept", "text": "Knocked down."},
        {"impact": 4, "severity": "Serious", "trauma": 1, "name": "Knee / ankle injury", "text": "Lasting: Half Movement. No Evasive Movement. After 1 Long Rest: healed."},
        {"impact": 5, "severity": "Serious", "trauma": 1, "name": "Fractured or dislocated knee / ankle", "text": "Now: Knocked down. Lasting (Damaged knee or ankle): Half Movement. No Evasive Movement. After 1 Long Rest: healed.", "injury": "Damaged knee or ankle"},
        {"impact": 6, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Shattered knee, shin or ankle", "text": "Now: Knocked down. Lasting (Broken leg): Crawl only without help. After 1 Long Rest: as Knee / ankle injury at Impact 4. After 2 Long Rests: healed.", "injury": "Broken leg"},
      ],
    },
  ],
}
