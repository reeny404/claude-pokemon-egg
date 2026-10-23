// 알이 깨어나고 포켓몬이 자라는 규칙. 시각과 저장은 부르는 쪽이 맡고 여기서는 값만 계산한다
// 세션이 일한 시간이 쌓이면 알에 금이 가고 깨어나며, 깨어난 뒤에는 일한 1분이 경험치 1이 된다
// MR 이 머지되면 알은 바로 깨어나고, 이미 깨어났으면 경험치를 크게 받는다

import type { Lean, Mon, SessionEgg } from '../types'
import { EGG_SPECIES, EVOLUTIONS, EVOLVE_LEVEL, preEvolutionOf, rarityOf, typesOf } from './dex-data'
import { hash } from './egg-lib'

// 일한 시간이 이만큼이면 금이 가고, 이만큼이면 깨어난다
export const CRACK_MS = 20 * 60 * 1000
export const HATCH_MS = 60 * 60 * 1000
// 깨어난 포켓몬의 레벨과, 한 레벨 오르는 데 드는 경험치(일한 분)
export const HATCH_LEVEL = 5
export const XP_PER_LEVEL = 15
export const MAX_LEVEL = 100
// MR 이 머지되면 받는 경험치. 한 시간 일한 만큼이다
export const MERGE_XP = 60
// 전설은 알에서 나오지 않고 mod-hud 에서 옮겨 온 것뿐이다. 원작에서 만나는 레벨 즈음으로 둔다
const LEGEND_LEVEL = 50

export const newEgg = (key: string, at: number): SessionEgg => ({
  key,
  at,
  workMs: 0,
  tally: {},
  root: null,
  branch: null,
  mr: null,
  merged: false,
  mon: null,
  endedAt: null,
  savedAt: at,
})

export function stageOf(egg: SessionEgg): 'egg' | 'cracked' | 'hatched' {
  if (egg.mon) {
    return 'hatched'
  }
  return egg.workMs >= CRACK_MS || egg.mr?.state === 'opened' ? 'cracked' : 'egg'
}

// 원작에서 알을 들여다볼 때 나오는 글. 깨어날 때가 가까울수록 바뀐다
export function eggNote(egg: SessionEgg): string {
  if (stageOf(egg) === 'cracked') {
    return 'Sounds can be heard coming from inside! It will hatch soon!'
  }
  return egg.workMs >= CRACK_MS / 2
    ? 'It appears to move occasionally. It may be close to hatching.'
    : "What will hatch from this? It doesn't seem close to hatching."
}

export const levelOf = (xp: number): number => Math.min(MAX_LEVEL, HATCH_LEVEL + Math.floor(xp / XP_PER_LEVEL))
export const xpOfLevel = (level: number): number => (level - HATCH_LEVEL) * XP_PER_LEVEL

// 다음 레벨까지 찬 정도. 0 부터 1 이다
export const levelProgress = (xp: number): number => (levelOf(xp) >= MAX_LEVEL ? 1 : (xp % XP_PER_LEVEL) / XP_PER_LEVEL)

export function xpBar(progress: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.floor(progress * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

const TEST_COMMAND = /\b(test|tests|jest|vitest|pytest|mocha|rspec|phpunit|playwright|cypress)\b/

// 도구 하나가 어느 쪽으로 기우는지. 셀 만한 도구가 아니면 null
export function leanOfTool(tool: string, input: { command?: unknown }): Lean | null {
  if (tool === 'Bash') {
    return typeof input.command === 'string' && TEST_COMMAND.test(input.command) ? 'test' : 'shell'
  }
  if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(tool)) {
    return 'edit'
  }
  if (['Read', 'Grep', 'Glob', 'LS'].includes(tool)) {
    return 'read'
  }
  if (['WebFetch', 'WebSearch'].includes(tool) || tool.startsWith('mcp__')) {
    return 'web'
  }
  return ['Agent', 'Task'].includes(tool) ? 'agent' : null
}

const LEANS: readonly Lean[] = ['shell', 'edit', 'read', 'test', 'web', 'agent']

export function addTally(a: SessionEgg['tally'], b: SessionEgg['tally']): SessionEgg['tally'] {
  const sum: SessionEgg['tally'] = { ...a }
  for (const lean of LEANS) {
    if (b[lean]) {
      sum[lean] = (sum[lean] ?? 0) + b[lean]
    }
  }
  return sum
}

// 가장 많이 쓴 쪽. 같으면 LEANS 에서 앞선 쪽이고, 아무 도구도 안 썼으면 null
export function leanOf(tally: SessionEgg['tally']): Lean | null {
  let best: Lean | null = null
  let most = 0
  for (const lean of LEANS) {
    const count = tally[lean] ?? 0
    if (count > most) {
      best = lean
      most = count
    }
  }
  return best
}

// 쪽마다 끌어당기는 속성. 셸은 불꽃과 격투, 편집은 풀과 벌레, 읽기는 에스퍼와 고스트, 테스트는 전기, 웹은 물과 비행이다
export const LEAN_TYPES: Readonly<Record<Lean, readonly string[]>> = {
  shell: ['FIRE', 'FIGHTING', 'ROCK', 'GROUND'],
  edit: ['GRASS', 'BUG'],
  read: ['PSYCHIC', 'GHOST', 'POISON'],
  test: ['ELECTRIC', 'STEEL'],
  web: ['WATER', 'FLYING', 'ICE'],
  agent: ['NORMAL', 'DRAGON'],
}

// 귀한 포켓몬은 다른 종의 1/4 만큼 나오고, 기운 쪽 속성의 종은 20배 잘 나온다. 정해지는 게 아니라 기울 뿐이다
const COMMON_WEIGHT = 4
const RARE_WEIGHT = 1
const LEAN_BOOST = 20

export function hatchSpecies(key: string, lean: Lean | null): number {
  const weights = EGG_SPECIES.map(species => {
    const base = rarityOf(species) === 'rare' ? RARE_WEIGHT : COMMON_WEIGHT
    const isLeaning = lean !== null && typesOf(species).split('/').some(type => LEAN_TYPES[lean].includes(type))
    return base * (isLeaning ? LEAN_BOOST : 1)
  })
  let pick = hash(key) % weights.reduce((sum, weight) => sum + weight, 0)
  for (const [i, weight] of weights.entries()) {
    if (pick < weight) {
      return EGG_SPECIES[i]!
    }
    pick -= weight
  }
  return EGG_SPECIES[0]!
}

export function hatch(egg: SessionEgg, now: number): Mon {
  const lean = leanOf(egg.tally)
  return { key: egg.key, species: hatchSpecies(egg.key, lean), xp: 0, at: now, lean, root: egg.root, branch: egg.branch }
}

// 이브이는 깨어날 때 기운 쪽을 따라 웹은 샤미드, 테스트는 쥬피썬더, 셸은 부스터가 되고, 나머지는 알 key 로 고른다
const EEVEE_BY_LEAN: Partial<Record<Lean, number>> = { web: 134, test: 135, shell: 136 }

export function nextSpecies(mon: Mon): number | null {
  const next = EVOLUTIONS[mon.species]
  const at = EVOLVE_LEVEL[mon.species]
  if (!next || at === undefined || levelOf(mon.xp) < at) {
    return null
  }
  if (next.length === 1) {
    return next[0]!
  }
  return (mon.lean && EEVEE_BY_LEAN[mon.lean]) ?? next[hash(mon.key) % next.length]!
}

// 경험치를 더하고 레벨에 닿은 만큼 진화한다. 진화했으면 from 은 진화하기 전 처음 모습이다
export function grow(mon: Mon, xp: number): { mon: Mon; from: number | null } {
  let grown: Mon = { ...mon, xp: mon.xp + xp }
  for (let next = nextSpecies(grown); next !== null; next = nextSpecies(grown)) {
    grown = { ...grown, species: next }
  }
  return { mon: grown, from: grown.species === mon.species ? null : mon.species }
}

// 다음 진화 레벨. 더 진화하지 않으면 null
export function evolveLevelOf(species: number): number | null {
  return EVOLUTIONS[species] ? (EVOLVE_LEVEL[species] ?? null) : null
}

// 옮겨 온 포켓몬이 서 있을 레벨. 진화한 모습이면 진화 전 모습이 진화하는 레벨이다
export function startLevelOf(species: number): number {
  if (rarityOf(species) === 'legend') {
    return LEGEND_LEVEL
  }
  const pre = preEvolutionOf(species)
  return pre === null ? HATCH_LEVEL : (EVOLVE_LEVEL[pre] ?? HATCH_LEVEL)
}

type LegacyEntry = { key?: unknown; species?: unknown; root?: unknown; branch?: unknown; at?: unknown }
type LegacyDex = { box?: LegacyEntry[]; seen?: unknown[]; lead?: unknown; xp?: unknown }

// mod-hud 의 ~/.claude/mod-hud-pokedex.json 을 박스 포켓몬과 도감으로 바꾼다. 읽지 못하면 빈 것으로 본다
export function migrateDex(text: string): { mons: Mon[]; seen: number[] } {
  let dex: LegacyDex
  try {
    dex = JSON.parse(text) as LegacyDex
  } catch {
    return { mons: [], seen: [] }
  }
  const mons = (Array.isArray(dex.box) ? dex.box : [])
    .filter(entry => typeof entry.key === 'string' && typeof entry.species === 'number')
    .map(entry => {
      const species = entry.species as number
      // 키우미집에 맡겨 두던 포켓몬은 그동안 먹은 경험치(일한 ms)도 가져온다
      const extra = entry.key === dex.lead && typeof dex.xp === 'number' ? Math.floor(dex.xp / 60_000) : 0
      return {
        key: entry.key as string,
        species,
        xp: xpOfLevel(startLevelOf(species)) + extra,
        at: typeof entry.at === 'number' ? entry.at : 0,
        lean: null,
        root: typeof entry.root === 'string' ? entry.root : null,
        branch: typeof entry.branch === 'string' ? entry.branch : null,
      }
    })
  const seen = (Array.isArray(dex.seen) ? dex.seen : []).filter((no): no is number => typeof no === 'number')
  return { mons, seen }
}

// 도감에 오른 종. 박스 포켓몬과 그 진화 전 모습, mod-hud 에서 옮겨 온 도감을 합친다
export function seenOf(mons: readonly Mon[], legacy: readonly number[]): number[] {
  const seen = new Set(legacy)
  for (const mon of mons) {
    for (let species: number | null = mon.species; species !== null; species = preEvolutionOf(species)) {
      seen.add(species)
    }
  }
  return [...seen].sort((a, b) => a - b)
}

// 박스를 도감 번호 순으로 같은 종끼리 묶는다. level 은 그 종 중 가장 높은 레벨이다
export function groupBox(mons: readonly Mon[]): Array<{ species: number; count: number; level: number }> {
  const groups = new Map<number, { species: number; count: number; level: number }>()
  for (const mon of mons) {
    const group = groups.get(mon.species) ?? { species: mon.species, count: 0, level: 0 }
    groups.set(mon.species, { ...group, count: group.count + 1, level: Math.max(group.level, levelOf(mon.xp)) })
  }
  return [...groups.values()].sort((a, b) => a.species - b.species)
}
