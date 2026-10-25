// Transcribed from the standalone Lubec sheet
// (combined-character-sheet-prototype.html); Table Keep owns this copy.
// The words the Skills page's detail bar shows for a skill; nothing reads them for rules.

export type LubecSkillText = {
  description: string
  /** What a kid with the skill always has, or null when nothing comes with it. */
  always: string | null
  /** Things a kid with the skill might own. */
  kit: readonly string[]
}

export const LUBEC_SKILL_TEXT: Readonly<Record<string, LubecSkillText>> = {
  'Local Lore': {
    description:
      'Local history, customs, families, stories, landmarks, rumors, and knowledge of the community - who is related to whom, who used to live where, and what people around town remember.',
    always: null,
    kit: [],
  },
  'Campcraft': {
    description:
      'Fire, shelter, knots, simple tools, basic woodcraft, and practical competence outdoors. The sort of things learned from Scouts, family, or spending a lot of time in the woods.',
    always: null,
    kit: ['A knapped flint and an antler tool', 'A bow drill you made', 'A Svea brass camp stove', 'A pup tent', 'A lean-to camp you built in the woods', "A Hudson's Bay wool blanket"],
  },
  'Hunting': {
    description:
      'Hunting game, reading sign, staying concealed from animals, playing the wind, fieldcraft, and competent use of your familiar hunting rifle.',
    always: "Your rifle: a .22, or Dad's .30-30 you're allowed to take",
    kit: ['A box of shells', 'Binoculars', 'A rifle scope', 'A tree stand you built', 'A skinning knife', 'A key to the deer camp up the woods road'],
  },
  'Boatwork': {
    description:
      'Operating and working from small boats: skiffs, outboards, anchoring, towing, lines, traps, hauling, and understanding what boats are doing on the water.',
    always: "The family skiff with an outboard. It isn't yours to use freely; how often you get it is negotiated with the GM",
    kit: ['A grapple hook on a line', 'A string of your own lobster traps (student license)', 'A VHF radio on the skiff', 'An annotated chart of the bay', 'A spotlight for night running', 'A spare outboard'],
  },
  'Tides & Flats': {
    description:
      'Intimate knowledge of the shore, mudflats, tides, currents, seaweed, exposed ground, and when the water is coming back. Also applies to moving safely and effectively through the intertidal environment.',
    always: null,
    kit: ['Chest waders', 'A clam buyer who pays cash, no questions'],
  },
  'Swimming': {
    description:
      'Strong swimming ability, including difficult or cold-water swimming and keeping yourself or someone else afloat under pressure.',
    always: null,
    kit: [],
  },
  'Jury-Rigging': {
    description:
      'Making something work with inadequate tools, spare parts, improvised materials, and whatever happens to be lying around.',
    always: null,
    kit: ['A workbench of your own in the shed', 'A junked car to strip for parts', 'A Craftsman toolbox', 'Salvaged motors and pulleys', 'A come-along winch', 'A go-kart you built'],
  },
  'Electronics & Radio': {
    description:
      'Hands-on competence with wiring, circuits, components, radios, televisions, tape equipment, antennas, and basic electrical troubleshooting or modification.',
    always: null,
    kit: ['A soldering iron', 'A pair of walkie-talkies', 'A multimeter', 'A half-built Heathkit', 'A CB radio', 'A junked TV for tubes and parts'],
  },
  'Science': {
    description:
      "What school teaches about how the world works, and being good at it: living things, the body, rocks, weather, the sky, chemicals and reactions, basic laboratory technique, and the measuring, estimating, and calculating that go with them. Knowing what the natural explanation would be, and noticing when something doesn't fit it.",
    always: null,
    kit: ['A Gilbert chemistry set', 'A basement lab corner', 'Glassware from the school lab', "Reagents you shouldn't have", 'A notebook of tested recipes', 'A balance scale', 'A TI pocket calculator', 'A slide rule'],
  },
  'History & Geography': {
    description:
      'American and world history, maps, places, borders, historical context, and knowing where information about the past is likely to be recorded.',
    always: null,
    kit: ['A World Book Encyclopedia set', 'A stack of National Geographics', 'A globe', "A report card you're proud of"],
  },
  'Art': {
    description:
      'Sketching, painting, lettering and signs, model-making, drawing usable maps and diagrams, reproducing symbols, copying visual material accurately, and other practical work of making things look right by hand.',
    always: null,
    kit: ['Oil paints and an easel'],
  },
  'Music': {
    description:
      "Playing an instrument, singing, recognizing music, remembering songs, and understanding basic musical structure. Also performing: holding a room's attention and knowing the songs people grew up with.",
    always: null,
    kit: ['A guitar', 'A fiddle', 'A cassette recorder', 'An accordion', 'A key to the church organ loft'],
  },
  'Religion': {
    description:
      'Scripture, Christian traditions, liturgy, church practices, religious symbolism, theological vocabulary, and some familiarity with Latin or older religious material where appropriate.',
    always: null,
    kit: ['A Latin missal', 'A cassock and surplice', 'Knowing where the sacristy key hangs', 'Access to the parish registers', 'A thurible and incense', "The priest's ear"],
  },
  'Home Ec': {
    description:
      'Cooking, sewing, mending, canning, household materials, clothing repair, and the practical domestic skills that keep a home running.',
    always: null,
    kit: ['A sewing machine', 'A pressure canner', 'A stocked root cellar', 'Disguises you sewed yourself'],
  },
  'First Aid': {
    description:
      'Treating cuts, burns, bleeding, sprains, broken bones, and other ordinary injuries well enough to stabilize someone and know when the situation is serious.',
    always: null,
    kit: ['A Red Cross First Aid certificate', "A well-stocked kit from Mom's hospital", 'Crutches and a sling from the last accident', 'A stretcher you built at Scouts'],
  },
  'Bike Riding': {
    description:
      'Exceptional bicycle handling: riding fast or rough, carrying awkward loads, jumping obstacles, taking shortcuts, and controlling a bike under pressure.',
    always: null,
    kit: ['A Schwinn Sting-Ray', 'A ten-speed', 'A paper route', 'A headlight with a generator', 'A patch kit and pump', 'A bike trail through the woods you cut yourself'],
  },
  'Athletics': {
    description:
      'Sports, running, jumping, physical conditioning, and practiced whole-body athletic ability.',
    always: null,
    kit: [],
  },
  'Light on Your Feet': {
    description:
      'Climbing and moving quietly through difficult spaces: roofs, drainpipes, fences, windows, creaky houses, ledges, and similar places.',
    always: null,
    kit: [],
  },
  'Scrapping': {
    description:
      'Rough-and-tumble fighting learned from actual fights rather than formal training.',
    always: null,
    kit: [],
  },
  'Tough Talk': {
    description:
      'Threatening, intimidating, staring someone down, and convincing them that continuing to push you may be a bad idea.',
    always: null,
    kit: [],
  },
  'Animal Friend': {
    description:
      'Calming, handling, befriending, and understanding animals, including recognizing what their behavior is telling you.',
    always: null,
    kit: ['The family dog', 'An odd pet: a crow, a ferret, a raccoon', 'A horse you can ride', 'Homing pigeons', 'A beagle that can follow a scent'],
  },
  'Fibbing': {
    description:
      'Cover stories, alibis, playing dumb, lying straight-faced, and maintaining a false story when somebody starts asking questions.',
    always: null,
    kit: [],
  },
  "Teacher's Pet": {
    description:
      'Knowing how to be the kind of kid adults approve of: polite, trustworthy, helpful, respectable, and worth giving the benefit of the doubt.',
    always: null,
    kit: [],
  },
  'Woodworking & Metalwork': {
    description:
      'Measuring, cutting, drilling, shaping, fastening, and constructing useful things from wood or basic metal stock using ordinary hand and shop tools.',
    always: null,
    kit: [],
  },
  'Scrounging': {
    description:
      'You poke around where nobody else goes: the dump, the wrack line, the boatyard scrap pile, closed canneries, old wharves, and sheds nobody has opened in years. You know what was left where, which places stand empty, and what is still good, and you can usually come up with the part, the material, or the odd object somebody needs without buying it new.',
    always: null,
    kit: [],
  },
  'Sleight of Hand': {
    description:
      'Palming, planting, switching, lifting, concealing, and otherwise doing small things with your hands without attracting attention.',
    always: null,
    kit: [],
  },
  'Class Clown': {
    description:
      'Getting a laugh, distracting a room, defusing tension, making yourself seem harmless, teasing someone off balance, and turning embarrassment into a joke.',
    always: null,
    kit: [],
  },
  'Wilderness Survival': {
    description:
      'Finding food and water, choosing safe ground, building serious shelter, reading terrain, staying oriented, and surviving outdoors when ordinary camping competence is no longer enough.',
    always: null,
    kit: ['A pack basket', 'Snowshoes', 'A canoe', 'A hidden supply cache', 'A pack frame and down sleeping bag'],
  },
  'Foraging': {
    description:
      'Identifying edible, medicinal, poisonous, or otherwise useful plants, mushrooms, berries, seaweeds, shellfish, and other naturally available resources.',
    always: null,
    kit: ['A field guide to Maine plants', 'A mushroom book', "Grandma's handwritten remedy book", 'A patch only you know about: chanterelles and fiddleheads, but also magic mushrooms and water hemlock', 'A tincture kit: brown bottles and grain alcohol'],
  },
  'Trapping': {
    description:
      'Snares, deadfalls, trap lines, bait, placement, and understanding how animals move well enough to catch them deliberately.',
    always: null,
    kit: ['A set of leghold traps', 'Conibear traps', 'Stretcher boards', 'A trapline of your own', 'A fur buyer who pays cash'],
  },
  'Tracking': {
    description:
      'Following animals or people from footprints, broken vegetation, disturbed ground, scat, hair, blood, and other sign, and interpreting what that sign means.',
    always: null,
    kit: ['Plaster of Paris', 'Binoculars', 'A tracking dog', 'A collection of track casts for comparison'],
  },
  'Firearms': {
    description:
      'Safe, practiced use of firearms beyond the familiar hunting rifle: aiming, handling, loading, clearing problems, and shooting effectively under pressure.',
    always: null,
    kit: ["Dad's shotgun", "Grandpa's pistol from the drawer", "Grandpa's M1 carbine from the war", 'A box of shells', 'A rifle scope', 'A reloading press'],
  },
  'Slingshot / Archery': {
    description:
      'Skilled use of bows, slingshots, and similar practical ranged weapons a woods kid might realistically practice with.',
    always: 'A Wrist-Rocket slingshot',
    kit: ['A recurve bow', 'A quiver of target arrows', 'Broadhead tips', 'A compound bow', 'A crossbow'],
  },
  'Throwing Arm': {
    description:
      'Exceptional throwing ability with baseballs, rocks, bottles, tools, or whatever else needs to hit a particular place hard and accurately.',
    always: null,
    kit: [],
  },
  'Spelunking': {
    description:
      'Moving through caves, tight passages, shafts, unstable ground, darkness, and confusing underground spaces without getting yourself killed or hopelessly lost.',
    always: null,
    kit: ['Climbing rope', "A carbide miner's lamp", 'A hard hat', 'A harness and carabiners', 'An old map of the mine workings'],
  },
  'Diving': {
    description:
      'Breath-hold diving, working underwater in cold or murky conditions, and using actual diving equipment when it becomes available.',
    always: null,
    kit: ['A wetsuit', 'A weight belt', 'A dive light', 'A dive knife', 'A borrowed scuba tank and regulator'],
  },
  'Driving': {
    description:
      'Unusually advanced vehicle competence for a teenager: cars, trucks, tractors, and other motor vehicles, including difficult maneuvering and driving under pressure.',
    always: null,
    kit: ['Keys to the family truck', 'An unregistered farm truck', 'A snowmobile', 'A dirt bike', 'The tractor'],
  },
  'Daredevil': {
    description:
      'The movie-kid stunt skill: dangerous jumps, bicycle tricks, rope swings, rooftop leaps, hanging onto moving vehicles, controlled falls, and other spectacular physical actions that would be unreasonable for an ordinary freshman to attempt.',
    always: null,
    kit: [],
  },
  'Mechanical Repair': {
    description:
      'Diagnosing and properly repairing engines, outboards, pumps, winches, vehicles, and other mechanical systems.',
    always: null,
    kit: ['A timing light', 'Spare outboard parts', 'A welding rig', 'A chain hoist in the garage', 'A garage bay you can use', 'A compression tester'],
  },
  'Treasure Hunting': {
    description:
      'Metal detecting, cellar holes, old foundations, buried objects, reading old maps against the modern landscape, and recognizing where people would actually have hidden or lost things.',
    always: 'A metal detector',
    kit: ['Old town maps', 'A bag of old finds', 'The 1881 county atlas', 'Permission to dig on old farms', 'A better second detector'],
  },
  'Breaking & Entering': {
    description:
      'Locks, latches, windows, doors, simple security measures, and getting into or out of places without making a conspicuous mess.',
    always: null,
    kit: ['Lock picks', 'A skeleton key', 'A ring of old keys from a drawer', "A copy of the school janitor's key"],
  },
  'Five-Finger Discount': {
    description:
      "Advanced shoplifting, pickpocketing, concealing stolen objects, and taking something from under somebody's nose without being caught.",
    always: null,
    kit: [],
  },
  'Forgery': {
    description:
      'Copying signatures and handwriting, producing convincing notes, passes, labels, letterheads, and other false documents.',
    always: null,
    kit: ["A sample of Mom's signature", 'Use of a typewriter', "Blank letterhead from Dad's office", "The school office's rubber stamp", 'A light box for tracing'],
  },
  'Old-Timers': {
    description:
      'Getting elderly locals to open up by knowing how to listen, what to ask, which names and memories matter, and when to let somebody tell the story their own way.',
    always: null,
    kit: [],
  },
  'Library Rat': {
    description:
      'Serious archival competence with card catalogs, microfilm, newspapers, deeds, old maps, municipal records, cross-references, and obscure collections. Ordinary research never requires this skill; Library Rat lets you conduct unusually difficult or sophisticated research efficiently.',
    always: null,
    kit: ['An old map you never returned', 'A stack pass at the Machias college library', 'A key to the Historical Society reading room', 'A librarian who calls when something comes in'],
  },
  'Gadgets': {
    description:
      'Building improbable but intelligible contraptions from parts and junk: alarms, triggers, timers, trip mechanisms, remote releases, simple surveillance devices, and whatever ridiculous machine the plan requires.',
    always: null,
    kit: ['Walkie-talkies', 'A bug made from a transistor radio', 'A tape recorder', 'A telephone tap clip', 'A box of doorbell buzzers and switches', 'A Minox spy camera'],
  },
  'A/V Club': {
    description:
      'Advanced use and modification of 1970s communications and media technology: reel-to-reel and cassette tape, splicing, microphones, PA systems, projectors, telephones, antennas, transmitters, hidden microphones, radio signals, and related equipment.',
    always: null,
    kit: ['A shortwave receiver', 'A transmitter', 'A long-wire antenna', 'A directional loop antenna'],
  },
  'Pyrotechnics': {
    description:
      'Fireworks, fuses, smoke, flashes, timed ignition, and other small-scale controlled pyrotechnic effects.',
    always: null,
    kit: ['Cherry bombs', 'M-80s', 'Bottle rockets', 'A spool of cannon fuse', 'Black powder from shotgun shells', 'A connection in New Hampshire'],
  },
  'Photography': {
    description:
      'Cameras, lenses, exposure, flash, darkroom work, developing film, enlarging details, photographing documents, timed shots, and concealed or improvised photographic setups.',
    always: null,
    kit: ['A 35mm camera', 'A Polaroid', 'Use of the school darkroom', 'A telephoto lens', 'A darkroom in your closet', 'Infrared film'],
  },
  'Into Weird Shit': {
    description:
      "You've spent an unreasonable amount of time reading about UFOs, Bigfoot, ghosts, ESP, the Bermuda Triangle, sea monsters, and every other unexplained thing in paperbacks, magazines, and late-night television. You can recall claims and make connections other kids would miss, though what you know is a mixture of history, folklore, fraud, speculation, and occasionally something dangerously true.",
    always: null,
    kit: ['A shelf of paperbacks about the unexplained', 'A stack of monster magazines', 'A scrapbook of clipped newspaper stories', 'A Ouija board from a yard sale', 'A tarot deck'],
  },
  'Field Medicine': {
    description:
      'Serious emergency treatment under pressure: controlling major bleeding, treating dangerous wounds, recognizing shock, stabilizing injuries, and keeping somebody alive until real medical care is possible.',
    always: null,
    kit: ["A real doctor's bag", 'A suture kit', 'A stethoscope', "Mom's pain pills", 'A blood pressure cuff'],
  },
  'Boxing': {
    description:
      'Formal fighting technique: stance, footwork, defense, combinations, timing, and disciplined striking.',
    always: null,
    kit: ['Boxing gloves', 'A speed bag in the garage', 'A heavy bag', 'A Golden Gloves trophy', 'A trainer at the gym in Eastport'],
  },
  'Politician': {
    description:
      'Working a group rather than simply persuading one person: remembering names, making people feel included, smoothing over conflict, building consensus, presenting a plan respectably, and getting a room moving in the same direction.',
    always: null,
    kit: [],
  },
  'Science Fair Champ': {
    description:
      'Exceptional scientific competence for a freshman: designing experiments, controlling variables, using laboratory equipment, taking precise measurements, testing samples, interpreting results, and applying unusually advanced scientific reasoning to practical problems.',
    always: null,
    kit: ['A microscope and slides', 'A civil defense Geiger counter', 'A telescope', 'An oscilloscope', 'A Van de Graaff generator from the science fair', 'A blue ribbon from the state fair'],
  },
}

/** The words for a skill the data knows, or null for any other name. */
export function lubecSkillText(name: string): LubecSkillText | null {
  return LUBEC_SKILL_TEXT[name] ?? null
}
