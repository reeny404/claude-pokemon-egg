import { expect, test } from 'claude-code/testing'

import type { Mon } from '../types'
import { EGG_SPECIES, EVOLUTIONS, EVOLVE_LEVEL, preEvolutionOf, typesOf } from './dex-data'
import {
  CRACK_MS,
  eggNote,
  grow,
  groupBox,
  hatch,
  HATCH_MS,
  hatchSpecies,
  LEAN_TYPES,
  leanOf,
  leanOfTool,
  levelOf,
  migrateDex,
  newEgg,
  seenOf,
  stageOf,
  xpBar,
  xpOfLevel,
} from './grow-lib'

const monOf = (species: number, level: number, over: Partial<Mon> = {}): Mon => ({
  key: 'k',
  species,
  xp: xpOfLevel(level),
  at: 0,
  lean: null,
  root: null,
  branch: null,
  ...over,
})

test('진화 레벨표는 진화표와 같은 종을 다룬다', () => {
  expect(Object.keys(EVOLVE_LEVEL).sort()).toEqual(Object.keys(EVOLUTIONS).sort())
  expect(preEvolutionOf(6)).toBe(5)
  expect(preEvolutionOf(1)).toBeNull()
})

test('알은 20분 일하거나 MR 이 열리면 금이 가고, 깨어나면 hatched 다', () => {
  const egg = newEgg('a', 0)
  expect(stageOf(egg)).toBe('egg')
  expect(stageOf({ ...egg, workMs: CRACK_MS })).toBe('cracked')
  expect(stageOf({ ...egg, mr: { iid: 1, state: 'opened', url: '' } })).toBe('cracked')
  expect(stageOf({ ...egg, mr: { iid: 1, state: 'closed', url: '' } })).toBe('egg')
  expect(stageOf({ ...egg, mon: 'a' })).toBe('hatched')
  expect(eggNote(egg)).toMatch(/doesn't seem close/)
  expect(eggNote({ ...egg, workMs: CRACK_MS / 2 })).toMatch(/move occasionally/)
  expect(eggNote({ ...egg, workMs: HATCH_MS - 1 })).toMatch(/hatch soon/)
})

test('레벨은 Lv5 에서 시작해 15분마다 하나씩 오르고 100에서 멈춘다', () => {
  expect(levelOf(0)).toBe(5)
  expect(levelOf(14.9)).toBe(5)
  expect(levelOf(15)).toBe(6)
  expect(levelOf(1_000_000)).toBe(100)
  expect(xpBar(0.5)).toBe('▰▰▰▰▰▱▱▱▱▱')
})

test('도구는 셸, 편집, 읽기, 테스트, 웹, 에이전트로 나뉘고 가장 많이 쓴 쪽으로 기운다', () => {
  expect(leanOfTool('Bash', { command: 'git status' })).toBe('shell')
  expect(leanOfTool('Bash', { command: 'bun test hooks' })).toBe('test')
  expect(leanOfTool('Edit', {})).toBe('edit')
  expect(leanOfTool('Grep', {})).toBe('read')
  expect(leanOfTool('mcp__linear__get_issue', {})).toBe('web')
  expect(leanOfTool('Agent', {})).toBe('agent')
  expect(leanOfTool('TodoWrite', {})).toBeNull()
  expect(leanOf({})).toBeNull()
  expect(leanOf({ edit: 3, read: 5 })).toBe('read')
  expect(leanOf({ edit: 3, read: 3 })).toBe('edit')
})

test('기운 쪽 속성의 종이 훨씬 잘 나오지만 그 쪽으로 정해지지는 않는다', () => {
  const share = (lean: 'test' | 'web' | null) => {
    const picks = Array.from({ length: 2000 }, (_, i) => hatchSpecies(`egg-${i}`, lean))
    const matching = picks.filter(species => typesOf(species).split('/').some(type => LEAN_TYPES.test.includes(type)))
    return matching.length / picks.length
  }
  expect(share(null)).toBeLessThan(0.15)
  expect(share('test')).toBeGreaterThan(0.35)
  expect(share('test')).toBeLessThan(0.9)
  for (let i = 0; i < 50; i++) {
    expect(EGG_SPECIES).toContain(hatchSpecies(`egg-${i}`, 'web'))
  }
})

test('깨어난 포켓몬은 알의 key 와 기운 쪽을 이어 받고 Lv5 다', () => {
  const egg = { ...newEgg('a', 0), tally: { shell: 4 }, root: '/r', branch: 'feat/x' }
  const born = hatch(egg, 9)
  expect(born).toMatchObject({ key: 'a', xp: 0, at: 9, lean: 'shell', root: '/r', branch: 'feat/x' })
  expect(born.species).toBe(hatchSpecies('a', 'shell'))
})

test('레벨에 닿으면 진화하고, 한 번에 여러 단계도 진화한다', () => {
  expect(grow(monOf(4, 15), 14).from).toBeNull()
  const once = grow(monOf(4, 15), 15)
  expect(once.mon.species).toBe(5)
  expect(once.from).toBe(4)
  expect(grow(monOf(4, 5), xpOfLevel(36)).mon.species).toBe(6)
  // 돌로 진화하는 피카츄는 Lv30 에 진화한다
  expect(grow(monOf(25, 29), 15).mon.species).toBe(26)
  // 다 진화했으면 경험치만 쌓인다
  expect(grow(monOf(6, 50), 100).from).toBeNull()
})

test('이브이는 기운 쪽을 따라 진화하고, 기운 쪽이 없으면 key 로 고른다', () => {
  expect(grow(monOf(133, 29, { lean: 'web' }), 15).mon.species).toBe(134)
  expect(grow(monOf(133, 29, { lean: 'test' }), 15).mon.species).toBe(135)
  expect(grow(monOf(133, 29, { lean: 'shell' }), 15).mon.species).toBe(136)
  expect([134, 135, 136]).toContain(grow(monOf(133, 29, { lean: 'read' }), 15).mon.species)
})

test('mod-hud 의 박스를 지금 모습에 맞는 레벨로 옮기고, 맡겨 둔 포켓몬은 먹은 경험치도 가져온다', () => {
  const text = JSON.stringify({
    box: [
      { key: 'day:1', species: 4, root: '/r', branch: 'feat/a', label: '#A', at: 10 },
      { key: 'day:2', species: 5, root: '/r', branch: null, label: '#B', at: 20 },
      { key: 'legend:146', species: 146, root: '/r', branch: null, label: '', at: 30 },
      { key: 'broken' },
    ],
    seen: [4, 5, 146, 'x'],
    lead: 'day:1',
    xp: 30 * 60_000,
  })
  const { mons, seen } = migrateDex(text)
  expect(mons.map(one => [one.key, one.species, levelOf(one.xp)])).toEqual([
    ['day:1', 4, 7],
    ['day:2', 5, 16],
    ['legend:146', 146, 50],
  ])
  expect(mons[0]).toMatchObject({ at: 10, root: '/r', branch: 'feat/a', lean: null })
  expect(seen).toEqual([4, 5, 146])
  expect(migrateDex('not json')).toEqual({ mons: [], seen: [] })
})

test('도감에는 박스 포켓몬과 그 진화 전 모습, 옮겨 온 도감이 오르고 박스는 종마다 묶인다', () => {
  const mons = [monOf(6, 40), monOf(4, 5, { key: 'b' }), monOf(4, 9, { key: 'c' })]
  expect(seenOf(mons, [25])).toEqual([4, 5, 6, 25])
  expect(groupBox(mons)).toEqual([
    { species: 4, count: 2, level: 9 },
    { species: 6, count: 1, level: 40 },
  ])
})
