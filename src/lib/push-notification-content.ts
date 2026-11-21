export type ReservationPushSlot = { start: string; end: string };

export type ReservationPushDetails = {
  name: string;
  date: string;
  unitId: "unidade-1" | "unidade-2";
  slots: ReservationPushSlot[];
};

const UNIT_LABELS: Record<ReservationPushDetails["unitId"], string> = {
  "unidade-1": "Cuniã",
  "unidade-2": "Pinheiro Machado",
};

function toMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

function formatTime(value: string) {
  return value === "24:00" ? "24:00" : value;
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatRanges(slots: ReservationPushSlot[]) {
  const sorted = slots
    .map((slot) => ({
      start: slot.start,
      end: slot.end,
      startMinutes: toMinutes(slot.start),
      endMinutes: toMinutes(slot.end),
    }))
    .filter(
      (slot) =>
        slot.startMinutes !== null &&
        slot.endMinutes !== null &&
        slot.endMinutes > slot.startMinutes,
    )
    .sort((left, right) => left.startMinutes! - right.startMinutes!);

  const ranges: Array<{ start: string; end: string; endMinutes: number }> = [];
  for (const slot of sorted) {
    const previous = ranges.at(-1);
    if (previous && previous.endMinutes === slot.startMinutes) {
      previous.end = slot.end;
      previous.endMinutes = slot.endMinutes!;
    } else {
      ranges.push({
        start: slot.start,
        end: slot.end,
        endMinutes: slot.endMinutes!,
      });
    }
  }

  return ranges.map((range) => `${formatTime(range.start)}–${formatTime(range.end)}`);
}

export function createReservationPushBody(details: ReservationPushDetails) {
  const date = formatDate(details.date);
  const unit = UNIT_LABELS[details.unitId];
  const name = [...details.name]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 || character === "<" || character === ">" ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const intervals = formatRanges(details.slots);
  if (!date || !name || !unit || !intervals.length) return null;
  return `${name} · ${date} · Unidade ${unit} · ${intervals.join(", ")}`.slice(0, 480);
}
