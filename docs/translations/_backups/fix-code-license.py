#!/usr/bin/env python3
"""translations 코드 라이선스 고지 교정.

근거: kubernetes/website 저장소에 LICENSE-CODE가 없음이 확인됐다.
루트 LICENSE(CC BY 4.0)가 저장소 콘텐츠 전부에 적용되므로,
"코드 예시는 Apache 2.0" 분기는 근거가 없다. 문장을 삭제한다.

containerd-runtime-v2는 대상이 아니다. 출처 저장소가 다르고
별도 판정이 필요하다(containerd/containerd의 LICENSE.docs 유무).

사용 (git bash / PowerShell / cmd 공통):
  python fix-code-license.py <대상디렉터리>          # 미리보기
  python fix-code-license.py <대상디렉터리> --apply   # 실제 수정

Windows에서 `python`이 없으면 `py -3`을 쓴다.
표준 라이브러리만 쓰므로 별도 설치가 필요 없다.
적용 후 `git diff`로 확인하고, 되돌리려면 `git checkout .`
"""
import re, sys, pathlib

EXCLUDE = {'containerd-runtime-v2'}

# (설명, 패턴, 치환) — 순서대로 시도하며 첫 일치만 적용한다
RULES = [
    (
        'A. 본문·코드 병기형',
        re.compile(
            r'(문서 본문은 \[CC BY 4\.0\]\([^)]+\))을, '
            r'코드·명령 예시는 \[Apache License 2\.0\]\([^)]+\)을 따른다\.'
        ),
        r'\1을 따른다.',
    ),
    (
        'B. 코드 샘플 단독 문장형',
        re.compile(
            r'\s*원문 코드 샘플은 원문 저장소 기준 '
            r'\[Apache License 2\.0\]\([^)]+\)이다\.'
        ),
        '',
    ),
    (
        'C. 링크 없는 서술형',
        re.compile(
            r'(문서 본문의 라이선스는 CC BY 4\.0\(\[[^\]]+\]\([^)]+\)\))이고, '
            r'원문에 수록된 [^.]*?의 라이선스는 Apache 2\.0이다\.'
        ),
        r'\1이다.',
    ),
]


def process(path: pathlib.Path):
    # newline='' : 원본 줄바꿈(LF/CRLF)을 그대로 읽고 그대로 쓴다.
    # Windows 텍스트 모드의 자동 변환을 막아 불필요한 전체 diff를 방지한다.
    with open(path, 'r', encoding='utf-8', newline='') as f:
        text = f.read()
    for name, pat, rep in RULES:
        new, n = pat.subn(rep, text, count=1)
        if n:
            return name, text, new
    return None, text, text


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    root = pathlib.Path(sys.argv[1])
    apply = '--apply' in sys.argv

    targets = sorted(p for p in root.rglob('*.md') if p.stem not in EXCLUDE)
    hit = miss = 0
    residual = []

    for p in targets:
        name, before, after = process(p)
        if not name:
            if 'Apache' in before:
                residual.append(p.stem)
            continue
        hit += 1
        bl = next(l for l in before.split('\n') if 'Apache' in l)
        al = next((l for l in after.split('\n') if l.startswith('> 이 문서는')), '')
        print(f'\n[{p.stem}]  규칙 {name}')
        print(f'  전: ...{bl[bl.find("CC BY")-12:][:190]}')
        print(f'  후: ...{al[al.find("CC BY")-12:][:190]}' if 'CC BY' in al else f'  후: {al[:190]}')
        if apply:
            with open(p, 'w', encoding='utf-8', newline='') as f:
                f.write(after)

    print(f'\n{"─"*60}')
    print(f'교정 대상 {hit}편 / 검사 {len(targets)}편'
          f'{"  [적용 완료]" if apply else "  [dry-run, 미적용]"}')
    if residual:
        print(f'!! 규칙 미적용인데 Apache 언급 잔존: {residual}')
    print(f'제외(별도 판정 필요): {sorted(EXCLUDE)}')


if __name__ == '__main__':
    main()
