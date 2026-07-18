---
title: "kubeadm token (번역)"
original_title: "kubeadm token"
date: 2026-07-09
lastmod: 2026-07-09
original_published: 2024-08-17

author: "The Kubernetes Authors"
translator: "Davi"

original_url: "https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-token/"
original_lang: "en"
translation_lang: "ko"
translation_fidelity: "restructured"

license: "CC BY 4.0"
license_url: "https://creativecommons.org/licenses/by/4.0/"

description: "부트스트랩 토큰을 관리하는 kubeadm token 명령을 다룬다. create(생성)·delete(삭제)·generate(생성 후 출력)·list(나열) 하위 명령과 플래그를 한국어로 옮긴 레퍼런스 번역."
slug: "kubeadm-token"

section: "translations"
category: "translation"
tags: [kubernetes, kubeadm, token, translation]

status: "wip"
toc: true
comments: false
draft: true

ai_assistance:
  authorship: "ai-drafted"
  role: [translation, research]
  model: ["Claude Opus 4.8"]
  review: "reviewing"
---

# kubeadm token {#kubeadm-token}

> **원문:** [kubeadm token](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-token/) · The Kubernetes Authors · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
> 이 문서는 원문을 한국어로 옮기며 두괄식으로 재구성하고 역자 주를 더한 것이다. 문서 본문은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을, 코드·명령 예시는 [Apache License 2.0](https://github.com/kubernetes/website/blob/main/LICENSE)을 따른다. 변경 사항으로 결론 선행 재배치와 역자 주(검증·적용)가 추가되었으며, 하위 명령·플래그는 원문에서 누락 없이 옮겼다.
> 원문 시점 2024-08-17 · 번역 2026-07-09

## 결론 {#conclusion}

`kubeadm token`은 부트스트랩 토큰(bootstrap token)을 관리하는 명령이다. 부트스트랩 토큰은 클러스터에 합류하는 노드와 컨트롤 플레인 노드 사이의 양방향 신뢰를 확립하는 데 쓰인다. 네 하위 명령으로 나뉜다. `create`는 서버에 토큰을 생성하고, `delete`는 삭제하며, `generate`는 생성만 해 출력하고(서버에는 만들지 않음), `list`는 서버의 토큰을 나열한다.

토큰은 `[a-z0-9]{6}.[a-z0-9]{16}` 형식이다. 앞부분은 공개 토큰 ID, 뒷부분은 비밀로 다뤄야 하는 토큰 시크릿이다. 토큰은 `kube-system` 네임스페이스의 `bootstrap.kubernetes.io/token` 타입 Secret으로 저장된다. `kubeadm init`은 기본으로 TTL(time to live) 24시간짜리 초기 토큰을 만든다.

이 명령은 선택적이며 고급 사용에만 필요하다. 토큰은 서명(signing) 용도로 서버를 신뢰시키거나, 인증(authentication) 용도로 API 서버에 단기 인증하는 데 쓰인다(`system:bootstrappers` 그룹에 매핑).

---

`kubeadm init`은 TTL 24시간짜리 초기 토큰을 만든다. 아래 명령들로 그런 토큰을 관리하고, 새 토큰을 만들고 관리할 수 있다.

## kubeadm token (기본) {#cmd-base}

부트스트랩 토큰을 관리한다.

이 명령은 부트스트랩 토큰을 관리한다. 선택적이며 고급 사용 사례에만 필요하다. 요컨대 부트스트랩 토큰은 클라이언트와 서버 사이의 양방향 신뢰를 확립하는 데 쓰인다. 클라이언트(예: 클러스터에 막 합류하려는 노드)가 통신 상대 서버를 신뢰해야 할 때 "서명(signing)" 용도의 부트스트랩 토큰을 쓸 수 있다. 부트스트랩 토큰은 API 서버에 단기 인증을 허용하는 수단으로도 기능하는데(토큰은 `system:bootstrappers` 그룹에 매핑된다), 이때는 "인증(authentication)" 용도의 부트스트랩 토큰을 쓸 수 있다. 토큰은 ID/시크릿과 비슷한 형태다. 예: `abcdef.0123456789abcdef`. 첫 부분은 공개 부분이고, 둘째 부분은 "토큰 시크릿"으로 비밀로 다뤄야 한다.

**사용:** `kubeadm token [flags]`

**플래그:** `--dry-run`(드라이런 모드 활성화 여부) · `-h` · `--kubeconfig string`(기본 `/etc/kubernetes/admin.conf`, 클러스터 통신에 쓸 kubeconfig)

모든 하위 명령은 상위 명령에서 `--rootfs string`('실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot)을 상속한다. 이하에서는 반복하지 않는다.

## kubeadm token create {#cmd-create}

서버에 부트스트랩 토큰을 생성한다.

부트스트랩 토큰을 생성한다. 이 토큰의 용도, TTL, 선택적인 사람이 읽기 쉬운 설명을 지정할 수 있다. `[token]`은 기록할 실제 토큰으로, `[a-z0-9]{6}.[a-z0-9]{16}` 형식의 안전하게 생성된 무작위 토큰이어야 한다. `[token]`을 주지 않으면 kubeadm이 무작위 토큰을 대신 생성한다.

**사용:** `kubeadm token create [token] [flags]`

**플래그:**

- `--certificate-key string`: `--print-join-command`과 함께 쓰면, 클러스터에 컨트롤 플레인으로 합류하는 데 필요한 전체 `kubeadm join` 플래그를 출력한다. 새 인증서 키를 만들려면 `kubeadm init phase upload-certs --upload-certs`를 써야 한다.
- `--config string`: kubeadm 설정 파일 경로.
- `--description string`: 이 토큰이 어떻게 쓰이는지에 대한 사람이 읽기 쉬운 설명.
- `--groups strings` (기본 `[system:bootstrappers:kubeadm:default-node-token]`): 인증 용도로 쓰일 때 이 토큰이 인증받을 추가 그룹. `\Asystem:bootstrappers:[a-z0-9:-]{0,255}[a-z0-9]\z`와 일치해야 한다.
- `-h, --help`: create 도움말.
- `--print-join-command`: 토큰만 출력하는 대신, 이 토큰으로 클러스터에 합류하는 데 필요한 전체 `kubeadm join` 플래그를 출력한다.
- `--ttl duration` (기본 `24h0m0s`): 토큰이 자동 삭제되기까지의 기간(예: `1s`, `2m`, `3h`). `0`이면 만료되지 않는다.
- `--usages strings` (기본 `[signing,authentication]`): 이 토큰이 쓰일 수 있는 방식. 유효 옵션: `[signing, authentication]`.

## kubeadm token delete {#cmd-delete}

서버의 부트스트랩 토큰을 삭제한다.

부트스트랩 토큰 목록을 삭제한다. `[token-value]`는 삭제할 `[a-z0-9]{6}.[a-z0-9]{16}` 형식의 전체 토큰이거나, `[a-z0-9]{6}` 형식의 토큰 ID다.

**사용:** `kubeadm token delete [token-value] ... [flags]`

**플래그:** `-h` (상위 명령에서 `--dry-run`·`--kubeconfig`를 상속한다)

## kubeadm token generate {#cmd-generate}

부트스트랩 토큰을 생성해 출력하되, 서버에는 만들지 않는다.

`init`과 `join` 명령과 함께 쓸 수 있는 무작위 생성 부트스트랩 토큰을 출력한다. 토큰을 생성하기 위해 반드시 이 명령을 써야 하는 것은 아니다. `[a-z0-9]{6}.[a-z0-9]{16}` 형식이기만 하면 직접 만들어도 된다. 이 명령은 주어진 형식으로 토큰을 편리하게 생성하려고 제공된다. 토큰을 지정하지 않고 `kubeadm init`을 써도, kubeadm이 하나를 생성해 출력해준다.

**사용:** `kubeadm token generate [flags]`

**플래그:** `-h`

## kubeadm token list {#cmd-list}

서버의 부트스트랩 토큰을 나열한다.

모든 부트스트랩 토큰을 나열한다.

**사용:** `kubeadm token list [flags]`

**플래그:** `--allow-missing-template-keys`(기본 true; 템플릿에서 필드·맵 키가 없을 때 오류 무시, golang·jsonpath 출력에만 적용) · `-o, --output`(기본 `text`; 출력 형식 text|json|yaml|kyaml|go-template|go-template-file|template|templatefile|jsonpath|jsonpath-as-json|jsonpath-file 중 하나) · `--show-managed-fields`(true면 JSON·YAML 출력 시 managedFields 유지)

> **역자 주 · 검증**
> 원문 최종 수정은 2024-08-17(v1.31 반영)이지만, token 명령 구조(`create`·`delete`·`generate`·`list`)와 플래그 기본값은 번역 시점(2026-07-09)에도 유효하다. `--ttl` 기본 24시간(`0`이면 만료 없음), `--usages` 기본 `[signing, authentication]`, `--groups` 기본 `[system:bootstrappers:kubeadm:default-node-token]`이 현행 매뉴얼과 일치한다. `token list`의 구조화 출력은 `output.kubeadm.k8s.io/v1alpha1` API를 쓴다. 앞서 확인한 대로 현재 안정 버전은 v1.36이다. 출처: [kubeadm token 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-token/), [부트스트랩 토큰으로 인증](https://kubernetes.io/docs/reference/access-authn-authz/bootstrap-tokens/).

## 역자 주 · 적용 {#translator-notes-application}

원문 정보에서 도출되는, 일반 독자 누구에게나 성립하는 실습·활용 안내다.

- 토큰은 join 문서의 양방향 신뢰에서 '디스커버리'와 'TLS 부트스트랩' 양쪽을 떠받치는 자격 증명이다. 하나의 토큰이 서명(노드가 클러스터 정보를 신뢰)과 인증(노드가 API 서버에 단기 인증, `system:bootstrappers`에 매핑) 두 용도를 겸한다.
- init의 기본 토큰은 24시간 뒤 만료되므로, 나중에 노드를 추가할 때는 이미 만료됐을 가능성이 크다. 그때 `kubeadm token create --print-join-command`로 새 토큰과 완성된 `kubeadm join` 명령을 한 번에 얻는다. 실무에서 가장 자주 쓰는 형태다.
- 컨트롤 플레인을 추가로 합류시킬 때는 `--certificate-key`를 함께 줘 인증서 자동 복사를 포함한 join 명령까지 출력한다(인증서 키는 `kubeadm init phase upload-certs --upload-certs`로 생성).
- 보안상 토큰 시크릿(뒷부분 16자)은 비밀이다. `kubeadm token list`로 노출된 토큰과 TTL을 점검하고, 불필요한 토큰은 `kubeadm token delete`로 지운다.
- 시리즈 연결: `kubeadm init phase bootstrap-token`이 초기 토큰을 만들고, `kubeadm join`의 `--token`·`--discovery-token`이 이 토큰을 소비한다. join 문서의 양방향 신뢰 다이어그램이 그 흐름 전체다.

<!-- REVIEW-REQUIRED: 아래 경험 슬롯을 실제 실습 결과로 채우거나 블록째 삭제할 것.
     채우지 않은 채 draft를 해제하지 않는다. -->
> **역자 주 · 적용(경험)**
> (직접 실습·검증한 결과가 있을 때만 1인칭으로 기록)

## 참고 출처 {#references}

역자 검증 출처(번역 시점 사실 확인에 사용):

- [kubeadm token 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-token/)
- [부트스트랩 토큰으로 인증(Authenticating with Bootstrap Tokens)](https://kubernetes.io/docs/reference/access-authn-authz/bootstrap-tokens/)

## 다음 단계 {#whats-next}

- [kubeadm join](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/): 이 토큰으로 노드를 클러스터에 합류
- [kubeadm init](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/): 초기 토큰을 만드는 컨트롤 플레인 부트스트랩
