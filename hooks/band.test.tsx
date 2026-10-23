import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Mon, SessionEgg } from '../types'
import { drawBand } from './egg-lib'
import { HATCH_MS, hatchSpecies, MERGE_XP } from './grow-lib'

const NOW = 1_000_000
const MINUTE = 60_000
const BAND = { plugin: 'pokemon-egg', component: 'AbovePrompt', requestId: 'band' } as const
const props = (over: { isWorking?: boolean; maxRows?: number } = {}) =>
  ({ hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, ...over }) as never

type Run = (argv: string[]) => { exitCode: number; stdout: string }

// 플러그인 아래에서 엔진 대신 답한다. 세션 id 는 s1, 저장소는 GitHub 의 /p/app 이고 feat/x 브랜치다
// 저장한 값을 테스트에서 읽게 store 는 넘겨받은 객체에 바로 쓴다
type Setup = { store?: Record<string, unknown>; run?: Run; files?: Record<string, string>; id?: () => string }

function engine(on: On, { store = {}, run = () => ({ exitCode: 1, stdout: '' }), files = {}, id = () => 's1' }: Setup = {}) {
  const clock = mock.clock(on, { now: NOW })
  const toasts: string[] = []
  on('store.get', (_, e) => ({ value: store[(e as { key: string }).key] }) as never)
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    store[key] = value
    return { value: undefined } as never
  })
  on('store.delete', (_, e) => {
    delete store[(e as { key: string }).key]
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: Object.keys(store) }) as never)
  on('env.get', (_, e) => ({ value: (e as { name: string }).name === 'HOME' ? '/home/test' : undefined }) as never)
  on('fs.exists', () => ({ value: false }))
  on('fs.read', (_, e) => {
    const text = files[(e as unknown as { path: string }).path]
    if (text === undefined) {
      throw new Error('ENOENT')
    }
    return { value: text } as never
  })
  on('fs.write', () => ({ value: undefined }) as never)
  on('http.fetch', () => ({ value: { ok: false, status: 404, text: '', headers: {} } }) as never)
  on('process.run', (_, e) => {
    const { argv = [] } = e as unknown as { argv?: string[] }
    const ran = argv.includes('rev-parse')
      ? { exitCode: 0, stdout: 'feat/x\n' }
      : argv.includes('get-url')
        ? { exitCode: 0, stdout: 'git@github.com:me/app.git\n' }
        : run(argv)
    return { value: { ...ran, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('ui.toast', (_, e) => {
    toasts.push((e as unknown as { text: string }).text)
    return { value: undefined } as never
  })
  on('command.register', () => ({ value: { name: 'pokemon-egg' } }) as never)
  on('session.id', () => ({ value: id() }))
  on('session.cwd', () => ({ value: '/p/app' }))
  on('session.repo', () => ({ value: { root: '/p/app', remote: 'git@github.com:me/app.git' } }) as never)
  on('session.start', ($, e) => e as never)
  on('session.end', ($, e) => e as never)
  on('prompt.submit', ($, e) => e as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('classic.SessionStart', ($, e) => e as never)
  on('ui.blit', () => ({ value: {} }) as never)
  on('tool.call', () => ({ result: {} }) as never)
  on('command.run', () => ({ text: '' }) as never)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return { clock, store, toasts }
}

const cellsOf = (cells: Uint32Array) => (new Uint8Array(cells.buffer) as Uint8Array & { toBase64(): string }).toBase64()

test('처음 연 세션은 새 알을 받아 저장하고, 입력창 위에 서 있는 알을 그린다', async ($, on) => {
  const { store, clock } = engine(on)
  await $.session.start({ source: 'startup', cwd: '/p/app' } as never)
  expect(store['egg:s1']).toMatchObject({ key: 's1', at: NOW, workMs: 0, root: '/p/app', branch: 'feat/x', mon: null })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  const art = { kind: 'egg', key: 's1', stage: 'egg', lean: null, isShaking: false } as const
  expect((await ui.find({ key: 'egg' }))?.props).toMatchObject({ columns: 20, rows: 8, cells: cellsOf(drawBand(art, 0)) })
  expect(await ui.find({ type: 'Text', text: 'EGG' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /doesn't seem close to hatching/ })).toBeDefined()
  await ui.unmount()
  await clock.advance(1000)
})

test('이어 연 세션은 저장해 둔 알을 그대로 받고, 앞선 버전이 저장한 알도 읽는다', async ($, on) => {
  const { store, clock } = engine(on, { store: { 'egg:s1': { key: 'old', at: 5 } } })
  await $.session.start({ source: 'resume', cwd: '/p/app' } as never)
  expect(store['egg:s1']).toMatchObject({ key: 'old', at: 5, workMs: 0, tally: {} })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props({ isWorking: true }) })
  const art = { kind: 'egg', key: 'old', stage: 'egg', lean: null, isShaking: true } as const
  expect((await ui.find({ key: 'egg' }))?.props).toMatchObject({ cells: cellsOf(drawBand(art, 0)) })
  await ui.unmount()
  await clock.advance(1000)
})

test('알이 들어갈 높이가 없거나 터미널이 아니면 알을 그리지 않는다', async ($, on) => {
  const { clock } = engine(on)
  await $.session.start({ source: 'startup', cwd: '/p/app' } as never)

  const short = await $.ui.mount({ ...BAND, surface: 'terminal', props: props({ maxRows: 4 }) })
  expect(await short.find({ key: 'egg' })).toBeUndefined()
  await short.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: props() })
  expect(await desktop.find({ type: 'Text', text: 'EGG' })).toBeUndefined()
  await desktop.unmount()
  await clock.advance(1000)
})

test('일한 시간과 쓴 도구가 쌓이고, 한 시간 일하면 기운 쪽의 포켓몬이 깨어나 그 뒤로는 경험치를 먹는다', async ($, on) => {
  const { store, clock, toasts } = engine(on)
  await $.session.start({ source: 'startup', cwd: '/p/app' } as never)
  await $.prompt.submit({ text: '고쳐줘' } as never)
  await $.tool.call({ tool: 'Bash', id: 't1', command: 'bun test' } as never)
  await $.tool.call({ tool: 'Bash', id: 't2', command: 'npm test' } as never)
  await $.tool.call({ tool: 'Edit', id: 't3', file_path: '/p/app/a.ts', old_string: 'a', new_string: 'b' } as never)
  await clock.advance(30 * MINUTE)
  const half = store['egg:s1'] as SessionEgg
  expect(half.workMs).toBe(30 * MINUTE)
  expect(half.tally).toEqual({ test: 2, edit: 1 })
  expect(half.mon).toBeNull()

  // 쉬는 동안은 세지 않는다
  await $.turn.complete({ answer: '했어요', reason: 'answer' } as never)
  await clock.advance(60 * MINUTE)
  expect((store['egg:s1'] as SessionEgg).workMs).toBe(30 * MINUTE)

  await $.prompt.submit({ text: '이어서' } as never)
  await clock.advance(HATCH_MS - 30 * MINUTE)
  const hatched = store['egg:s1'] as SessionEgg
  expect(hatched.mon).toBe('s1')
  const born = store['mon:s1'] as Mon
  expect(born).toMatchObject({ key: 's1', species: hatchSpecies('s1', 'test'), xp: 0, lean: 'test', branch: 'feat/x' })
  expect(toasts.some(text => /hatched into/.test(text))).toBe(true)

  await clock.advance(30 * MINUTE)
  expect((store['mon:s1'] as Mon).xp).toBe(30)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: props() })
  expect(await ui.find({ type: 'Text', text: /Lv7/ })).toBeDefined()
  await ui.unmount()
})

test('MR 이 머지되면 알이 바로 깨어나고, 같은 MR 로 다른 알은 깨어나지 않는다', async ($, on) => {
  let state = 'OPEN'
  const pr = () => ({ exitCode: 0, stdout: JSON.stringify([{ number: 7, state, url: 'https://github.com/me/app/pull/7' }]) })
  const ended: SessionEgg = {
    key: 'other',
    at: 0,
    workMs: 0,
    tally: {},
    root: '/p/app',
    branch: 'feat/x',
    mr: null,
    merged: false,
    mon: null,
    endedAt: NOW - MINUTE,
    savedAt: NOW - MINUTE,
  }
  const { store, clock } = engine(on, { store: { 'egg:other': ended }, run: argv => (argv[0] === 'gh' ? pr() : { exitCode: 1, stdout: '' }) })
  await $.session.start({ source: 'startup', cwd: '/p/app' } as never)
  await clock.advance(1000)
  expect((store['egg:s1'] as SessionEgg).mr).toEqual({ iid: 7, state: 'opened', url: 'https://github.com/me/app/pull/7' })

  state = 'MERGED'
  await clock.advance(3 * MINUTE)
  expect(store['egg:s1']).toMatchObject({ merged: true, mon: 's1' })
  expect(store['mon:s1']).toBeDefined()
  expect(store['mr:/p/app\tfeat/x\t7']).toBe('s1')
  // 닫힌 세션의 알은 같은 MR 이라 깨어나지 않고, 기다릴 것이 없어 다음 차례에 지워진다
  await clock.advance(3 * MINUTE)
  expect(store['mon:other']).toBeUndefined()
  await clock.advance(3 * MINUTE)
  expect(store['egg:other']).toBeUndefined()
})

test('깨어난 포켓몬은 MR 머지로 경험치를 받는다', async ($, on) => {
  const mine: Partial<SessionEgg> = { key: 's1', at: 0, mon: 's1', root: '/p/app', branch: 'feat/x' }
  const born: Mon = { key: 's1', species: 4, xp: 0, at: 0, lean: null, root: '/p/app', branch: 'feat/x' }
  const merged = { exitCode: 0, stdout: JSON.stringify([{ number: 9, state: 'MERGED', url: 'u' }]) }
  const { store, clock } = engine(on, { store: { 'egg:s1': mine, 'mon:s1': born }, run: argv => (argv[0] === 'gh' ? merged : { exitCode: 1, stdout: '' }) })
  await $.session.start({ source: 'resume', cwd: '/p/app' } as never)
  await clock.advance(1000)
  expect((store['mon:s1'] as Mon).xp).toBe(MERGE_XP)
  // 한 시간 일한 만큼이라 Lv9 가 되고, 파이리는 Lv16 에 진화하니 아직 그대로다
  expect((store['mon:s1'] as Mon).species).toBe(4)
})

test('/clear 는 알을 새 세션 id 로 옮기고, 세션이 닫히면 닫힌 시각을 남긴다', async ($, on) => {
  let id = 's1'
  const { store, clock } = engine(on, { id: () => id })
  await $.session.start({ source: 'startup', cwd: '/p/app' } as never)
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  expect((store['egg:s1'] as SessionEgg).endedAt).toBeNull()
  id = 's2'
  await $.classic.SessionStart({ source: 'clear', session_id: 's2' } as never)
  expect(store['egg:s1']).toBeUndefined()
  expect(store['egg:s2']).toMatchObject({ key: 's1', endedAt: null })

  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's2' } as never)
  expect((store['egg:s2'] as SessionEgg).endedAt).toBe(NOW)
  await clock.advance(1000)
})

test('처음 켜면 mod-hud 의 박스를 한 번 옮겨 오고, box 와 dex 명령이 보인다', async ($, on) => {
  const legacy = JSON.stringify({
    box: [
      { key: 'day:1', species: 5, root: '/r', branch: null, label: '', at: 1 },
      { key: 'day:2', species: 5, root: '/r', branch: null, label: '', at: 2 },
    ],
    seen: [5, 25],
  })
  const { store, clock, toasts } = engine(on, { files: { '/home/test/.claude/mod-hud-pokedex.json': legacy } })
  await $.session.start({ source: 'startup', cwd: '/p/app' } as never)
  expect(store['mon:day:1']).toMatchObject({ species: 5 })
  expect(store['legacy:seen']).toEqual([5, 25])
  expect(toasts).toContain("Moved 2 Pokémon over from mod-hud's PC BOX.")

  const box = await $.command.run({ command: 'pokemon-egg', args: 'box' } as never)
  expect((box as { text: string }).text).toBe('PC BOX 2\nNo.005 NO.005 ×2  Lv16')
  const dex = await $.command.run({ command: 'pokemon-egg', args: 'dex' } as never)
  expect((dex as { text: string }).text.split('\n')[0]).toBe('POKéDEX 3/151')

  // 두 번째로 켜도 다시 옮기지 않는다
  delete store['mon:day:2']
  await $.session.start({ source: 'startup', cwd: '/p/app' } as never)
  expect(store['mon:day:2']).toBeUndefined()
  await clock.advance(1000)
})
