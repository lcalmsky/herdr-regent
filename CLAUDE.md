# herdr-regent 작업 규칙

## 배포는 main 에 push 하는 것으로 끝난다

- 공개 GitHub 저장소에 `herdr-layout` 토픽이 붙어 있으면 herdr.dev 갤러리에 한 시간 안에 반영된다 (`~/.config/herdr-app/AGENTS.md` 의 "To share one" 절). 별도 release 절차는 없고 `main` 에 push 하면 배포가 끝난다.
- 갤러리가 읽는 파일은 `RECIPE.md` 와 `preview.png`, 그리고 `layouts/`·`mods/` 의 실파일이다. 이 셋이 서로 어긋나지 않게 한 커밋에서 같이 고친다.
- 저장소 토픽(`herdr`, `herdr-layout`)과 공개 설정은 건드리지 않는다.
- 공개 이력은 `main` 커밋뿐이다. 이력을 다시 쓰지 않고 강제 push 하지 않는다. `archive/pre-public`(비공개 전체 이력)은 push 하지 않는다 (`.git/hooks/pre-push` 가 `refs/heads/main` 외의 push 와 비공개 이력이 섞인 push 를 막는다).
- 커밋 작성자는 저장소 로컬 설정(`lcalmsky` noreply 주소)이다. 커밋 전에 `git config user.email` 이 noreply 주소인지 본다.
- `design/`, `ui-assets/`, `.claude/` 는 `.git/info/exclude` 로 숨겨져 있다. 공개 트리에 넣지 않고 `git add -A` 대신 파일을 지정한다.

## mod·레이아웃을 고칠 때마다 같이 할 일

1. **`RECIPE.md` 갱신.** 크기·색·배치·동작이 바뀌었으면 실파일 기준으로 해당 줄을 고친다. 다른 에이전트가 이 문서만 보고 같은 것을 다시 만들 수 있어야 한다. 창 키 동작(Esc, ↵)을 바꾸면 README 의 Keys 문단과 RECIPE 의 Dialogs 설명을 같이 고친다.
2. **`preview.png`·`layouts/regent.png` 재생성.** 아래 명령으로 만든다. 맥 화면이 잠겨 있으면 거부한다. 렌더한 PNG 를 열어 바뀐 부분을 눈으로 확인한다.
   ```sh
   ./tools/preview/render.sh
   ```
3. **설치본 동기화.** `~/.config/herdr-app/mods/regent` 는 이 저장소의 `mods/regent` 를 가리키는 심볼릭 링크라 mod 복사는 필요 없다. `layouts/regent.json`·`layouts/regent.png` 는 `./tools/install.sh` 가 복사한다. 링크는 `ls -l ~/.config/herdr-app/mods/regent` 로 확인한다.
4. **테스트.** 아래 둘을 돌린다.
   ```sh
   cd mods/regent && node --test tests/
   herdr-app check ~/.config/herdr-app/mods/regent
   ```
5. **README 의 권한 고지 확인.** mod 가 새로 `exec`·`hc`·네트워크·폴더 밖 파일 읽기를 하게 됐으면 README 의 "Before adding it" 목록에 적는다.

## 라이선스

저장소는 MIT 다(`LICENSE`). 번들 글꼴(Gowun Batang, Pretendard)은 OFL 1.1 이라 `mods/regent/fonts/` 의 OFL 파일을 지우지 않는다.

## 미리보기 규칙 (herdr-* 저장소 공통)

이 절은 `~/git-repo/herdr-*` 저장소가 똑같이 싣는다. 한 곳에서 고치면 나머지 저장소의 같은 절도 같이 고친다.

- **레이아웃 선택 화면 그림.** 레이아웃이 있는 저장소는 `layouts/<name>.json` 루트에 `"preview": "layouts/<name>.png"` 를 두고 `layouts/<name>.png`(640×400)를 저장소에 싣는다. 필드나 그림 중 하나라도 없으면 Herdr 설정 화면에 빈 틀이 나온다 (`~/.config/herdr-app/AGENTS.md` 의 `preview` 항목).
- **설치는 JSON 과 PNG 를 같이 옮긴다.** 설치 스크립트와 README 의 복사 명령이 둘 다 옮기는지 확인한다. 설치본(`~/.config/herdr-app/layouts/`)에만 필드나 그림을 넣지 않는다. 다음 설치가 JSON 을 통째로 덮어써서 필드가 사라진다.
- **갤러리 그림.** herdr.dev 갤러리는 저장소 루트의 `preview.png` 를 보여 준다. 16:10(예: 2560×1600)으로 만들고, 선택 화면 그림은 같은 화면을 640×400 으로 줄여 쓴다.
- **공개되는 그림에는 지어낸 데모 데이터만 쓴다.** `preview.png`, `layouts/*.png`, README·docs 의 스크린샷과 GIF 가 대상이다. 화면 속 글은 전부 영어로 하고, 회사 업무가 드러나는 것이 보이지 않아야 한다: 티켓 키, 사내 저장소·서비스·채널 이름, 고객과 동료 이름, 실제 터미널 내용, 홈 경로의 계정 이름. 실제로 쓰는 창을 그대로 찍은 그림은 싣지 않는다.
- **모양을 바꾸면 같은 커밋에서 두 그림을 다시 만든다.** 커밋하기 전에 그림을 열어 위 항목을 눈으로 확인한다.

## 이 저장소에서 그림을 다시 만드는 방법

- `./tools/preview/render.sh` 한 번으로 `preview.png`(2560×1600)와 `layouts/regent.png`(640×400)가 같이 나온다. 지어낸 데이터는 `tools/preview/source.demo.js`, 터미널 자리의 가짜 화면은 `tools/preview/mods/regent-demo-term/` 에 있다.
- 숨김 인스턴스로 찍으므로 맥 화면이 잠겨 있으면 그림 에셋이 빠진 채로 찍힌다. 스크립트가 잠금을 확인하고 거부한다. 초상·틀·지도가 빠진 그림이 나오면 잠금부터 확인한다.
- mod 가 읽는 실제 데이터는 `mods/regent/source.js` 한 곳으로만 들어온다. 새 데이터 읽기를 추가할 때 이 파일을 거치게 해야 데모 그림에 실제 세션이 섞이지 않는다.
