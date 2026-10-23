import { expect, test } from 'claude-code/testing'

import { drawBand, EGG_COLUMNS, EGG_LINES, eggSprite, EVOLVE_FLASH_MS, EVOLVE_MS, evolvePhase } from './egg-lib'
import type { BandArt } from './egg-lib'

test('금 간 알은 알마다 다섯 가지 금 중 하나로 그리고, 같은 알은 늘 같은 금이다', () => {
  const crackOf = (key: string) =>
    eggSprite(key, 'cracked', 0)
      .flatMap((row, y) => [...row].map((c, x) => (c === 'c' ? `${x},${y}` : null)))
      .filter(Boolean)
      .join(' ')
  expect(crackOf('a')).toBe(crackOf('a'))
  expect(new Set(Array.from({ length: 40 }, (_, i) => crackOf(`egg-${i}`))).size).toBe(5)
})

test('알은 14x13 몸통에 여섯 무늬 중 하나로 그리고, 같은 알은 늘 같은 무늬다', () => {
  expect(eggSprite('a', 'egg', 0)).toEqual(eggSprite('a', 'egg', 0))
  expect(new Set(Array.from({ length: 200 }, (_, i) => eggSprite(`egg-${i}`, 'egg', 0).join('\n'))).size).toBe(6)
  // 서 있는 알은 폭 14, 키 13 이다
  const rows = eggSprite('a', 'egg', 0)
  const painted = rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === '.' ? [] : [[x, y] as const])))
  expect(Math.max(...painted.map(([x]) => x)) - Math.min(...painted.map(([x]) => x)) + 1).toBe(14)
  expect(Math.max(...painted.map(([, y]) => y)) - Math.min(...painted.map(([, y]) => y)) + 1).toBe(13)
})

test('기운 알도 외곽선에 구멍이 없고 바닥이 둥지에 닿으며 잘리지 않는다', () => {
  for (const angle of [0, -25, -15, -10, 10, 15, 25]) {
    const rows = eggSprite('egg-3', 'egg', angle)
    const at = (x: number, y: number) => rows[y]?.[x] ?? '.'
    expect(rows[rows.length - 1]!.includes('k')).toBe(true)
    expect(rows[0]!.replace(/\./g, '')).toBe('')
    expect(rows.every(row => row[0] === '.' && row[row.length - 1] === '.')).toBe(true)
    rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        const isEdge = c !== '.' && [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].includes('.')
        if (isEdge) {
          expect(c).toBe('k')
        }
      }),
    )
  }
})

test('금 간 알은 기울어도 금이 보인다', () => {
  expect(eggSprite('egg-1', 'cracked', 25).some(row => row.includes('c'))).toBe(true)
  expect(eggSprite('egg-1', 'cracked', -25).some(row => row.includes('c'))).toBe(true)
})

test('기운 알에는 한 칸짜리 돌기가 없다', () => {
  for (let i = 0; i < 12; i++) {
    for (const angle of [-25, -15, -10, 10, 15, 25]) {
      const rows = eggSprite(`egg-${i}`, 'egg', angle)
      const filled = (x: number, y: number) => (rows[y]?.[x] ?? '.') !== '.'
      rows.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c !== '.') {
            const neighbours = [filled(x - 1, y), filled(x + 1, y), filled(x, y - 1), filled(x, y + 1)].filter(Boolean).length
            expect(neighbours).toBeGreaterThanOrEqual(2)
          }
        }),
      )
    }
  }
})

const egg = (over: Partial<Extract<BandArt, { kind: 'egg' }>> = {}): BandArt => ({
  kind: 'egg',
  key: 'a',
  stage: 'egg',
  lean: null,
  isShaking: false,
  ...over,
})
// 칸마다 [글자, 앞색, 뒤색] 이다
const colorsOf = (cells: Uint32Array) => new Set([...cells].filter((_, i) => i % 3 !== 0))

test('band 의 알은 20칸 8줄이고, 서 있을 때는 프레임이 바뀌어도 같고 흔들릴 때만 기운다', () => {
  expect(drawBand(egg(), 0).length).toBe(EGG_COLUMNS * EGG_LINES * 3)
  expect(drawBand(egg(), 2)).toEqual(drawBand(egg(), 0))
  // ROCK 의 두 번째 프레임은 왼쪽으로 15도 기운다
  expect(drawBand(egg({ isShaking: true }), 1)).not.toEqual(drawBand(egg(), 1))
})

test('반점 색은 기운 쪽을 따른다', () => {
  expect(colorsOf(drawBand(egg({ lean: 'shell' }), 0)).has(0xe8784f)).toBe(true)
  expect(colorsOf(drawBand(egg({ lean: 'test' }), 0)).has(0xf2d24b)).toBe(true)
  expect(colorsOf(drawBand(egg({ lean: 'test' }), 0)).has(0xe8784f)).toBe(false)
})

test('스프라이트가 없으면 몬스터볼을, 있으면 포켓몬을 바닥에 세우고 일하면 뛴다', () => {
  const ball = colorsOf(drawBand({ kind: 'mon', image: undefined, isHopping: false }, 0))
  expect(ball.has(0xe8384f)).toBe(true)
  const image = { width: 4, height: 4, px: Array.from({ length: 16 }, () => 0x123456) }
  const still = drawBand({ kind: 'mon', image, isHopping: false }, 2)
  expect(colorsOf(still).has(0x123456)).toBe(true)
  expect(drawBand({ kind: 'mon', image, isHopping: true }, 2)).not.toEqual(still)
})

test('진화 장면은 진화 전 모습으로 서 있다가 하얗게 바뀌며 번갈아 보이고 새 모습으로 선다', () => {
  const before = { width: 4, height: 4, px: Array.from({ length: 16 }, () => 0x111111) }
  const after = { width: 6, height: 6, px: Array.from({ length: 36 }, () => 0x222222) }
  const at = (elapsed: number) => colorsOf(drawBand({ kind: 'evolve', before, after, elapsed }, 0))
  expect(at(0).has(0x111111)).toBe(true)
  expect(at(5000).has(0xffffff)).toBe(true)
  expect(evolvePhase(EVOLVE_FLASH_MS - 1)).toBe('flash')
  expect(at(EVOLVE_MS).has(0x222222)).toBe(true)
})
