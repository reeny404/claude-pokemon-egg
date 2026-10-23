// 세션이 일하는 브랜치와 그 브랜치의 MR 을 찾는 데 쓰는 함수. mod-hud 에서 옮겨 왔다

import type { Mr, Tree } from '../types'

// origin remote 주소로 GitLab API 의 프로젝트 주소를 만든다. override 는 API 호스트가 remote 와 다를 때(ssh remote 등) 쓴다
// GitHub 은 MR 이 없으므로 null
export const gitlabProjectApi = (remote: string, override = ''): string | null => {
  const url = remote.trim()
  const parsed =
    url.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/) ??
    url.match(/^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/) ??
    url.match(/^(?:[^@/]+@)?([^/:]+):(.+?)(?:\.git)?\/?$/)
  if (!parsed) {
    return null
  }
  const [, host = '', path = ''] = parsed
  if (/(^|\.)github\.com(:\d+)?$/.test(host)) {
    return null
  }
  const isHttp = /^https?:/.test(url)
  const base = override.trim().replace(/\/+$/, '') || `${isHttp ? url.slice(0, url.indexOf(':')) : 'https'}://${host}`
  return `${base}/api/v4/projects/${encodeURIComponent(path)}`
}

// remote 가 GitHub 저장소인지. GitHub 는 API 대신 gh CLI 로 PR 을 찾는다
export const isGithubRemote = (remote: string): boolean =>
  /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|(?:[^@/]+@)?)github\.com[:/]/.test(remote.trim())


// `gh pr list --json number,state,url` 출력의 첫 PR 을 GitLab MR 과 같은 모양으로 바꾼다
export const parseGithubPr = (stdout: string): Mr | null => {
  try {
    const [pr] = JSON.parse(stdout) as Array<{ number: number; state: string; url: string }>
    if (!pr) {
      return null
    }
    return { iid: pr.number, state: pr.state === 'OPEN' ? 'opened' : pr.state === 'MERGED' ? 'merged' : 'closed', url: pr.url }
  } catch {
    return null
  }
}

// GitLab API 의 MR 목록 응답에서 첫 MR. state 는 opened, merged, closed, locked 이다
export const parseGitlabMr = (text: string): Mr | null => {
  try {
    const [mr] = JSON.parse(text) as Array<{ iid: number; state: string; web_url: string }>
    if (!mr) {
      return null
    }
    return { iid: mr.iid, state: mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : 'opened', url: mr.web_url }
  } catch {
    return null
  }
}

// 기본 브랜치와 배포 브랜치는 MR 의 소스가 아니라 MR 을 찾지 않는다
export const isLongLivedBranch = (branch: string): boolean =>
  ['main', 'master', 'develop', 'HEAD'].includes(branch) || branch.startsWith('release/')

// 경로의 . 과 .. 를 풀어 절대 경로로 만든다. 상대 경로는 base 에서 시작한다
const resolvePath = (base: string, path: string): string => {
  const parts: string[] = []
  for (const part of (path.startsWith('/') ? path : `${base}/${path}`).split('/')) {
    if (part === '..') {
      parts.pop()
    } else if (part && part !== '.') {
      parts.push(part)
    }
  }
  return `/${parts.join('/')}`
}

// 도구가 손댄 경로. Edit 와 Write 는 파일 경로, Bash 는 맨 앞의 cd 나 git -C 경로다. 세션의 브랜치를 주로 쓰는 worktree 에서 읽는 데 쓴다
export const touchedPath = (input: { file_path?: unknown; notebook_path?: unknown; command?: unknown }, cwd: string): string | null => {
  const file = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null
  if (file) {
    return resolvePath(cwd, file)
  }
  if (typeof input.command !== 'string') {
    return null
  }
  const dir = input.command.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/) ?? input.command.match(/\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/)
  const path = dir ? (dir[1] ?? dir[2] ?? dir[3] ?? null) : null
  return path ? resolvePath(cwd, path) : null
}

// 경로가 든 worktree. 다른 worktree 안에 만든 worktree 도 있어 가장 깊은 것을 고른다
export const treeOfPath = (trees: readonly Tree[], path: string): Tree | null =>
  trees
    .filter(tree => path === tree.path || path.startsWith(`${tree.path}/`))
    .reduce<Tree | null>((best, tree) => (best && best.path.length >= tree.path.length ? best : tree), null)

// `git worktree list --porcelain` 출력을 worktree 목록으로 바꾼다. 첫 블록이 메인 worktree 다
export const parseWorktrees = (porcelain: string): Tree[] =>
  porcelain
    .split('\n\n')
    .map(block => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const lines = block.split('\n')
      const field = (name: string) =>
        lines.find(line => line.startsWith(`${name} `))?.slice(name.length + 1) ?? null

      return {
        path: field('worktree') ?? '',
        head: field('HEAD') ?? '',
        branch: field('branch')?.replace(/^refs\/heads\//, '') ?? null,
        isMain: index === 0,
      }
    })
    .filter(tree => tree.path !== '')

// .env.local 같은 파일에서 NAME=value 한 줄의 값을 읽는다
export const readEnvValue = (text: string, name: string): string | null => {
  const line = text.split('\n').find(one => one.trim().startsWith(`${name}=`))
  const value = line?.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')
  return value ? value : null
}

