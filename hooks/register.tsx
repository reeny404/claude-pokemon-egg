import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Lean, Mon, Mr, Scene, SessionEgg } from '../types'
import { rarityOf } from './dex-data'
import { drawBand, EGG_COLUMNS, EGG_LINES, EVOLVE_MS, evolvePhase, MON_SIZE } from './egg-lib'
import type { BandArt } from './egg-lib'
import {
  addTally,
  eggNote,
  evolveLevelOf,
  grow,
  groupBox,
  hatch,
  HATCH_MS,
  leanOf,
  leanOfTool,
  LEAN_TYPES,
  levelOf,
  levelProgress,
  MERGE_XP,
  migrateDex,
  newEgg,
  seenOf,
  stageOf,
  xpBar,
} from './grow-lib'
import { crop, decodePng, fit } from './png-lib'
import type { Pixels } from './png-lib'
import {
  gitlabProjectApi,
  isGithubRemote,
  isLongLivedBranch,
  parseGithubPr,
  parseGitlabMr,
  parseWorktrees,
  readEnvValue,
  touchedPath,
  treeOfPath,
} from './repo-lib'

// 이 세션의 알, 깨어난 포켓몬, 입력창 위에 보이는 장면
const egg = atom({ plugin: 'pokemon-egg', key: 'egg' } as const, null)
const mon = atom({ plugin: 'pokemon-egg', key: 'mon' } as const, null)
const scene = atom({ plugin: 'pokemon-egg', key: 'scene' } as const, null)

const config = { gitlabUrl: '', language: 'en' }

// 흔들리는 알과 뛰는 포켓몬을 다시 칠하는 간격
const TICK_MS = 250
// 그린 직후에는 Raster 가 아직 화면에 붙지 않아 칠하기를 거절할 수 있어, 거절이 이만큼 이어질 때만 멈춘다
const DENY_LIMIT = 8
// 일한 시간을 알에 더하는 간격
const FLUSH_MS = 60 * 1000
// 한 번에 더하는 일한 시간의 끝. 일하는 중에 컴퓨터가 잠들면 그 시간은 세지 않는다
const FLUSH_MAX_MS = 10 * 60 * 1000
// MR 을 다시 보는 간격. 닫힌 세션의 알은 열린 세션 중 한 곳만 이 간격으로 본다
const MR_CHECK_MS = 3 * 60 * 1000
// 닫힌 세션의 알은 이만큼 MR 머지를 기다리다 지운다
const EGG_KEEP_MS = 14 * 24 * 60 * 60 * 1000
// 닫혔다는 소식 없이 이만큼 저장하지 않은 세션은 닫힌 것으로 본다
const STALE_MS = 3 * 24 * 60 * 60 * 1000
// 알이 깨어나는 장면에서 금 간 알이 흔들리는 시간
const HATCH_SHAKE_MS = 2500
// 장면 글이 남는 시간
const CAPTION_MS = 60 * 1000
// 일할 때 쓰는 도구. 이 도구가 다른 worktree 를 손대면 그 브랜치를 세션의 브랜치로 쓴다
const WORK_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash'])

const eggKey = (id: string) => `egg:${id}`
const monKey = (key: string) => `mon:${key}`
// MR 하나는 포켓몬 하나에만 보상을 준다. 먼저 머지를 본 알의 key 가 남는다
const claimKey = (root: string, branch: string, mr: Mr) => `mr:${root}\t${branch}\t${mr.iid}`

let sessionId = ''
// /clear 로 끝난 세션 id. 이어지는 새 세션 id 가 이 세션의 알을 받는다
let clearedFrom: string | null = null
// 지금 턴이 일하기 시작한 시각, 또는 일한 시간을 마지막으로 더한 시각. 쉬는 중이면 null
let workingSince: number | null = null
// 아직 알에 더하지 않은 도구 횟수
let pendingTally: SessionEgg['tally'] = {}

let frame = 0
let timer: ReturnType<EngineInterface['clock']['every']> | null = null
let denied = 0
// 알을 그린 입력창 위 band 의 requestId. 칠할 때 이곳을 다시 칠한다
let band: string | null = null
// 지난번 칠할 때 장면이 움직이고 있었는지. 멈추면 글을 바꾸러 다시 그린다
let wasMoving = false

function base64Of(cells: Uint32Array): string {
  // 엔진의 Uint8Array 는 toBase64 를 갖지만 TypeScript 의 lib 에는 아직 없다
  const bytes = new Uint8Array(cells.buffer) as Uint8Array & { toBase64(): string }
  return bytes.toBase64()
}

// 앞선 버전이 저장한 알은 없는 칸을 새 알의 값으로 채운다
async function readEgg($: EngineInterface, id: string): Promise<SessionEgg | null> {
  const saved = (await $.store.get(eggKey(id))) as Partial<SessionEgg> | undefined
  return saved?.key ? { ...newEgg(saved.key, saved.at ?? 0), ...saved } : null
}

async function readMon($: EngineInterface, key: string): Promise<Mon | null> {
  return ((await $.store.get(monKey(key))) as Mon | undefined) ?? null
}

async function allMons($: EngineInterface): Promise<Mon[]> {
  const keys = (await $.store.keys()).filter(key => key.startsWith('mon:'))
  return (await Promise.all(keys.map(key => $.store.get(key) as Promise<Mon>))).filter(Boolean)
}

// 이 세션의 알을 고친다. 닫힌 세션의 알을 대신 보는 다른 세션과 겹치지 않게 저장된 값을 읽어 고친다
async function editOwnEgg($: EngineInterface, edit: (saved: SessionEgg) => SessionEgg): Promise<SessionEgg> {
  const now = await $.clock.now()
  const saved = (await readEgg($, sessionId)) ?? (await read($, egg)) ?? newEgg(sessionId, now)
  const next = { ...edit(saved), savedAt: now }
  await $.store.set(eggKey(sessionId), next)
  await update($, egg, () => next)
  return next
}

// 세션 id 의 알과 포켓몬을 불러 band 에 올린다. 처음 연 세션이면 새 알을 받는다
async function takeEgg($: EngineInterface, id: string) {
  sessionId = id
  const now = await $.clock.now()
  const saved = await readEgg($, id)
  const mine = saved ? { ...saved, endedAt: null, savedAt: now } : newEgg(id, now)
  await $.store.set(eggKey(id), mine)
  await update($, egg, () => mine)
  const partner = mine.mon ? await readMon($, mine.mon) : null
  await update($, mon, () => partner)
  if (partner) {
    loadSprite($, partner.species)
  }
}

// 세션 id 가 바뀌었으면 그 세션의 알로 바꾼다. /clear 로 바뀐 것이면 같은 일을 잇는 것이라 알을 그대로 넘긴다
// classic.SessionStart 가 mod 에 오지 않는 환경이 있어 다음 프롬프트에서도 확인한다
async function followSession($: EngineInterface) {
  const id = await $.session.id()
  if (!sessionId || id === sessionId) {
    return
  }
  if (clearedFrom === sessionId) {
    const carried = await readEgg($, sessionId)
    if (carried) {
      await $.store.set(eggKey(id), { ...carried, endedAt: null })
      await $.store.delete(eggKey(sessionId))
    }
  }
  clearedFrom = null
  await takeEgg($, id)
}

// ---- 일한 시간과 도구

async function flush($: EngineInterface) {
  const now = await $.clock.now()
  const worked = workingSince === null ? 0 : Math.max(0, Math.min(now - workingSince, FLUSH_MAX_MS))
  if (workingSince !== null) {
    workingSince = now
  }
  const tally = pendingTally
  pendingTally = {}
  if (worked === 0 && Object.keys(tally).length === 0) {
    return
  }
  const born: { mon: Mon | null } = { mon: null }
  await editOwnEgg($, saved => {
    const next = { ...saved, workMs: saved.workMs + worked, tally: addTally(saved.tally, tally) }
    if (next.mon || next.workMs < HATCH_MS) {
      return next
    }
    born.mon = hatch(next, now)
    return { ...next, mon: born.mon.key }
  })
  if (born.mon) {
    await welcome($, born.mon, now)
  } else if (worked > 0) {
    await feed($, worked / 60_000, now)
  }
}

// 이 세션의 알에서 막 깨어난 포켓몬을 박스에 넣고 깨어나는 장면을 띄운다
async function welcome($: EngineInterface, born: Mon, now: number) {
  await $.store.set(monKey(born.key), born)
  await update($, mon, () => born)
  await update($, scene, () => ({ kind: 'hatch', species: born.species, from: born.species, at: now }))
  loadSprite($, born.species)
  $.ui.toast(`Oh? Your EGG hatched into ${await nameOf($, born.species)}!`)
}

// 이 세션의 포켓몬에 경험치를 준다. 진화하면 진화 장면을 띄운다
async function feed($: EngineInterface, xp: number, now: number) {
  const key = (await read($, egg))?.mon
  const saved = key ? await readMon($, key) : null
  if (!saved) {
    return
  }
  const { mon: grown, from } = grow(saved, xp)
  await $.store.set(monKey(grown.key), grown)
  await update($, mon, () => grown)
  if (from !== null) {
    await update($, scene, () => ({ kind: 'evolve', species: grown.species, from, at: now }))
    loadSprite($, from)
    loadSprite($, grown.species)
  }
}

// ---- 브랜치와 MR

let repoRoot: string | null = null

async function git($: EngineInterface, cwd: string, args: string[]): Promise<string | null> {
  try {
    const ran = await $.process.run(['git', ...args], { cwd })
    return ran.exitCode === 0 ? ran.stdout.trim() : null
  } catch {
    return null
  }
}

// 처음 켠 곳의 저장소와 브랜치. 이어 연 알은 이미 아는 브랜치를 지킨다
async function noteStartBranch($: EngineInterface) {
  repoRoot = (await $.session.repo())?.root ?? null
  const mine = await read($, egg)
  if (!repoRoot || !mine || mine.branch) {
    return
  }
  const branch = await git($, await $.session.cwd(), ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch) {
    await editOwnEgg($, saved => ({ ...saved, root: repoRoot, branch }))
  }
}

// 도구가 같은 저장소의 다른 worktree 를 손대면 그 worktree 의 브랜치를 세션의 브랜치로 쓴다
async function noteWorkPath($: EngineInterface, input: { file_path?: unknown; notebook_path?: unknown; command?: unknown }) {
  const path = repoRoot ? touchedPath(input, await $.session.cwd()) : null
  if (!repoRoot || !path) {
    return
  }
  const listed = await git($, repoRoot, ['worktree', 'list', '--porcelain'])
  const tree = listed ? treeOfPath(parseWorktrees(listed), path) : null
  const mine = await read($, egg)
  if (tree?.branch && mine && tree.branch !== mine.branch) {
    await editOwnEgg($, saved => ({ ...saved, root: repoRoot, branch: tree.branch, mr: null, merged: false }))
  }
}

// 환경 변수 GITLAB_TOKEN 을 먼저 보고, 없으면 저장소의 .env.local 에서 읽는다
async function readToken($: EngineInterface, root: string): Promise<string | null> {
  const fromEnv = await $.env.get('GITLAB_TOKEN').catch(() => undefined)
  if (fromEnv) {
    return fromEnv
  }
  try {
    return readEnvValue(await $.fs.read(`${root}/.env.local`), 'GITLAB_TOKEN')
  } catch {
    return null
  }
}

// 브랜치의 가장 최근 MR. GitHub 는 gh CLI 로, GitLab 은 API 로 찾는다. 찾을 수 없으면 null
async function findMr($: EngineInterface, root: string, branch: string): Promise<Mr | null> {
  try {
    const remote = await git($, root, ['remote', 'get-url', 'origin'])
    if (!remote) {
      return null
    }
    if (isGithubRemote(remote)) {
      const argv = ['gh', 'pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'number,state,url']
      const ran = await $.process.run(argv, { cwd: root })
      return ran.exitCode === 0 ? parseGithubPr(ran.stdout) : null
    }
    const api = gitlabProjectApi(remote, config.gitlabUrl)
    const token = api ? await readToken($, root) : null
    if (!api || !token) {
      return null
    }
    const query = `source_branch=${encodeURIComponent(branch)}&order_by=updated_at&per_page=1`
    const res = await $.http.fetch(`${api}/merge_requests?${query}`, { headers: { 'PRIVATE-TOKEN': token } })
    return res.ok ? parseGitlabMr(res.text) : null
  } catch {
    return null
  }
}

// 알의 MR 을 새로 보고, 처음 머지된 걸 봤으면 보상을 준다. 바뀐 알을 돌려주고 그대로면 null
// 보상은 아직 알이면 깨어나기, 깨어났으면 경험치다. 다른 세션의 알이면 장면 없이 알림만 띄운다
async function checkMr($: EngineInterface, saved: SessionEgg, now: number, isOwn: boolean): Promise<SessionEgg | null> {
  const { root, branch } = saved
  if (!root || !branch || isLongLivedBranch(branch) || saved.merged) {
    return null
  }
  const mr = await findMr($, root, branch)
  if (!mr || JSON.stringify(mr) === JSON.stringify(saved.mr)) {
    return null
  }
  if (mr.state !== 'merged') {
    return { ...saved, mr }
  }
  const claim = claimKey(root, branch, mr)
  // shortcut: 읽고 쓰는 사이에 다른 세션이 같은 MR 머지를 보면 둘 다 보상받을 수 있음, $.store 에 비교 후 쓰기가 생기면 그걸로 바꾼다
  const owner = (await $.store.get(claim)) as string | undefined
  if (owner && owner !== saved.key) {
    return { ...saved, mr, merged: true }
  }
  await $.store.set(claim, saved.key)
  if (!saved.mon) {
    const born = hatch(saved, now)
    if (isOwn) {
      await welcome($, born, now)
    } else {
      await $.store.set(monKey(born.key), born)
      $.ui.toast(`!${mr.iid} was merged and its EGG hatched into ${await nameOf($, born.species)}!`)
    }
    return { ...saved, mr, merged: true, mon: born.key }
  }
  if (isOwn) {
    await feed($, MERGE_XP, now)
  } else {
    const kept = await readMon($, saved.mon)
    if (kept) {
      await $.store.set(monKey(kept.key), grow(kept, MERGE_XP).mon)
      $.ui.toast(`!${mr.iid} was merged and ${await nameOf($, kept.species)} gained ${MERGE_XP} EXP.`)
    }
  }
  return { ...saved, mr, merged: true }
}

async function checkMrs($: EngineInterface) {
  const now = await $.clock.now()
  const own = await read($, egg)
  const checked = own ? await checkMr($, own, now, true) : null
  if (checked) {
    await editOwnEgg($, saved => ({ ...saved, mr: checked.mr, merged: checked.merged, mon: checked.mon }))
  }
  // 닫힌 세션의 알은 열린 세션 중 한 곳만 본다
  // shortcut: 두 세션이 같은 순간 시각을 읽으면 둘 다 닫힌 세션의 알을 봄, 보상은 claim 이 막으니 MR 조회만 겹친다
  const last = Number((await $.store.get('poll:at')) ?? 0)
  if (now - last < MR_CHECK_MS) {
    return
  }
  await $.store.set('poll:at', now)
  for (const key of await $.store.keys()) {
    if (!key.startsWith('egg:') || key === eggKey(sessionId)) {
      continue
    }
    const saved = await readEgg($, key.slice('egg:'.length))
    // shortcut: 3일 넘게 일하지 않고 열어만 둔 세션도 닫힌 것으로 봄, 세션이 살아 있다는 표시를 따로 남길 때 그걸로 가린다
    const endedAt = saved?.endedAt ?? (saved && now - saved.savedAt > STALE_MS ? saved.savedAt : null)
    if (!saved || endedAt === null) {
      continue
    }
    // 더 기다릴 머지가 없는 알은 지운다. 깨어난 포켓몬은 박스에 남는다
    const isDone = saved.merged || !saved.branch || isLongLivedBranch(saved.branch) || saved.mr?.state === 'closed'
    if (isDone || now - endedAt > EGG_KEEP_MS) {
      await $.store.delete(key)
      continue
    }
    const next = await checkMr($, saved, now, false)
    if (next) {
      await $.store.set(key, next)
    }
  }
}

// ---- 기록 이전

// mod-hud 의 PC BOX 와 도감을 한 번 옮겨 온다. 원본 파일은 읽기만 한다
async function migrateOnce($: EngineInterface) {
  if (await $.store.get('migrated')) {
    return
  }
  await $.store.set('migrated', true)
  const home = await $.env.get('HOME')
  let text: string
  try {
    text = await $.fs.read(`${home}/.claude/mod-hud-pokedex.json`)
  } catch {
    return
  }
  const { mons, seen } = migrateDex(text)
  for (const one of mons) {
    if (!(await $.store.get(monKey(one.key)))) {
      await $.store.set(monKey(one.key), one)
    }
  }
  await $.store.set('legacy:seen', seen)
  if (mons.length > 0) {
    $.ui.toast(`Moved ${mons.length} Pokémon over from mod-hud's PC BOX.`)
  }
}

// ---- 스프라이트와 이름

// 포켓몬 그림과 이름은 PokeAPI 에서 처음 쓸 때 한 번 받아 이 폴더에 두고 다시 쓴다
const SPRITE_DIR = '.claude/pokemon-egg-sprites'
// 7세대 박스 아이콘. 처음부터 작게 그린 도트라 줄여도 덜 뭉개진다
const spriteUrl = (species: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons/${species}.png`
const speciesUrl = (species: number) => `https://pokeapi.co/api/v2/pokemon-species/${species}`

// 읽은 그림은 MON_SIZE 안에 들어가게 줄여 둔다. null 은 받은 파일이 깨져 이 세션에서는 다시 읽지 않는 것
const sprites = new Map<number, Pixels | null>()
const spritesLoading = new Set<number>()

// 받지 못하면 그동안 몬스터볼을 그리고, 받으면 다시 그린다
function loadSprite($: EngineInterface, species: number) {
  if (sprites.has(species) || spritesLoading.has(species)) {
    return
  }
  spritesLoading.add(species)
  void (async () => {
    try {
      const home = await $.env.get('HOME')
      if (!home) {
        return
      }
      const path = `${home}/${SPRITE_DIR}/icons/${species}.png`
      if (!(await $.fs.exists(path))) {
        const got = await $.process.run(['curl', '-fsSL', '--create-dirs', '-o', path, spriteUrl(species)])
        if (got.exitCode !== 0) {
          return
        }
      }
      const { base64 } = await $.fs.read(path, { as: 'bytes' })
      // 엔진의 Uint8Array 는 fromBase64 를 갖지만 TypeScript 의 lib 에는 아직 없다
      const bytes = (Uint8Array as unknown as { fromBase64(text: string): Uint8Array }).fromBase64(base64)
      try {
        sprites.set(species, fit(crop(decodePng(bytes)), MON_SIZE))
        $.ui.invalidate('ui.render')
      } catch {
        // 받다 끊긴 파일은 지워 다음 세션에서 다시 받게 한다
        sprites.set(species, null)
        await $.process.run(['rm', '-f', path])
      }
    } catch {
      // 네트워크나 파일을 못 쓰면 몬스터볼로 둔다
    } finally {
      spritesLoading.delete(species)
    }
  })()
}

const spriteOf = (species: number) => sprites.get(species) ?? undefined

// 설정한 언어의 이름. 파일에서 한 번 읽어 메모리에 두고, 모르는 이름은 PokeAPI 에서 받아 파일에 더한다
const names = new Map<number, string>()
const namesFailed = new Set<number>()
let namesRead: Promise<void> | null = null

const namesPath = (home: string) => `${home}/${SPRITE_DIR}/names-${config.language}.json`

async function nameOf($: EngineInterface, species: number): Promise<string> {
  const home = (await $.env.get('HOME')) ?? ''
  namesRead ??= (async () => {
    try {
      const saved = JSON.parse(await $.fs.read(namesPath(home))) as Record<string, string>
      for (const [no, name] of Object.entries(saved)) {
        names.set(Number(no), name)
      }
    } catch {
      // 처음이면 파일이 없다
    }
  })()
  await namesRead
  if (!names.has(species) && !namesFailed.has(species)) {
    try {
      const res = await $.http.fetch(speciesUrl(species))
      const parsed = res.ok ? (JSON.parse(res.text) as { names?: { name: string; language: { name: string } }[] }) : null
      const name = parsed?.names?.find(one => one.language.name === config.language)?.name
      if (name) {
        names.set(species, name)
        await $.fs.write(namesPath(home), JSON.stringify(Object.fromEntries(names)))
      } else {
        namesFailed.add(species)
      }
    } catch {
      namesFailed.add(species)
    }
  }
  return shownName(species)
}

const shownName = (species: number) => (names.get(species) ?? `No.${String(species).padStart(3, '0')}`).toUpperCase()

// 그리는 동안에는 네트워크를 기다리지 않는다. 모르는 이름은 받아 온 뒤 다시 그린다
const namesAsked = new Set<number>()

function drawnName($: EngineInterface, species: number): string {
  if (!names.has(species) && !namesAsked.has(species)) {
    namesAsked.add(species)
    void nameOf($, species).then(() => $.ui.invalidate('ui.render'))
  }
  return shownName(species)
}

// ---- 그리기

type View = { egg: SessionEgg; mon: Mon | null; scene: Scene | null; isWorking: boolean }
let view: View | null = null

// 장면 그림이 아직 움직이는지. 움직이는 동안은 일하지 않아도 칠한다
function isSceneMoving(shown: Scene | null, now: number): boolean {
  if (!shown) {
    return false
  }
  return now - shown.at < (shown.kind === 'hatch' ? HATCH_SHAKE_MS : EVOLVE_MS)
}

function artOf(shown: View, now: number): BandArt {
  const elapsed = shown.scene ? now - shown.scene.at : Infinity
  if (shown.scene?.kind === 'hatch' && elapsed < HATCH_SHAKE_MS) {
    return { kind: 'egg', key: shown.egg.key, stage: 'cracked', lean: leanOf(shown.egg.tally), isShaking: true }
  }
  if (shown.scene?.kind === 'evolve' && elapsed < EVOLVE_MS) {
    return { kind: 'evolve', before: spriteOf(shown.scene.from), after: spriteOf(shown.scene.species), elapsed }
  }
  if (shown.mon) {
    return { kind: 'mon', image: spriteOf(shown.mon.species), isHopping: shown.isWorking }
  }
  const stage = stageOf(shown.egg)
  return { kind: 'egg', key: shown.egg.key, stage: stage === 'hatched' ? 'cracked' : stage, lean: leanOf(shown.egg.tally), isShaking: shown.isWorking }
}

function startTicker($: EngineInterface) {
  denied = 0
  timer ??= $.clock.every(TICK_MS, () => void tick($))
}

function stopTicker() {
  timer?.cancel()
  timer = null
  frame = 0
}

async function tick($: EngineInterface) {
  if (!band || !view) {
    stopTicker()
    return
  }
  frame += 1
  const now = await $.clock.now()
  const isMoving = isSceneMoving(view.scene, now)
  // 장면이 끝나면 글을 바꾸고, 일도 안 하면 멈추게 다시 그린다
  if (wasMoving && !isMoving) {
    $.ui.invalidate('ui.render')
  }
  wasMoving = isMoving
  const got = await $.ui.blit({ requestId: band, key: 'egg', cells: base64Of(drawBand(artOf(view, now), frame)) })
  denied = got.deny === undefined ? 0 : denied + 1
  if (denied >= DENY_LIMIT) {
    stopTicker()
  }
}

// 그림 옆 세 줄. 이름과 레벨, 경험치 막대, 원작 같은 한 줄이다
function captionsOf($: EngineInterface, shown: View, now: number): [string, string, string] {
  const { mon: partner, scene: last } = shown
  if (!partner || (last?.kind === 'hatch' && now - last.at < HATCH_SHAKE_MS)) {
    const progress = Math.min(1, shown.egg.workMs / HATCH_MS)
    const note = last?.kind === 'hatch' ? 'Oh?' : eggNote(shown.egg)
    return ['EGG', xpBar(progress), note]
  }
  const name = drawnName($, partner.species)
  const level = levelOf(partner.xp)
  const title = `${name}${rarityOf(partner.species) ? ' ✧' : ''}  Lv${level}`
  const elapsed = last ? now - last.at : Infinity
  let note: string
  if (last?.kind === 'evolve' && elapsed < EVOLVE_MS + CAPTION_MS) {
    const from = drawnName($, last.from)
    note = evolvePhase(elapsed) === 'done' ? `Congratulations! Your ${from} evolved into ${name}!` : `What? ${from} is evolving!`
  } else if (last?.kind === 'hatch' && elapsed < CAPTION_MS) {
    note = `${name} hatched from the EGG!`
  } else {
    const next = evolveLevelOf(partner.species)
    note = next === null ? `${name} is fully evolved.` : next > level ? `Evolves at Lv${next}.` : 'It may evolve soon.'
  }
  return [title, xpBar(levelProgress(partner.xp)), note]
}

// ---- 명령

const HELP = [
  '/pokemon-egg       This session\'s egg or Pokémon: work time, EXP and what it leans toward',
  '/pokemon-egg box   Every Pokémon in your PC BOX, one line per species',
  '/pokemon-egg dex   Your POKéDEX: how many of the 151 you have seen',
  '/pokemon-egg help  This list',
  '',
  'An egg cracks after 20 minutes of work or when its MR opens, and hatches after 60 minutes or when the MR is merged.',
  'After that, every minute of work is 1 EXP and a merged MR is 60. Pokémon evolve at their levels from the games.',
  'What hatches leans toward the tools the session used most: shell, edit, read, test, web or agent.',
  'Set GITLAB_TOKEN (read_api) for GitLab MRs; GitHub PRs are read through the gh CLI.',
].join('\n')

async function statusText($: EngineInterface): Promise<string> {
  const mine = await read($, egg)
  if (!mine) {
    return 'No egg yet.'
  }
  const lean = leanOf(mine.tally)
  const leaning = lean ? `${lean} (${LEAN_TYPES[lean].join('/')})` : 'nothing yet'
  const mr = mine.mr ? `, MR !${mine.mr.iid} ${mine.mr.state}` : ''
  const partner = await read($, mon)
  if (!partner) {
    const minutes = Math.floor(mine.workMs / 60_000)
    return `EGG: ${stageOf(mine)}, worked ${minutes} of ${HATCH_MS / 60_000} minutes${mr}. Leaning toward ${leaning}.`
  }
  const next = evolveLevelOf(partner.species)
  const evolve = next === null ? 'fully evolved' : `evolves at Lv${next}`
  return `${await nameOf($, partner.species)} Lv${levelOf(partner.xp)}, ${Math.floor(partner.xp)} EXP, ${evolve}${mr}.`
}

async function boxText($: EngineInterface): Promise<string> {
  const groups = groupBox(await allMons($))
  if (groups.length === 0) {
    return 'Your PC BOX is empty.'
  }
  const lines = await Promise.all(
    groups.map(async group => {
      const count = group.count > 1 ? ` ×${group.count}` : ''
      return `No.${String(group.species).padStart(3, '0')} ${await nameOf($, group.species)}${count}  Lv${group.level}`
    }),
  )
  return [`PC BOX ${groups.reduce((sum, group) => sum + group.count, 0)}`, ...lines].join('\n')
}

async function dexText($: EngineInterface): Promise<string> {
  const legacy = ((await $.store.get('legacy:seen')) as number[] | undefined) ?? []
  const seen = seenOf(await allMons($), legacy)
  const listed = await Promise.all(seen.map(async no => `No.${String(no).padStart(3, '0')} ${await nameOf($, no)}`))
  return [`POKéDEX ${seen.length}/151`, ...listed].join('\n')
}

export const register: Register = (on, options) => {
  config.gitlabUrl = typeof options.gitlabUrl === 'string' ? options.gitlabUrl : ''
  // 모르는 값이면 영어로 둔다
  config.language = options.pokemonLanguage === 'ko' ? 'ko' : 'en'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pokemon-egg', description: 'Your Pokémon egg for this session. box and dex list what you have' })
    await migrateOnce($)
    await takeEgg($, await $.session.id())
    await noteStartBranch($)
    $.clock.every(FLUSH_MS, () => void flush($))
    $.clock.every(MR_CHECK_MS, () => void checkMrs($))
    void checkMrs($)
    return next(e)
  })

  // /clear 는 새 세션 id 로 이어지고 session.start 가 다시 오지 않는다. 같은 일을 잇는 것이라 알도 그대로 넘긴다
  // 세션 안에서 /resume 으로 다른 세션을 열면 그 세션의 알로 바꾼다
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') {
      clearedFrom = sessionId
    }
    await followSession($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    await followSession($)
    workingSince ??= await $.clock.now()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    // 서브에이전트의 턴이 끝나도 메인 세션은 아직 일하는 중이다
    if (e.agentId === undefined) {
      await flush($)
      workingSince = null
    }
    return done
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) {
      return ran
    }
    const lean = leanOfTool(e.tool, e as { command?: unknown })
    if (lean) {
      pendingTally = addTally(pendingTally, { [lean]: 1 } as Partial<Record<Lean, number>>)
    }
    // 서브에이전트가 손댄 곳은 세션이 주로 쓰는 worktree 로 치지 않는다
    if (WORK_TOOLS.has(e.tool) && !e.agentId) {
      await noteWorkPath($, e as { file_path?: unknown; notebook_path?: unknown; command?: unknown })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    await flush($)
    workingSince = null
    // /clear 는 다음 세션이 알을 이어 받는다
    if (e.reason === 'clear') {
      clearedFrom = sessionId
    } else {
      const now = await $.clock.now()
      await editOwnEgg($, saved => ({ ...saved, endedAt: now }))
    }
    return next(e)
  })

  on('command.run', { command: 'pokemon-egg' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '') {
      return { text: await statusText($) }
    }
    if (arg === 'box') {
      return { text: await boxText($) }
    }
    if (arg === 'dex') {
      return { text: await dexText($) }
    }
    if (['help', '--help', '-h'].includes(arg)) {
      return { text: HELP }
    }
    return { text: `Unknown argument "${arg}". See /pokemon-egg help.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const mine = await read($, egg)
    // Raster 는 터미널만 그리고 다른 곳에서는 빈 조각이 된다. 설문이 떠 있거나 그림이 들어갈 높이가 없으면 다른 플러그인의 band 만 둔다
    if (!mine || e.surface !== 'terminal' || e.props.hasSurvey || e.props.maxRows < EGG_LINES) {
      stopTicker()
      return below
    }
    const now = await $.clock.now()
    view = { egg: mine, mon: await read($, mon), scene: await read($, scene), isWorking: e.props.isWorking }
    band = e.requestId
    wasMoving = isSceneMoving(view.scene, now)
    if (view.isWorking || wasMoving) {
      startTicker($)
    } else {
      stopTicker()
    }
    const [title, bar, note] = captionsOf($, view, now)
    const { Box, Raster, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        <Box>
          <Raster key="egg" columns={EGG_COLUMNS} rows={EGG_LINES} cells={base64Of(drawBand(artOf(view, now), frame))} />
          <Box flexDirection="column" justifyContent="flex-end" marginLeft={1} flexShrink={1}>
            <Text bold>{title}</Text>
            <Text color="green">{bar}</Text>
            <Text dimColor wrap="truncate-end">
              {note}
            </Text>
          </Box>
        </Box>
      </Box>
    )
  })
}
