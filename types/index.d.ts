// 세션이 주로 쓴 도구. 알에서 나올 포켓몬의 타입이 이쪽으로 기운다
export type Lean = 'shell' | 'edit' | 'read' | 'test' | 'web' | 'agent'

export type Mr = { iid: number; state: 'opened' | 'merged' | 'closed'; url: string }

export type Tree = { path: string; head: string; branch: string | null; isMain: boolean }

// 세션 하나가 키우는 알. $.store 의 egg:<세션 id> 에 남아, 이어 연 세션도 같은 알을 받는다
// 세션이 닫힌 뒤에도 남아, 열린 다른 세션이 그 브랜치의 MR 이 머지됐는지 대신 본다
export type SessionEgg = {
  // 무늬, 금 모양, 나올 포켓몬을 정한다. 깨어나면 포켓몬의 key 가 된다
  key: string
  // 알을 받은 시각
  at: number
  // 세션이 일한 시간(ms). 이만큼 쌓이면 금이 가고 깨어난다
  workMs: number
  // 도구를 쓴 횟수
  tally: Partial<Record<Lean, number>>
  // 세션이 일하는 저장소 루트와 브랜치. Edit, Write, Bash 로 마지막에 손댄 worktree 를 따른다
  root: string | null
  branch: string | null
  mr: Mr | null
  // 이 알이 받은 MR 머지. MR 하나는 알 하나에만 보상을 준다
  merged: boolean
  // 깨어났으면 박스에 든 포켓몬의 key
  mon: string | null
  // 세션이 닫힌 시각. 열린 세션은 null
  endedAt: number | null
  // 이 세션이 마지막으로 저장한 시각. 닫혔다는 소식 없이 오래 멈춘 세션도 닫힌 것으로 본다
  savedAt: number
}

// 박스에 든 포켓몬. $.store 의 mon:<key> 에 하나씩 남는다
export type Mon = {
  key: string
  species: number
  // 경험치. 일한 1분이 1이다
  xp: number
  // 깨어난 시각
  at: number
  // 깨어날 때 기운 쪽. 이브이가 무엇으로 진화할지 정한다
  lean: Lean | null
  root: string | null
  branch: string | null
}

// 입력창 위에 보이는 장면. hatch 는 알이 깨어나는 장면, evolve 는 from 이 species 로 진화하는 장면이다
export type Scene = { kind: 'hatch' | 'evolve'; species: number; from: number; at: number }

declare module 'claude-code' {
  interface PluginState {
    'pokemon-egg': {
      egg: SessionEgg | null
      mon: Mon | null
      scene: Scene | null
    }
  }
}
