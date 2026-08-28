import type { ClassFeature } from './characterTabTypes'

export const classOptions = [
  '-',
  'Cleric',
  'Dwarf',
  'Elf',
  'Fighter',
  'Halfling',
  'Magic-User',
  'Thief',
]
export const classFeaturesByClass: Record<string, ClassFeature[]> = {
  Cleric: [
    { id: 'turn-undead', name: 'Turn Undead', unlockedAt: 1, summary: 'Attempt to repel or destroy undead (2d6 turn roll; may turn or destroy).' },
    { id: 'use-divine-items', name: 'Use Divine Magic Items', unlockedAt: 2, summary: 'Can use cleric scrolls and items restricted to divine spellcasters.' },
    {
      id: 'magical-research',
      name: 'Magical Research',
      unlockedAt: 1,
      summary: 'May research new divine spells or deity-related magical effects.',
      summaryLinks: [
        {
          word: 'research',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Magical_Research',
        },
      ],
    },
    { id: 'religious-obligation', name: 'Religious Obligation', unlockedAt: 1, summary: 'Must remain faithful to deity/alignment tenets to avoid penalties.' },
    {
      id: 'divine-spellcasting',
      name: 'Divine Spellcasting',
      unlockedAt: 2,
      summary: 'Begins at level 2; memorizes cleric spells. Requires a holy symbol to use divine powers.',
      summaryLinks: [
        {
          word: 'cleric spells',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Cleric_Spells',
        },
        {
          word: 'holy symbol',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Adventuring_Gear',
        },
      ],
    },
    { id: 'create-magic-items', name: 'Create Magic Items', unlockedAt: 9, summary: 'Can create magic items starting at level 9.' },
    { id: 'establish-stronghold', name: 'Establish Stronghold', unlockedAt: 9, summary: 'May build a temple/stronghold; favored deity may reduce costs and grant followers.' },
  ],
  Dwarf: [
    {
      id: 'infravision',
      name: 'Infravision',
      unlockedAt: 1,
      summary: 'Can see in darkness up to 60 feet.',
    },
  ],
  Elf: [
    {
      id: 'arcane-spellcasting',
      name: 'Arcane Spellcasting',
      unlockedAt: 1,
      summary: 'Casts arcane spells from the magic-user spell list. Uses a spell book to memorize spells.',
      summaryLinks: [
        {
          word: 'magic-user spell list',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Magic-User_Spells',
        },
        {
          word: 'spells',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Spells',
        },
      ],
    },
    {
      id: 'magical-research',
      name: 'Magical Research',
      unlockedAt: 1,
      summary: 'May perform arcane magical research at any level.',
      summaryLinks: [
        {
          word: 'research',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Magical_Research',
        },
      ],
    },
    {
      id: 'use-arcane-items',
      name: 'Use Arcane Magic Items',
      unlockedAt: 1,
      summary: 'May use arcane scrolls and magic wands.',
    },
    {
      id: 'infravision',
      name: 'Infravision',
      unlockedAt: 1,
      summary: 'Can see in darkness up to 60 feet.',
    },
    {
      id: 'ghoul-paralysis-immunity',
      name: 'Immunity to Ghoul Paralysis',
      unlockedAt: 1,
      summary: 'Completely immune to the paralysis caused by ghouls.',
    },
  ],
  Fighter: [
    {
      id: 'stronghold',
      name: 'Stronghold',
      unlockedAt: 1,
      summary: 'Any time a fighter wishes (and has sufficient money), they can build a castle or stronghold and control the surrounding lands.',
      summaryLinks: [
        {
          word: 'build',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Construction',
        },
        {
          word: 'castle or stronghold',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Structures',
        },
        {
          word: 'control the surrounding lands',
          url: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Domain_Management',
        },
      ],
    },
  ],
  Halfling: [
    {
      id: 'defensive-bonus',
      name: 'Defensive Bonus',
      unlockedAt: 1,
      summary: '+2 AC vs large opponents (creatures larger than human-sized).',
    },
    {
      id: 'hiding',
      name: 'Hiding',
      unlockedAt: 1,
      summary: '90% chance to hide in woods or undergrowth. 2-in-6 chance to hide in dungeons with cover if motionless and silent.',
    },
    {
      id: 'missile-attack-bonus',
      name: 'Missile Attack Bonus',
      unlockedAt: 1,
      summary: '+1 to attack rolls with all missile weapons.',
    },
    {
      id: 'stronghold',
      name: 'Stronghold',
      unlockedAt: 1,
      summary: 'May build a halfling community (shire) when they have sufficient money. The leader of the community is called the Sheriff.',
    },
  ],
  'Magic-User': [
    {
      id: 'arcane-spellcasting',
      name: 'Arcane Spellcasting',
      unlockedAt: 1,
      summary: 'Casts arcane spells from the magic-user spell list. Uses a spell book to memorize spells. Begins play with one spell in the spell book.',
    },
    {
      id: 'magical-research',
      name: 'Magical Research',
      unlockedAt: 1,
      summary: 'May conduct magical research at any level to invent spells or magical effects.',
    },
    {
      id: 'use-arcane-items',
      name: 'Use Arcane Magic Items',
      unlockedAt: 1,
      summary: 'May use scrolls of spells on the magic-user spell list. May use items restricted to arcane spellcasters (e.g., wands).',
    },
    {
      id: 'weapon-armour-restriction',
      name: 'Weapon and Armour Restriction',
      unlockedAt: 1,
      summary: 'May use daggers only. Cannot wear armour or use shields.',
    },
  ],
  Thief: [
    {
      id: 'back-stab',
      name: 'Back-stab',
      unlockedAt: 1,
      summary: 'When attacking an unaware opponent from behind, a thief receives a +4 bonus to hit and doubles any damage dealt.',
    },
    {
      id: 'combat',
      name: 'Combat',
      unlockedAt: 1,
      summary: 'Valuing stealth above all, thieves can only wear leather armour and cannot use shields. They can use any weapon.',
    },
    {
      id: 'read-languages',
      name: 'Read Languages',
      unlockedAt: 4,
      summary: 'A thief of 4th level or higher can read non-magical text in any language (including dead languages and basic codes) with 80% probability. If the roll fails, the thief may not try to read the same text again before gaining an experience level.',
    },
    {
      id: 'thief-skills',
      name: 'Thief Skills',
      unlockedAt: 1,
      summary: 'See the Thief Skills section for the skill breakdown and apply points.',
    },
  ],
}

export const levelUpFlavorByClass: Record<string, string> = {
  Cleric: 'Your faith deepens, and divine authority grows with your experience.',
  Dwarf: 'Your hard-earned craft and battle discipline make you even tougher underground.',
  Elf: 'Your ancient training sharpens both steel and spell.',
  Fighter: 'Your battlefield instincts sharpen, and your martial edge grows deadlier.',
  Halfling: 'Your luck and precision carry you safely through impossible danger.',
  'Magic-User': 'Arcane patterns become clearer as your command of magic expands.',
  Thief: 'Your timing, nerve, and finesse improve with every risky score.',
}

export const levelUpChecklistForClass = (className: string, hitDie: number | null): string[] => {
  const steps = [`Roll 1d${hitDie ?? '?'} for hit points and add that to your HP total.`]
  if (className === 'Cleric') {
    steps.push('Review your cleric spell access and update what is memorized for the day.')
    return steps
  }
  if (className === 'Magic-User') {
    steps.push('Review spell slots and adjust memorized spells for your new level.')
    steps.push('Check your spell book for what can now be prepared or transcribed.')
    return steps
  }
  if (className === 'Thief') {
    steps.push('Review thief skills and assign any newly available progression points.')
    return steps
  }
  if (className === 'Fighter') {
    steps.push('Review attack profile and class combat benefits unlocked at this level.')
    return steps
  }
  if (className === 'Dwarf' || className === 'Elf' || className === 'Halfling') {
    steps.push('Review race-class abilities that scale with level and update sheet details.')
    return steps
  }
  return steps
}

export const alignmentOptions = ['Law', 'Neutrality', 'Chaos']

export const unlockedClassFeaturesForClass = (className: string, level: number): ClassFeature[] =>
  (classFeaturesByClass[className] ?? [])
    .filter((feature) => level >= feature.unlockedAt)
    .sort((a, b) => a.unlockedAt - b.unlockedAt)

