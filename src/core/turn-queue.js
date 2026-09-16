export function nextActor(match) {
  const team = 1 - match.current.team;
  const members = match.alive(team);
  const actor = members[match.cursor[team] % members.length];
  match.cursor[team]++;
  return match.actors.indexOf(actor);
}

export class TurnQueue {
  constructor(actors) {
    const teams = [0, 1].map((team) => actors.map((actor, index) => ({ actor, index })).filter((entry) => entry.actor.team === team));
    const interleaved = [];
    for (let i = 0; interleaved.length < actors.length; i++)
      for (const team of teams) if (team[i]) interleaved.push(team[i]);
    this.entries = interleaved.map(({ index }, position) => ({ index, readyAt: position * 50 }));
    this.current = this.entries[0]?.index ?? -1;
  }

  complete(index, delay, alive) {
    const entry = this.entries.find((candidate) => candidate.index === index);
    entry.readyAt += delay;
    const next = this.entries
      .filter((candidate) => alive(candidate.index))
      .sort((a, b) => a.readyAt - b.readyAt || a.index - b.index)[0];
    this.current = next?.index ?? -1;
    return this.current;
  }

  upcoming(alive, count = 8) {
    const copy = this.entries.map((entry) => ({ ...entry }));
    const result = [];
    while (result.length < count && copy.some((entry) => alive(entry.index))) {
      const next = copy.filter((entry) => alive(entry.index)).sort((a, b) => a.readyAt - b.readyAt || a.index - b.index)[0];
      result.push(next.index);
      next.readyAt += 100;
    }
    return result;
  }
}
