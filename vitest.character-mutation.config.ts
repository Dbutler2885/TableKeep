import { defineConfig } from 'vitest/config'
import baseConfig from './vite.config'

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      'src/features/character/CharacterTab*.test.tsx',
      'src/features/character/hooks/useCharacterRoster*.test.tsx',
    ],
  },
})
