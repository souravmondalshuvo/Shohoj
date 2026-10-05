// ── SNAPSHOT ROOMS (legacy bundle) ───────────────────────────────────────────
//
// Turns the room names in a section snapshot into physical rooms, for the one
// tab that makes a claim about a room rather than about a class: Free Rooms.
//
// The Routine tab shows a section's room exactly as the university's page
// spelled it, and should. Free Rooms cannot. NSU's page carries names like
// `LIB901_V`, `SAC415_v1` and `NAC201-v1` beside `LIB901`, `SAC415` and
// `NAC201` — a second section listed against the same room (the campus
// database's note on the source says so, and that it is unconfirmed). Read as
// rooms of their own, each would be a "room" that is free whenever its one
// section is not meeting, listed next to the real room it shares, which may be
// full at that moment.
//
// So a variant is folded into the room it names: `LIB901_V`'s classes count
// against `LIB901`. That is the cautious reading in both directions the suffix
// could mean — if the two sections really share the room it is correct, and if
// the variant is something else (a virtual section, say) the room is shown
// busy when it might be free, which costs a student nothing. The opposite
// mistake, a room shown free with a class in it, is the one that matters.
//
// A variant whose base room never appears on its own is dropped: there is no
// evidence the base is a room anyone can walk into.
//
// Pure. Sections in, sections out; nothing is mutated.

/** `LIB901_V`, `SAC415_v1`, `NAC201-v1`, `OAT803_V2` → the room before the suffix. */
const VARIANT_SUFFIX = /^(.+?)[_-][vV]\d*$/;

/** The room a variant name refers to, or null when the name is not a variant. */
export function snapshotRoomBase(name) {
  const match = VARIANT_SUFFIX.exec(typeof name === 'string' ? name.trim() : '');
  return match ? match[1] : null;
}

/**
 * Rewrite every class slot's room to a physical room.
 *
 * @returns {{ sections: object[], folded: number, dropped: number }}
 *   `folded` and `dropped` count class slots, so the caller can say how much of
 *   the timetable the answer rests on.
 */
export function withPhysicalRooms(sections) {
  const roomOf = (section, slot) => (slot.room || section.roomName || '').trim();

  // Rooms that appear under their own name somewhere in the timetable.
  const physical = new Set();
  for (const section of sections) {
    for (const slot of section.classSlots) {
      const room = roomOf(section, slot);
      if (room !== '' && snapshotRoomBase(room) === null) physical.add(room);
    }
  }

  let folded = 0;
  let dropped = 0;
  const out = sections.map((section) => {
    const classSlots = section.classSlots.map((slot) => {
      const room = roomOf(section, slot);
      const base = snapshotRoomBase(room);
      if (base === null) return { ...slot, room };
      if (physical.has(base)) {
        folded += 1;
        return { ...slot, room: base };
      }
      dropped += 1;
      // Not a room anyone can be sent to. The marker is what the occupancy
      // index already skips as "to be announced".
      return { ...slot, room: 'TBA' };
    });
    // roomName is the index's fallback for a slot with no room of its own;
    // every slot now names one, so it must not reintroduce the raw spelling.
    return { ...section, roomName: '', classSlots };
  });
  return { sections: out, folded, dropped };
}
