# claude-pokemon-egg

[English](README.md) | 한국어

Claude Code 세션을 열 때마다 입력창 위에 그 세션만의 포켓몬 알이 하나 생깁니다.
Claude 가 일하는 동안 알이 흔들리고, 시간이 지나거나 세션의 MR 이 열리면 금이 가고, 한 시간을 일하거나 MR 이 머지되는 순간 깨어납니다.
깨어난 뒤에도 경험치가 쌓여 원작의 레벨에 진화합니다.

무엇이 나올지는 세션이 한 일을 따라 기웁니다. 가장 많이 쓴 도구의 색으로 알의 반점이 물들고, 그쪽 속성의 포켓몬이 잘 나옵니다.

| 주로 한 일 | 반점 | 잘 나오는 속성 |
|---|---|---|
| 셸 명령 | 빨강 | 불꽃, 격투, 바위, 땅 |
| 파일 편집 | 초록 | 풀, 벌레 |
| 읽기와 검색 | 보라 | 에스퍼, 고스트, 독 |
| 테스트 실행 | 노랑 | 전기, 강철 |
| 웹과 MCP 도구 | 파랑 | 물, 비행, 얼음 |
| 서브에이전트 | 갈색 | 노말, 드래곤 |

## 자라는 방식

- **알.** 20분 일하거나 브랜치의 MR 이 열리면 금이 갑니다. 60분 일하거나 MR 이 머지되면 깨어납니다. 여러 세션이 같은 MR 을 작업했어도 MR 하나에는 알 하나만 깨어납니다.
- **경험치.** 깨어난 포켓몬은 Lv5 입니다. 일한 1분이 경험치 1, MR 머지가 60 이고, 15마다 레벨이 오릅니다. Claude 가 실제로 일한 시간만 셉니다.
- **진화.** 포켓몬 레드, 블루의 진화 레벨을 따릅니다. 돌 진화는 Lv30, 통신 교환 진화는 Lv36 에 합니다. 이브이는 세션이 기운 쪽을 따라 샤미드, 쥬피썬더, 부스터가 됩니다.
- **세션이 닫힌 뒤.** 포켓몬은 PC BOX 에 남습니다. 열린 MR 을 기다리던 알은 다른 세션들이 14일 동안 대신 지켜보다가 MR 이 머지되면 깨웁니다.
- **브랜치.** 세션의 브랜치는 Claude 를 켠 폴더가 아니라 Edit, Write, Bash 로 마지막에 손댄 worktree 의 브랜치입니다.

## 설치

```bash
claude plugin marketplace add reeny404/claude-pokemon-egg
claude plugin install pokemon-egg@claude-pokemon-egg
```

새 세션을 열거나 `/reload-plugins` 를 실행하면 터미널의 입력창 위에 알이 보입니다.

GitHub PR 은 `gh` CLI 로 읽습니다. GitLab MR 은 `read_api` 권한의 토큰을 넣어 주세요.

```json
// ~/.claude/settings.json
{ "env": { "GITLAB_TOKEN": "<token>" } }
```

mod-hud 를 쓰던 분은 pokemon-egg 를 처음 켤 때 PC BOX 와 POKéDEX 가 한 번 옮겨집니다. mod-hud 의 파일은 읽기만 하고 바꾸지 않습니다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `/pokemon-egg` | 이 세션의 알이나 포켓몬: 일한 시간, 경험치, 기운 쪽 |
| `/pokemon-egg box` | PC BOX 의 모든 포켓몬, 종마다 한 줄 |
| `/pokemon-egg dex` | POKéDEX: 151종 중 몇 종을 만났는지 |
| `/pokemon-egg help` | 모든 옵션 |

## 개발

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## 라이선스

MIT. 포켓몬과 포켓몬 이름은 Nintendo, Creatures Inc., GAME FREAK inc. 의 상표입니다. 스프라이트와 이름은 실행 중에 [PokeAPI](https://pokeapi.co) 에서 받아 오며 이 저장소에 들어 있지 않습니다.
