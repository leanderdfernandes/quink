import { displayName, initials, type Person } from '../lib/people'

// The ambient signal that other people are here. Without it People is a rail item nobody
// clicks, and a help center with four editors looks exactly like one with a single owner.
//
// Renders only when there is more than one person, so a solo help center gains no chrome
// at all — showing a stack of one is an empty seat at a table for one.
//
// Initials, not photos: Google's avatar URL is not on `profiles`, and kb_people() only has
// one when the person signed in with Google and the metadata happened to carry it. One
// avatar loading and three not is worse than four that match.

type Props = {
  people: Person[]
  onOpen: () => void
}

const SHOWN = 3

export default function AvatarStack({ people, onOpen }: Props) {
  if (people.length < 2) return null

  // Pending invites count toward the overflow number but never take one of the three
  // faces — a row nobody has accepted yet is not a person in the room.
  const members = people.filter((p) => p.kind === 'member')
  const faces = members.slice(0, SHOWN)
  const rest = people.length - faces.length

  return (
    <button
      className="avstack"
      onClick={onOpen}
      title={members.map(displayName).join(', ')}
      aria-label={`${people.length} people — open People`}
    >
      {faces.map((p, i) => (
        <span key={p.id} className={`avatar av-t${i % 4}`} aria-hidden>
          {initials(p)}
        </span>
      ))}
      {rest > 0 && <span className="avstack-more">+{rest}</span>}
    </button>
  )
}
