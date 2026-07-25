#!/usr/bin/env python3
"""translations attribution 블록 마크업 정규화.

문제:
  형태 1 (중첩형) — 첫 줄과 끝 줄이 `>>`라 인용 안의 인용으로 렌더된다.
    >> **원문:** ...
    >
    > 이 문서는 ...
    >
    >> 원문 시점 ...

  형태 2 (평문형) — 구분선이 없어 세 부분이 한 문단으로 합쳐진다.
    > **원문:** ...
    > 이 문서는 ...
    > 원문 시점 ...

  markdown-it 기본 설정에서 `breaks`는 꺼져 있다. 인용 블록 안에서 줄바꿈만으로는
  문단이 갈리지 않고 공백으로 이어 붙는다. 문단을 나누려면 `>`만 있는 빈 인용 줄이
  필요하다.

정규화 결과:
    > **원문:** ...
    >
    > 이 문서는 ...
    >
    > 원문 시점 ...

  인용 블록 하나 안의 세 문단이 되어 들여쓰기가 균일하고 줄바꿈이 보장된다.

사용 (git bash / PowerShell / cmd 공통):
  python normalize-attribution.py <대상디렉터리>          # 미리보기
  python normalize-attribution.py <대상디렉터리> --apply   # 실제 수정

Windows에서 `python`이 없으면 `py -3`을 쓴다.
표준 라이브러리만 쓰므로 별도 설치가 필요 없다.
적용 후 `git diff`로 확인하고, 되돌리려면 `git checkout .`
"""
import sys, pathlib


def find_block(lines):
    """frontmatter 종료 이후 첫 인용 블록의 [시작, 끝) 인덱스."""
    fences = [i for i, l in enumerate(lines) if l.strip() == '---']
    start_search = fences[1] + 1 if len(fences) >= 2 else 0
    begin = None
    for i in range(start_search, len(lines)):
        if lines[i].startswith('>'):
            begin = i
            break
        # 인용 블록 전에 본문 헤딩이 두 번 나오면 attribution이 없는 문서다
        if lines[i].startswith('## '):
            return None, None
    if begin is None:
        return None, None
    end = begin
    while end < len(lines) and lines[end].startswith('>'):
        end += 1
    return begin, end


def normalize(block):
    """인용 블록을 논리 문단으로 쪼갠 뒤 표준 형태로 재조립한다.

    문단 경계는 빈 인용 줄이 아니라 **의미 표지**로 판정한다.
    평문형 원본에는 빈 인용 줄이 없어서, 빈 줄만 경계로 삼으면
    세 부분이 한 문단으로 합쳐진다.

      1문단: `**원문:**`으로 시작
      2문단: 그 사이 전부 (여러 물리 줄이면 이어 붙인다)
      3문단: `원문 시점`으로 시작
    """
    texts = []
    for raw in block:
        text = raw
        while text.startswith('>'):
            text = text[1:]
        text = text.strip()
        if text:
            texts.append(text)

    head, body, tail = [], [], []
    bucket = None
    for t in texts:
        if t.startswith('**원문:**'):
            bucket = head
        elif t.startswith('원문 시점'):
            bucket = tail
        elif bucket is None:
            bucket = body
        elif bucket is head:
            bucket = body
        bucket.append(t)

    paragraphs = [' '.join(g) for g in (head, body, tail) if g]

    out = []
    for i, para in enumerate(paragraphs):
        if i:
            out.append('>')
        out.append(f'> {para}')
    return out, len(paragraphs)


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    root = pathlib.Path(sys.argv[1])
    apply = '--apply' in sys.argv

    changed = skipped = 0
    warnings = []

    for p in sorted(root.rglob('*.md')):
        if p.name == 'index.md':
            continue
        with open(p, 'r', encoding='utf-8', newline='') as f:
            raw = f.read()
        nl = '\r\n' if '\r\n' in raw else '\n'
        lines = raw.replace('\r\n', '\n').split('\n')

        begin, end = find_block(lines)
        if begin is None:
            warnings.append((p.stem, 'attribution 블록 없음'))
            continue

        before = lines[begin:end]
        after, npara = normalize(before)

        if npara != 3:
            warnings.append((p.stem, f'문단 {npara}개 (표준은 3개)'))

        if before == after:
            skipped += 1
            continue

        changed += 1
        form = '중첩형' if any(l.startswith('>>') for l in before) else '평문형'
        print(f'\n[{p.stem}]  {form} → 표준형  (문단 {npara}개)')
        print(f'  전: {len(before)}줄  {" / ".join(l[:26] for l in before[:3])}')
        print(f'  후: {len(after)}줄')

        if apply:
            lines[begin:end] = after
            with open(p, 'w', encoding='utf-8', newline='') as f:
                f.write(nl.join(lines))

    print(f'\n{"-"*60}')
    print(f'변경 {changed}편 / 이미 표준형 {skipped}편'
          f'{"  [적용 완료]" if apply else "  [미리보기, 미적용]"}')
    for stem, msg in warnings:
        print(f'  ! {stem}: {msg}')


if __name__ == '__main__':
    main()
