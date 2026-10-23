// 입력창 위에 그리는 세션의 포켓몬 알과 깨어난 포켓몬. 알 그림과 진화 장면은 mod-hud 에서 옮겨 왔다
// 알 key 로 무늬와 금 모양이 정해지고, 반점 색은 세션이 기운 쪽을 따른다. 세션이 일하는 동안 오뚝이처럼 흔들린다

import type { Lean } from '../types'
import type { Pixels } from './png-lib'
import { CLEAR } from './png-lib'

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

const C = {
  // 4세대 알 스프라이트의 색
  eggLine: 0x3a3428,
  eggShine: 0xffffff,
  egg: 0xfff6de,
  eggLight: 0xeee6bd,
  eggShade: 0xd5cda4,
  spot: 0x9ccd83,
  spotLight: 0xcde6b4,
  spotShade: 0x83b46a,
  crack: 0x5a4030,
  sparkleHot: 0xffffff,
  ballRed: 0xe8384f,
  ballWhite: 0xf4f4f4,
  ballLine: 0x2a2a2a,
} as const

// 기운 쪽마다 반점의 색. 가운데, 밝은 쪽, 어두운 쪽이다. 아무 도구도 안 쓴 알은 흐린 무늬라 일할수록 색이 드러난다
const SPOT_COLORS: Readonly<Record<Lean | 'none', readonly [number, number, number]>> = {
  none: [0xddd5bc, 0xe8e0c8, 0xcbc3a8],
  shell: [0xe8784f, 0xf4b090, 0xc85a35],
  edit: [C.spot, C.spotLight, C.spotShade],
  read: [0xb08ad8, 0xd4bdf0, 0x8c66b8],
  test: [0xf2d24b, 0xf8e690, 0xd0b030],
  web: [0x7ab4e8, 0xb4d6f4, 0x5a90c8],
  agent: [0xc8a080, 0xe0c8b0, 0xa88060],
}

// 알 몸통 14x13. 4세대 알 스프라이트를 둥글게 줄여 다시 찍은 것. 외곽선, 위쪽 하이라이트, 오른쪽 아래 그림자
const EGG_BODY = [
  '.....kkkk.....',
  '...kkweeekk...',
  '..kewweeeehk..',
  '.keewweeeeehk.',
  '.keeeeeeeeehk.',
  'keeeeeeeeeehhk',
  'keeeeeeeeeehhk',
  'keeeeeeeeehhhk',
  'keeeeeeeehhhhk',
  'keeeeeeehhhhhk',
  '.kssssssssssk.',
  '..kksssssskk..',
  '....kkkkkk....',
]
// 연두 반점 무늬. 알마다 하나를 골라 몸통에 칠한다. (x, y) 는 몸통 폭과 키에 대한 비율, r 은 폭에 대한 비율인 원이다
const SPOTS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  // 4세대 알의 무늬
  [[0.12, 0.5, 0.2], [0.6, 0.5, 0.09], [0.8, 0.66, 0.16], [0.3, 0.9, 0.12], [0.84, 0.9, 0.05]],
  // 점 셋
  [[0.25, 0.4, 0.13], [0.7, 0.45, 0.13], [0.48, 0.78, 0.13]],
  // 왼쪽에 크게
  [[0.1, 0.55, 0.28], [0.75, 0.75, 0.08]],
  // 사선으로 셋
  [[0.25, 0.3, 0.1], [0.5, 0.55, 0.12], [0.78, 0.8, 0.14]],
  // 오른쪽 위에 둘
  [[0.7, 0.3, 0.16], [0.35, 0.72, 0.1]],
  // 기본 알. 위 오른쪽, 왼쪽 큰 점, 오른쪽 아래, 아래
  [[0.6, 0.27, 0.13], [0.2, 0.52, 0.17], [0.85, 0.6, 0.15], [0.42, 0.88, 0.15]],
]
const EGG_PALETTE = {
  k: C.eggLine,
  w: C.eggShine,
  e: C.egg,
  h: C.eggLight,
  s: C.eggShade,
  G: C.spot,
  g: C.spotLight,
  D: C.spotShade,
  c: C.crack,
}
// 금이 간 알의 금 모양들. 알마다 하나를 골라 그린다
const CRACKS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // 위에서 내려오다 아래에서 두 갈래로 갈라진다
  [[5, 2], [6, 3], [7, 4], [7, 5], [6, 6], [8, 6], [5, 7], [9, 7], [6, 8]],
  // 가운데 짧은 금
  [[7, 3], [6, 4], [7, 5]],
  // 지그재그로 내려오다 옆으로 한 칸 갈라진다
  [[7, 2], [6, 3], [7, 4], [8, 4], [7, 5], [6, 6]],
  // 껍질 꼭대기가 깨져 두 갈래로 내려온다
  [[7, 0], [7, 1], [6, 2], [8, 2], [6, 3], [7, 4]],
  // 오른쪽 위에서 내려오다 옆으로 한 칸 갈라진다
  [[8, 2], [7, 3], [7, 4], [8, 4], [7, 5], [6, 6]],
]
// 일하는 세션의 알이 기우는 각도(도). 오뚝이처럼 크게 한 번, 작게 한 번 흔들리고 쉰다. 음수는 왼쪽이다
const ROCK = [0, -15, -25, -15, 0, 15, 25, 15, 0, -10, 0, 10, 0, 0, 0, 0, 0, 0]
// 기운 알을 담는 칸. 바닥 줄이 알의 바닥이고, 가장 크게 기울어도 잘리지 않는다
const ROCK_WIDTH = 20
const ROCK_HEIGHT = 15

export function hash(text: string): number {
  let n = 2166136261
  for (let i = 0; i < text.length; i++) {
    n = Math.imul(n ^ text.charCodeAt(i), 16777619)
  }
  return n >>> 0
}

// 픽셀 그림판. 비운 픽셀은 터미널 배경이 비친다
type Canvas = { width: number; height: number; px: Uint32Array }

function canvasOf(width: number, height: number): Canvas {
  return { width, height, px: new Uint32Array(width * height).fill(CLEAR) }
}

function put(canvas: Canvas, x: number, y: number, color: number) {
  if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
    canvas.px[y * canvas.width + x] = color
  }
}

function sprite(canvas: Canvas, x: number, y: number, rows: string[], palette: Record<string, number>) {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const color = palette[row[dx] ?? '.']
      if (color !== undefined) {
        put(canvas, x + dx, y + dy, color)
      }
    }
  })
}

// 몸통에 알 key 로 고른 반점과, 금 간 알이면 금을 칠한다
function paintedEgg(key: string, stage: 'egg' | 'cracked'): string[][] {
  const width = EGG_BODY[0]!.length
  const height = EGG_BODY.length
  const spots = SPOTS[hash(`spots:${key}`) % SPOTS.length]!
  const rows = EGG_BODY.map((row, y) =>
    [...row].map((c, x) => {
      if (c !== 'e' && c !== 'h' && c !== 's') {
        return c
      }
      const hit = spots.some(([bx, by, r]) => {
        const dx = (x + 0.5) / width - bx
        const dy = ((y + 0.5) / height - by) * (height / width)
        return dx * dx + dy * dy <= r * r
      })
      return hit ? (c === 's' ? 'D' : 'G') : c
    }),
  )
  if (stage === 'cracked') {
    // 프레임마다 바뀌지 않게 알 key 로 고른다
    for (const [x, y] of CRACKS[hash(`crack:${key}`) % CRACKS.length]!) {
      rows[y]![x] = 'c'
    }
  }
  return rows
}

const eggSprites = new Map<string, string[]>()

// 알 key 의 무늬와 금으로 칠한 알을 angle 도만큼 기울인 그림. ROCK_WIDTH x ROCK_HEIGHT 이고 바닥 줄이 알의 바닥이다
export function eggSprite(key: string, stage: 'egg' | 'cracked', angle: number): string[] {
  const id = `${key}:${stage}:${angle}`
  const cached = eggSprites.get(id)
  if (cached) {
    return cached
  }
  const source = paintedEgg(key, stage)
  const width = source[0]!.length
  const height = source.length
  // 아랫면 곡률 중심을 축으로 돌리고, 기운 쪽으로 조금 굴려 둥근 바닥이 둥지에 닿은 채 기울게 한다
  const radius = width / 2 - 0.5
  const a = (angle * Math.PI) / 180
  const pivotX = width / 2
  const pivotY = height - radius
  const outX = ROCK_WIDTH / 2 + radius * a * 0.4
  const outY = ROCK_HEIGHT - radius
  const sample = (x: number, y: number) => {
    const dx = x - outX
    const dy = y - outY
    const sx = Math.floor(dx * Math.cos(-a) - dy * Math.sin(-a) + pivotX)
    const sy = Math.floor(dx * Math.sin(-a) + dy * Math.cos(-a) + pivotY)
    return source[sy]?.[sx] ?? '.'
  }
  // 칸을 3x3 으로 나눠 반 넘게 알 안이면 칠한다. 한 점만 읽으면 테두리가 들쭉날쭉하다. 색은 칸 중심에서 읽는다
  const grid = Array.from({ length: ROCK_HEIGHT }, (_, y) =>
    Array.from({ length: ROCK_WIDTH }, (_, x) => {
      let inside = 0
      for (const oy of [1 / 6, 1 / 2, 5 / 6]) {
        for (const ox of [1 / 6, 1 / 2, 5 / 6]) {
          inside += sample(x + ox, y + oy) === '.' ? 0 : 1
        }
      }
      if (inside < 5) {
        return '.'
      }
      const center = sample(x + 0.5, y + 0.5)
      return center === '.' ? 'e' : center
    }),
  )
  // 이웃이 하나뿐인 칸은 돌리다 생긴 돌기라 지운다. 지우면 또 생길 수 있어 없을 때까지 되풀이한다
  const neighbours = (x: number, y: number) =>
    [grid[y]?.[x - 1], grid[y]?.[x + 1], grid[y - 1]?.[x], grid[y + 1]?.[x]].filter(c => c !== undefined && c !== '.').length
  for (let changed = true; changed; ) {
    changed = false
    grid.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c !== '.' && neighbours(x, y) < 2) {
          row[x] = '.'
          changed = true
        }
      }),
    )
  }
  // 1칸 외곽선은 돌리면 구멍이 나서, 모양만 돌리고 바깥 둘레를 외곽선으로 다시 칠한다
  const filled = (x: number, y: number) => (grid[y]?.[x] ?? '.') !== '.'
  const rows = grid.map((row, y) =>
    row
      .map((c, x) => {
        if (c === '.') {
          return '.'
        }
        if (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1)) {
          return 'k'
        }
        return c === 'k' ? 'e' : c
      })
      .join(''),
  )
  eggSprites.set(id, rows)
  return rows
}
// 위아래 두 픽셀을 반 블록 한 칸에 담는다. 둘 다 비면 빈칸으로 둔다
function pixelCells(canvas: Canvas, out: number[]) {
  for (let row = 0; row < canvas.height / 2; row++) {
    for (let x = 0; x < canvas.width; x++) {
      const top = canvas.px[row * 2 * canvas.width + x] ?? CLEAR
      const bottom = canvas.px[(row * 2 + 1) * canvas.width + x] ?? CLEAR
      if (top === CLEAR && bottom === CLEAR) {
        out.push(SPACE, CLEAR, CLEAR)
      } else if (top === CLEAR) {
        out.push(LOWER_HALF, bottom, CLEAR)
      } else {
        out.push(UPPER_HALF, top, bottom)
      }
    }
  }
}

// 입력창 위 그림의 칸 수. 반 블록 한 칸에 픽셀 두 줄이 들어가 기운 알(20x15)이 8줄에 담긴다
export const EGG_COLUMNS = ROCK_WIDTH
export const EGG_LINES = Math.ceil(ROCK_HEIGHT / 2)
// 깨어난 포켓몬은 이 안에 들어가게 줄인다. 통통 뛰어도 위가 잘리지 않게 그림 높이보다 조금 작다
export const MON_SIZE = 14

// 막 진화한 포켓몬의 진화 장면. 원작처럼 진화 전 모습으로 잠깐 서 있다가(start), 하얗게 빛나며 진화 전과 뒤 모습을
// 번갈아 보이고 점점 빨라진 뒤(morph), 하얗게 번쩍이고(flash), 새 모습으로 선다(done). 값은 장면이 시작한 뒤 ms 다
export const EVOLVE_START_MS = 2000
export const EVOLVE_MORPH_MS = 9000
export const EVOLVE_FLASH_MS = 9750
export const EVOLVE_MS = 13000
export type EvolvePhase = 'start' | 'morph' | 'flash' | 'done'

export function evolvePhase(elapsed: number): EvolvePhase {
  if (elapsed < EVOLVE_START_MS) {
    return 'start'
  }
  if (elapsed < EVOLVE_MORPH_MS) {
    return 'morph'
  }
  return elapsed < EVOLVE_FLASH_MS ? 'flash' : 'done'
}

// morph 동안 이 순간 진화 뒤 모습이 보이는지. 처음엔 1초에 한 번 바뀌고 끝에는 1초에 네 번 바뀐다
export function isMorphNew(elapsed: number): boolean {
  const t = Math.max(0, elapsed - EVOLVE_START_MS) / 1000
  const span = (EVOLVE_MORPH_MS - EVOLVE_START_MS) / 1000
  const flips = t + (3 / (2 * span)) * t * t
  return Math.floor(flips) % 2 === 1
}

// 스프라이트를 아직 못 불러왔을 때 대신 그리는 몬스터볼
const BALL = ['..rrrr..', '.rrrrrr.', 'rrrrrrrr', 'kkkwwkkk', 'wwwkkwww', 'wwwwwwww', '.wwwwww.', '..wwww..']
const BALL_PALETTE = { r: C.ballRed, w: C.ballWhite, k: C.ballLine }
// 일하는 동안 포켓몬이 통통 뛰는 높이
const HOP = [0, 1, 2, 1, 0, 0, 0, 0]

// 입력창 위에 그릴 것. image 가 없으면 아직 스프라이트를 못 불러온 것이라 몬스터볼을 그린다
export type BandArt =
  | { kind: 'egg'; key: string; stage: 'egg' | 'cracked'; lean: Lean | null; isShaking: boolean }
  | { kind: 'mon'; image: Pixels | undefined; isHopping: boolean }
  | { kind: 'evolve'; before: Pixels | undefined; after: Pixels | undefined; elapsed: number }

function blit(canvas: Canvas, x: number, y: number, image: Pixels) {
  image.px.forEach((color, i) => {
    if (color !== CLEAR) {
      put(canvas, x + (i % image.width), y + Math.floor(i / image.width), color)
    }
  })
}

// 몸 모양 그대로 하얗게 칠한 그림
function silhouette(image: Pixels): Pixels {
  return { ...image, px: image.px.map(color => (color === CLEAR ? CLEAR : C.sparkleHot)) }
}

// 바닥 가운데에 세운다. lift 만큼 띄운다
function stand(canvas: Canvas, image: Pixels | undefined, lift: number) {
  if (!image) {
    sprite(canvas, Math.floor((canvas.width - 8) / 2), canvas.height - 8 - lift, BALL, BALL_PALETTE)
    return
  }
  blit(canvas, Math.floor((canvas.width - image.width) / 2), canvas.height - image.height - lift, image)
}

// frame 번째 그림의 Raster 칸
export function drawBand(art: BandArt, frame: number): Uint32Array {
  const canvas = canvasOf(EGG_COLUMNS, EGG_LINES * 2)
  if (art.kind === 'egg') {
    const angle = art.isShaking ? ROCK[frame % ROCK.length]! : 0
    const [spot, light, shade] = SPOT_COLORS[art.lean ?? 'none']
    const palette = { ...EGG_PALETTE, G: spot, g: light, D: shade }
    sprite(canvas, 0, canvas.height - ROCK_HEIGHT, eggSprite(art.key, art.stage, angle), palette)
  } else if (art.kind === 'mon') {
    stand(canvas, art.image, art.isHopping ? HOP[frame % HOP.length]! : 0)
  } else {
    const phase = evolvePhase(art.elapsed)
    const shown =
      phase === 'start'
        ? art.before
        : phase === 'done'
          ? art.after
          : phase === 'flash' || isMorphNew(art.elapsed)
            ? art.after && silhouette(art.after)
            : art.before && silhouette(art.before)
    stand(canvas, shown, 0)
  }
  const out: number[] = []
  pixelCells(canvas, out)
  return Uint32Array.from(out)
}
