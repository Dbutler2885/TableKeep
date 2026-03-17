export type GeneralCatalogEntry = {
  id: string
  name: string
  costGp: number
  description: string
}

export const OSE_GENERAL_CATALOG: GeneralCatalogEntry[] = [
  { id: 'gear-crowbar', name: 'Crowbar', costGp: 10, description: '2-3 ft iron bar for prying doors/chests.' },
  { id: 'gear-grappling-hook', name: 'Grappling hook', costGp: 25, description: 'Iron 3-4 hook anchor ring for rope.' },
  { id: 'gear-hammer', name: 'Hammer (small)', costGp: 2, description: 'Useful for spikes and tapping stonework.' },
  { id: 'gear-holy-symbol', name: 'Holy symbol', costGp: 25, description: 'Required for divine powers and rituals.' },
  { id: 'gear-lantern', name: 'Lantern', costGp: 10, description: '30 ft light radius. Burns 1 oil flask / 4 hours.' },
  { id: 'gear-mirror', name: 'Mirror (steel)', costGp: 5, description: 'Hand-sized steel mirror for peeking and gaze attacks.' },
  { id: 'gear-pole', name: 'Pole (10 ft)', costGp: 1, description: '2-inch wooden pole for poking/prodding.' },
  { id: 'gear-rope', name: 'Rope (50 ft)', costGp: 1, description: 'Holds up to three people + equipment.' },
  { id: 'gear-stakes-mallet', name: 'Stakes (3) + mallet', costGp: 3, description: 'Useful against vampires.' },
  { id: 'gear-thieves-tools', name: "Thieves' tools", costGp: 25, description: 'Lockpicking kit in compact case.' },
  { id: 'gear-tinderbox', name: 'Tinder box', costGp: 3, description: 'Flint/steel/tinder; 2-in-6 chance per round to light.' },
  { id: 'gear-waterskin', name: 'Waterskin', costGp: 1, description: 'Holds 2 pints (1 quart).' },
]

export const generalCatalogById = Object.fromEntries(
  OSE_GENERAL_CATALOG.map((entry) => [entry.id, entry]),
) as Record<string, GeneralCatalogEntry>
