import type { LubecWoundTable } from './types'

// Generated once from lubec-hit-location-tables/report.md, section 3, "Gunshot" (PROVISIONAL DRAFT).
// This file is now the source: edit a row here to change the game.
export const LUBEC_GUNSHOT_TABLE: LubecWoundTable = {
  key: 'gunshot',
  name: 'Gunshot',
  locations: [
    {
      parts: ["head"],
      rows: [
        {"impact": 1, "severity": "Serious", "trauma": 1, "name": "Bullet glances off the skull", "text": "Minor Concussion.", "save": {"successTrauma": 0, "success": "Only Dazed, and 0 Trauma instead of +1.", "failure": "Minor Concussion, which is Dazed and -10 Handle until a Long Rest."}},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Face, jaw or ear wound", "text": "Lose the next Action Stage. Speech badly impaired. -20 Handle on ranged and visually precise actions until treated."},
        {"impact": 3, "severity": "Severe", "trauma": 2, "name": "Skull hit", "text": "Severe Concussion.", "save": {"successTrauma": 1, "success": "A Minor Concussion instead (Dazed and -10 Handle until a Long Rest), and +1 Trauma instead of +2.", "failure": "Dazed and -40 Handle; after a Long Rest the penalty steps down to -10, and after a second Long Rest it clears."}},
        {"impact": 4, "severity": "Critical", "trauma": 2, "name": "Bullet in the skull", "text": "Lose the next Action Stage. Death Save in d4 turns unless stabilized."},
        {"impact": 5, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Brain", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["neck"],
      rows: [
        {"impact": 1, "severity": "Serious", "trauma": 1, "name": "Bleeding graze", "text": "Bleeding timer: +1 Trauma in d4 turns unless First Aid."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Through the side of the neck", "text": "Lose the next Action Stage. Bleeding timer."},
        {"impact": 3, "severity": "Severe", "trauma": 2, "name": "Windpipe hit", "text": "Whisper only. Disadvantage on all physical Checks. Bleeding timer; after stabilization, physical Checks stay at Disadvantage until a Long Rest.", "injury": "Damaged throat"},
        {"impact": 4, "severity": "Critical", "trauma": 2, "name": "Neck artery or vein", "text": "Lose the next Action Stage. Death Save in d4 turns unless stabilized."},
        {"impact": 5, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Spine or neck vessels destroyed", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["torso"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Graze across the ribs", "text": "Disadvantage on the next physical roll."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Flesh wound or Bleeding wound", "text": "", "choices": [{"name": "Flesh wound", "text": "Disadvantage on strenuous physical Checks until a Long Rest."}, {"name": "Bleeding wound", "text": "Bleeding timer."}]},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Bullet along the ribs or Lodged bullet", "text": "", "choices": [{"name": "Bullet along the ribs", "text": "Disadvantage on physical Checks; half Movement and no Evasive Movement."}, {"name": "Lodged bullet", "text": "-20 Strength and Speed for exertion until proper medical treatment; First Aid stabilizes but cannot remove it.", "injury": "Lodged object"}]},
        {"impact": 4, "severity": "Severe", "trauma": 2, "name": "Shot through the chest", "text": "Half Movement. Disadvantage on Strength Checks and Body Saves. Strenuous exertion impossible.", "injury": "Chest wound"},
        {"impact": 5, "severity": "Critical", "trauma": 2, "name": "Lung or major vessel", "text": "Lose the next Action Stage. Death Save in d4 turns unless stabilized."},
        {"impact": 6, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Heart or upper spine", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["waist"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Graze across the side", "text": "Disadvantage on the next physical roll."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Flesh wound through the side or Bleeding wound", "text": "", "choices": [{"name": "Flesh wound through the side", "text": "Disadvantage on strenuous physical Checks until a Long Rest."}, {"name": "Bleeding wound", "text": "Bleeding timer."}]},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Bullet through the side muscles or Lodged bullet", "text": "", "choices": [{"name": "Bullet through the side muscles", "text": "Disadvantage on physical Checks; half Movement and no Evasive Movement."}, {"name": "Lodged bullet", "text": "-20 Strength and Speed for exertion until proper medical treatment; First Aid stabilizes but cannot remove it.", "injury": "Lodged object"}]},
        {"impact": 4, "severity": "Severe", "trauma": 2, "name": "Gut shot", "text": "Disadvantage on all physical Checks. Bleeding timer.", "injury": "Internal injury"},
        {"impact": 5, "severity": "Critical", "trauma": 2, "name": "Liver, kidney or bowel", "text": "Lose the next Action Stage. Death Save in d4 turns unless stabilized."},
        {"impact": 6, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Main artery or lower spine", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["groin"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Graze", "text": "Disadvantage on the next physical roll."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Hip flesh wound", "text": "Half Movement until treated and recovered."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Heavy bleeding", "text": "Bleeding timer."},
        {"impact": 4, "severity": "Severe", "trauma": 2, "name": "Shattered hip or pelvis", "text": "Knocked down. Crawl only without help.", "injury": "Broken pelvis"},
        {"impact": 5, "severity": "Critical", "trauma": 2, "name": "Big artery at the groin", "text": "Lose the next Action Stage. Death Save in d4 turns unless stabilized."},
        {"impact": 6, "orMore": true, "severity": "Catastrophic", "trauma": 4, "name": "Pelvic vessels destroyed", "text": "Immediate Death Save."},
      ],
    },
    {
      parts: ["upperarm"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Graze", "text": "Disadvantage on the next physical roll."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Arm wound", "text": "Through-and-through muscle wound. -20 Handle with that arm until treated and recovered."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Damaged shoulder", "text": "-20 Handle with that arm. Strenuous use impossible until treated."},
        {"impact": 4, "severity": "Severe", "trauma": 2, "name": "Shattered arm", "text": "Unusable for force or precision; if forced, -40 Handle.", "injury": "Broken arm"},
        {"impact": 5, "orMore": true, "severity": "Critical", "trauma": 2, "name": "Armpit artery, or into the chest under the shoulder", "text": "Lose the next Action Stage. Death Save in d4 turns unless stabilized."},
      ],
    },
    {
      parts: ["forearm"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Graze", "text": "Next roll with that arm at Disadvantage."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Arm wound", "text": "-20 Handle with that arm until treated and recovered."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Chipped bone", "text": "-20 Handle with that arm. Bleeding timer."},
        {"impact": 4, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Shattered forearm", "text": "Unusable for force or precision; if forced, -40 Handle.", "injury": "Broken arm"},
      ],
    },
    {
      parts: ["hand"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Nicked hand", "text": "Next roll with that hand at Disadvantage. Whatever it holds is dropped unless a Handle Check succeeds."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Damaged hand / wrist", "text": "-20 Handle with that hand."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Fingers or wrist bones hit", "text": "-40 Handle with that hand. No heavy grip or precise work with it until treated.", "injury": "Broken hand"},
        {"impact": 4, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Shattered hand", "text": "Hand unusable; if forced, -40 Handle.", "injury": "Broken hand"},
      ],
    },
    {
      parts: ["thigh"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Graze", "text": "Disadvantage on the next physical roll."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Leg wound", "text": "Half Movement until treated and recovered."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Leg wound near the hip or knee or Heavy bleeding", "text": "", "choices": [{"name": "Leg wound near the hip or knee", "text": "Half Movement; no Evasive Movement."}, {"name": "Heavy bleeding", "text": "Bleeding timer."}]},
        {"impact": 4, "severity": "Severe", "trauma": 2, "name": "Shattered leg", "text": "Knocked down. Crawl only without help.", "injury": "Broken leg"},
        {"impact": 5, "orMore": true, "severity": "Critical", "trauma": 2, "name": "Thigh artery", "text": "Lose the next Action Stage. Death Save in d4 turns unless stabilized."},
      ],
    },
    {
      parts: ["shin", "feet"],
      rows: [
        {"impact": 1, "severity": "Minor", "trauma": 0, "name": "Graze", "text": "Disadvantage on the next physical roll."},
        {"impact": 2, "severity": "Serious", "trauma": 1, "name": "Leg / foot wound", "text": "Half Movement until treated and recovered."},
        {"impact": 3, "severity": "Serious", "trauma": 1, "name": "Knee / ankle wound", "text": "Half Movement. No Evasive Movement."},
        {"impact": 4, "orMore": true, "severity": "Severe", "trauma": 2, "name": "Shattered knee, shin or ankle", "text": "Knocked down. Crawl only without help.", "injury": "Broken leg"},
      ],
    },
  ],
}
