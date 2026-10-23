import { expect, test } from 'claude-code/testing'

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

const PORCELAIN = `worktree /r/my-app
HEAD aaa
branch refs/heads/feat/#ABC-532-feedback-batch

worktree /r/my-app/.claude/worktrees/wind
HEAD bbb
branch refs/heads/feat/#ABC-611-wind

worktree /r/my-app/.claude/worktrees/tmp
HEAD ccc
detached
`

test('worktree 목록을 읽는다', () => {
  const trees = parseWorktrees(PORCELAIN)
  expect(trees.map(t => [t.path, t.branch, t.isMain])).toEqual([
    ['/r/my-app', 'feat/#ABC-532-feedback-batch', true],
    ['/r/my-app/.claude/worktrees/wind', 'feat/#ABC-611-wind', false],
    ['/r/my-app/.claude/worktrees/tmp', null, false],
  ])
})


test('origin remote 로 GitLab 프로젝트 API 주소를 만든다', () => {
  const ui = 'https://gitlab.example.com:8443/api/v4/projects/acme%2Fdev%2Fteam%2Fapp'
  expect(gitlabProjectApi('https://gitlab.example.com:8443/acme/dev/team/app')).toBe(ui)
  expect(gitlabProjectApi('https://user:tok@gitlab.example.com:8443/acme/dev/team/app.git')).toBe(ui)
  expect(gitlabProjectApi('git@gitlab.example.com:team/api.git')).toBe(
    'https://gitlab.example.com/api/v4/projects/team%2Fapi',
  )
  expect(gitlabProjectApi('ssh://git@gitlab.example.com:2222/team/api.git', 'https://gitlab.example.com:8443/')).toBe(
    'https://gitlab.example.com:8443/api/v4/projects/team%2Fapi',
  )
  expect(gitlabProjectApi('git@github.com:me/repo.git')).toBeNull()
  expect(gitlabProjectApi('https://github.com/me/repo')).toBeNull()
})


test('기본 브랜치와 배포 브랜치는 MR 을 찾지 않는다', () => {
  expect(isLongLivedBranch('main')).toBe(true)
  expect(isLongLivedBranch('release/1.1')).toBe(true)
  expect(isLongLivedBranch('feat/x')).toBe(false)
})

test('GitHub remote 를 알아보고 gh 의 PR 과 GitLab 의 MR 을 같은 모양으로 바꾼다', () => {
  expect(isGithubRemote('https://github.com/me/repo.git')).toBe(true)
  expect(isGithubRemote('git@github.com:me/repo.git')).toBe(true)
  expect(isGithubRemote('https://notgithub.com/me/repo')).toBe(false)
  const pr = (state: string) => JSON.stringify([{ number: 8, state, url: 'https://github.com/me/repo/pull/8' }])
  expect(parseGithubPr(pr('MERGED'))).toEqual({ iid: 8, state: 'merged', url: 'https://github.com/me/repo/pull/8' })
  expect(parseGithubPr(pr('OPEN'))?.state).toBe('opened')
  expect(parseGithubPr(pr('CLOSED'))?.state).toBe('closed')
  expect(parseGithubPr('[]')).toBeNull()
  expect(parseGithubPr('not json')).toBeNull()
  const mr = (state: string) => JSON.stringify([{ iid: 3, state, web_url: 'https://gl/x/-/merge_requests/3' }])
  expect(parseGitlabMr(mr('merged'))).toEqual({ iid: 3, state: 'merged', url: 'https://gl/x/-/merge_requests/3' })
  expect(parseGitlabMr(mr('locked'))?.state).toBe('opened')
  expect(parseGitlabMr('[]')).toBeNull()
})

test('env 파일에서 값을 읽는다', () => {
  expect(readEnvValue('A=1\nGITLAB_TOKEN="tok"\n', 'GITLAB_TOKEN')).toBe('tok')
  expect(readEnvValue('A=1', 'GITLAB_TOKEN')).toBeNull()
})

test('도구가 손댄 경로를 뽑는다. Edit 와 Write 는 파일 경로, Bash 는 앞의 cd 나 git -C 경로다', () => {
  expect(touchedPath({ file_path: '/p/ui-a/src/x.ts' }, '/p/ui')).toBe('/p/ui-a/src/x.ts')
  expect(touchedPath({ notebook_path: '/p/ui-a/n.ipynb' }, '/p/ui')).toBe('/p/ui-a/n.ipynb')
  expect(touchedPath({ command: 'cd /p/ui-a && pnpm test' }, '/p/ui')).toBe('/p/ui-a')
  expect(touchedPath({ command: 'cd "../ui-b" && git status' }, '/p/ui')).toBe('/p/ui-b')
  expect(touchedPath({ command: 'git -C /p/ui-a log -1' }, '/p/ui')).toBe('/p/ui-a')
  expect(touchedPath({ command: 'pnpm test' }, '/p/ui')).toBeNull()
  expect(touchedPath({}, '/p/ui')).toBeNull()
})

test('경로가 든 worktree 를 찾는다. 겹치면 가장 깊은 worktree 다', () => {
  const trees = [
    { path: '/p/ui', head: 'a', branch: 'develop', isMain: true },
    { path: '/p/ui-a', head: 'b', branch: 'feat/a', isMain: false },
    { path: '/p/ui/.claude/worktrees/c', head: 'c', branch: 'feat/c', isMain: false },
  ]
  expect(treeOfPath(trees, '/p/ui-a/src/x.ts')?.branch).toBe('feat/a')
  expect(treeOfPath(trees, '/p/ui/src/x.ts')?.branch).toBe('develop')
  expect(treeOfPath(trees, '/p/ui/.claude/worktrees/c/x.ts')?.branch).toBe('feat/c')
  expect(treeOfPath(trees, '/p/other/x.ts')).toBeNull()
})
