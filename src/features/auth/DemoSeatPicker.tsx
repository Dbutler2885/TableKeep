import type { DemoSeat } from './demoSeats'

type Props = {
  seats: DemoSeat[]
  onChoose: (seat: DemoSeat) => Promise<unknown> | unknown
}

/**
 * The two one-click sign-ins shown in place of the Google button when the app
 * is running against the local emulators. See `demoSeats.ts` for why.
 *
 * The first seat carries the filled-ink treatment the Google button normally
 * has, so the card keeps one clear primary action; the second is the outlined
 * variant. Neither says "emulator" or "seed" - a visitor is choosing a chair
 * at the table, not a fixture.
 */
export function DemoSeatPicker({ seats, onChoose }: Props) {
  return (
    <div className="tk-auth-seats">
      <div className="tk-auth-seats-head">
        <span>Pick a seat</span>
        <span className="tk-auth-seats-rule" aria-hidden />
      </div>

      {seats.map((seat, index) => (
        <button
          key={seat.id}
          type="button"
          className={index === 0 ? 'tk-auth-seat tk-auth-seat-lead' : 'tk-auth-seat'}
          onClick={() => onChoose(seat)}
        >
          <span className="tk-auth-seat-title">{seat.title}</span>
          <span className="tk-auth-seat-caption">{seat.caption}</span>
        </button>
      ))}

      <p className="tk-auth-seats-note">
        Both are demo accounts on your own machine, already at the same table. The two
        seats see different things, so it is worth trying each one.
      </p>
    </div>
  )
}
