import type { CombatFight } from './engine/types'
import { WOUND_WAIT } from './woundTypes'

export type CombatWoundDeliveryStatus = { fightId: string | null; pending: boolean; reason: string | null }
type LiveFight = { id: string; fight: CombatFight }
type Drain = (fightId: string) => Promise<void>
type Report = (status: CombatWoundDeliveryStatus) => void

class CombatWoundDrainService {
  private live: LiveFight | null = null
  private running: Promise<void> | null = null
  private requested = false
  private stopped = false
  private drain: Drain
  private report: Report

  constructor(drain: Drain, report: Report) {
    this.drain = drain
    this.report = report
  }

  private publish(fightId: string | null, reason: string | null) {
    if (!this.stopped) this.report({ fightId, pending: reason !== null, reason })
  }

  private publishCurrent(id: string, reason: string | null) {
    if (this.live?.id === id) this.publish(id, reason)
  }

  private async drainCurrent(id: string) {
    this.publish(id, WOUND_WAIT)
    try {
      await this.drain(id)
      this.publishCurrent(id, null)
    } catch (error) {
      this.publishCurrent(id, `${WOUND_WAIT}: ${String(error)}`)
    }
  }

  private async work() {
    while (this.requested && !this.stopped) {
      this.requested = false
      const current = this.live
      if (current) await this.drainCurrent(current.id)
    }
  }

  private finish() {
    this.running = null
    if (this.requested) void this.reconnect()
  }

  reconnect() {
    if (this.stopped) return Promise.resolve()
    this.requested = true
    this.running ??= this.work().finally(() => this.finish())
    return this.running
  }

  observe(value: LiveFight | null) {
    this.live = value?.fight.status === 'live' ? value : null
    if (!this.live) { this.publish(null, null); return }
    this.observeLive(this.live)
  }

  private observeLive(value: LiveFight) {
    if (value.fight.state.woundOutbox.length) void this.reconnect()
    else this.publish(value.id, null)
  }

  stop() { this.stopped = true; this.live = null }
}

/** Feed the workspace's shared listener here on every tab; call reconnect on connection recovery. */
export function combatWoundDrainService(drain: Drain, report: Report) {
  return new CombatWoundDrainService(drain, report)
}
