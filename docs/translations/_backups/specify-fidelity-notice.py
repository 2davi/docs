#!/usr/bin/env python3
"""translations attribution 변경 문구를 문서별로 구체화.

근거: DOCS-CDR-0001 §2.3 "실제 변경의 종류는 문구 뒤에 이어 적어 구체화한다".

전제: restore-fidelity.py 를 먼저 돌려 공통 문구
     "원문을 학습 목적으로 재구성하고 역자 주(와 도해)를 더했다." 가
     이미 들어가 있어야 한다. 이 스크립트는 그 뒤에 변경 종류 한 문장을 잇는다.

문서별 구체화는 번역본 본문의 실제 추가 요소를 근거로 한다:
  - 집약 절(공통/상속 플래그, 페이즈 목록) 보유 → 재배치 명시
  - 다이어그램(_embeds/img SVG) 보유 → 도해 명시
  - 종합 결론 절 보유 → 두괄식 결론 명시

문구는 NOTICES 딕셔너리에 문서별로 확정돼 있다(간략 버전, 핵심 1~2개).

사용:
  python specify-fidelity-notice.py <대상디렉터리>          # 미리보기
  python specify-fidelity-notice.py <대상디렉터리> --apply
되돌리려면 git checkout .
"""
import sys, re, pathlib

# 공통 문구 두 종 (restore-fidelity가 넣은 것)
BASE_D = '원문을 학습 목적으로 재구성하고 역자 주와 다이어그램을 더했다.'
BASE_N = '원문을 학습 목적으로 재구성하고 역자 주를 더했다.'

# 문서별로 이어 붙일 구체화 문장 (앞 공백 포함, base 뒤에 append)
SUFFIX = {
    'authorization':          ' 두괄식 종합 결론을 선두에 두었다.',
    'containerd-runtime-v2':  ' 두괄식 종합 결론을 선두에 두고 대응 도형 없는 다이어그램을 실었다.',
    'encrypting-data-at-rest':' 두괄식 종합 결론을 선두에 두었다.',
    'k8s-node-allocatable':   ' 두괄식 종합 결론을 선두에 두었다.',
    'kubeadm-config':         ' 두괄식 종합 결론을 선두에 두고 대응 도형 없는 다이어그램을 실었다.',
    'kubeadm-init-phase':     ' 원문에 흩어진 플래그·페이즈 정보를 집약 절로 모으고 대응 도형 없는 다이어그램을 실었다.',
    'kubeadm-init':           ' 두괄식 종합 결론을 선두에 두고 대응 도형 없는 다이어그램을 실었다.',
    'kubeadm-join-phase':     ' 원문에 흩어진 플래그·페이즈 정보를 집약 절로 모으고 대응 도형 없는 다이어그램을 실었다.',
    'kubeadm-join':           ' 두괄식 종합 결론을 선두에 두고 대응 도형 없는 다이어그램을 실었다.',
    'kubeadm-reset-phase':    ' 두괄식 종합 결론을 선두에 두었다.',
    'kubeadm-reset':          ' 두괄식 종합 결론을 선두에 두고 대응 도형 없는 다이어그램을 실었다.',
    'kubeadm-token':          ' 두괄식 종합 결론을 선두에 두었다.',
    'kubeadm-upgrade-phase':  ' 원문에 흩어진 플래그·페이즈 정보를 집약 절로 모았다.',
    'kubeadm-upgrade':        ' 두괄식 종합 결론을 선두에 두고 대응 도형 없는 다이어그램을 실었다.',
    'static-pods':            ' 두괄식 종합 결론을 선두에 두고 대응 도형 없는 다이어그램을 실었다.',
}


def process(path):
    stem = path.stem
    if stem not in SUFFIX:
        return None, [], '\n'

    with open(path, 'r', encoding='utf-8', newline='') as f:
        raw = f.read()
    nl = '\r\n' if '\r\n' in raw else '\n'
    t = raw.replace('\r\n', '\n')

    suffix = SUFFIX[stem]
    report = []

    # 이미 구체화 문장이 붙어 있으면 건너뜀 (멱등)
    if suffix.strip() in t:
        return raw, [], nl

    # 공통 문구(BASE_D 또는 BASE_N) 뒤에 suffix 삽입.
    # attribution 문단2는 "> 이 문서는 <BASE> 문서 본문은 ..." 형태.
    # BASE 문장 바로 뒤(마침표 다음)에 suffix를 끼운다.
    for base in (BASE_D, BASE_N):
        marker = f'이 문서는 {base}'
        if marker in t:
            t = t.replace(marker, f'이 문서는 {base}{suffix}', 1)
            report.append(f'구체화 문장 추가')
            break
    else:
        report.append('⚠ 공통 문구 미발견(restore-fidelity 선행 필요)')
        return raw, report, nl

    return nl.join(t.split('\n')), report, nl


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    root = pathlib.Path(sys.argv[1])
    apply = '--apply' in sys.argv

    total = 0
    for p in sorted(root.rglob('*.md')):
        if p.name == 'index.md':
            continue
        new, report, nl = process(p)
        if not report:
            continue
        total += 1
        print(f'\n[{p.stem}]')
        for r in report:
            print(f'  · {r}')
        if apply and new is not None:
            with open(p, 'w', encoding='utf-8', newline='') as f:
                f.write(new)

    print(f'\n{"-"*60}')
    print(f'교정 {total}편{"  [적용 완료]" if apply else "  [미리보기, 미적용]"}')


if __name__ == '__main__':
    main()
