# claude-pokemon-egg

English | [한국어](README.ko.md)

Every Claude Code session you open gets its own Pokémon egg, right above the prompt.
The egg rocks while Claude works, cracks after a while or when the session's MR opens, and hatches after an hour of work or the moment the MR is merged.
After that it keeps gaining experience and evolves at the levels from the games.

What hatches leans toward what the session did. The egg's spots take on the color of the tools it used most, and the Pokémon that comes out leans to the matching types:

| Mostly | Spots | Leans toward |
|---|---|---|
| shell commands | red | FIRE, FIGHTING, ROCK, GROUND |
| editing files | green | GRASS, BUG |
| reading and searching | purple | PSYCHIC, GHOST, POISON |
| running tests | yellow | ELECTRIC, STEEL |
| web and MCP tools | blue | WATER, FLYING, ICE |
| subagents | brown | NORMAL, DRAGON |

## How it grows

- **Egg.** Cracks after 20 minutes of work or when the branch's MR opens. Hatches at 60 minutes of work or when the MR is merged. One MR hatches one egg, however many sessions worked on it.
- **Experience.** A hatched Pokémon starts at Lv5. Every minute of work is 1 EXP, a merged MR is 60, and it gains a level every 15 EXP. Only time Claude spends working counts.
- **Evolution.** At the level from Pokémon Red and Blue. Stone evolutions happen at Lv30 and trade evolutions at Lv36. Eevee becomes Vaporeon, Jolteon or Flareon depending on what its session leaned toward.
- **After the session closes.** The Pokémon stays in your PC BOX. An egg still waiting on an open MR is watched by your other sessions for 14 days and hatches when the MR is merged.
- **Branch.** A session's branch is the worktree it last edited with Edit, Write or Bash, not just the folder Claude was started in.

## Install

```bash
claude plugin marketplace add reeny404/claude-pokemon-egg
claude plugin install pokemon-egg@claude-pokemon-egg
```

Then open a new session, or run `/reload-plugins`. The egg shows up above the prompt in the terminal.

GitHub PRs are read through the `gh` CLI. For GitLab MRs, set a token with `read_api` scope:

```json
// ~/.claude/settings.json
{ "env": { "GITLAB_TOKEN": "<token>" } }
```

If you used mod-hud, its PC BOX and POKéDEX are copied over once, the first time pokemon-egg starts. mod-hud's file is only read, never changed.

## Commands

| Command | What it does |
|---|---|
| `/pokemon-egg` | This session's egg or Pokémon: work time, EXP, and what it leans toward |
| `/pokemon-egg box` | Every Pokémon in your PC BOX, one line per species |
| `/pokemon-egg dex` | Your POKéDEX: how many of the 151 you have seen |
| `/pokemon-egg help` | Every option |

## Development

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## License

MIT. Pokémon and Pokémon names are trademarks of Nintendo, Creatures Inc. and GAME FREAK inc. Sprites and names are fetched from [PokeAPI](https://pokeapi.co) at runtime and are not part of this repository.
