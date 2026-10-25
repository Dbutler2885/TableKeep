import { useEffect, useState } from 'react'
import { clearNpcWrites, createNpcWriteQueues } from '../lib/npcWriteQueue'

// One set of write queues for the tab's lifetime. Writes still waiting when
// the tab unmounts are dropped, not flushed.
export function useNpcWriteQueues() {
  const [queues] = useState(createNpcWriteQueues)
  useEffect(() => () => clearNpcWrites(queues), [queues])
  return queues
}
