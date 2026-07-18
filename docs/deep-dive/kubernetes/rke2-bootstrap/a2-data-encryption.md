---
title: "[A2] 저장 데이터 암호화 설정"
date: 2026-07-11
lastmod: 2026-07-13
author: "Davi"
description: ""
section: "deep-dive"
category: "deep-dive/kubernetes/rke2-bootstrap"
tags: [kubernetes, kubernetes-the-hard-way, encryption-at-rest, etcd, secrets, aescbc]
doc_type: "learning-guide"
series: "rke2-bootstrap"
series_order: 2
order: 2
status: active
draft: false
search: true
toc: true
difficulty: "advanced"

ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-opus-4.8"]
  review: "verified"
---

# 저장 데이터 암호화 설정 {#data-encryption-config}

## 개요 {#overview}

이 문서는 Kubernetes The Hard Way 트랙 A의 [리포 06](https://github.com/kelseyhightower/kubernetes-the-hard-way/blob/master/docs/06-data-encryption-keys.md)을 다룬다. 페이즈 1(기반과 신뢰)의 마지막 산출물이자 가장 짧은 구간이다. [인증서 신뢰 계층과 kubeconfig](./a1-pki-and-trust)까지 신원 계층이 섰으니, 여기서는 그 위에 저장 데이터 보호를 얹는다. 대칭 암호화 키를 하나 만들고, 그 키를 담은 암호화 설정 파일(`encryption-config.yaml`)을 만들어 server로 보낸다.

이 설정 파일은 지금 만들어 두기만 하고, 실제로는 페이즈 2에서 apiserver가 `--encryption-provider-config` 플래그로 소비한다(리포 08). 즉 이 구간은 apiserver가 etcd에 Secret을 쓸 때 암호화하도록 미리 키와 설정을 준비하는 일이다.

환경과 실행 위치는 [a1](./a1-pki-and-trust)과 같다. 점프박스(jumpbox)의 리포 디렉터리에서 실행하고, 배포 대상 컨트롤 플레인은 server(`10.240.0.10`) 하나다.

---

## 01. 왜 저장 데이터 암호화인가 {#why-encryption-at-rest}

쿠버네티스 Secret은 etcd에 저장되는데, 기본은 암호화가 아니라 base64 인코딩일 뿐이다. base64는 암호가 아니라 단순 표현 방식이라 누구나 되돌린다. 그래서 etcd 데이터에 닿을 수 있는 사람은 Secret을 사실상 평문으로 본다. etcd 디스크, 백업 스냅샷, 또는 etcd에 대한 직접 접근이 그 경로다.

저장 데이터 암호화(encryption at rest)는 이 노출을 막는다. apiserver가 Secret을 etcd에 **쓰기 전에** 암호화하고, 읽을 때 복호화한다. etcd에는 암호문만 남으므로, 디스크나 백업이 탈취돼도 Secret 평문이 새지 않는다. ([Encrypting Confidential Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/))

한계도 분명하다. 암호화 키는 컨트롤 플레인 호스트의 설정 파일에 평문으로 있다. 그래서 이 방식은 **etcd 유출은 막아도 호스트 자체가 뚫리면 키까지 함께 노출된다**. 호스트 침해까지 막으려면 외부 키 관리 서비스(KMS provider)로 키를 호스트 밖에 두는 별도 설계가 필요하다. Hard Way는 그 앞 단계인 로컬 키 방식을 다룬다.

## 02. 대칭 키 생성 {#symmetric-key}

암호화에 쓸 대칭 키(symmetric key)를 만든다. 대칭 키는 암호화와 복호화에 같은 키를 쓰는 방식이며, 인증서의 비대칭 키(공개키·개인키 쌍)와는 다른 종류다.

```bash
export ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64)
```

각 부분의 뜻은 이렇다. `/dev/urandom`은 커널의 암호학적 난수원(CSPRNG, Cryptographically Secure Pseudo-Random Number Generator)이고, `head -c 32`가 거기서 32바이트(256비트)를 뽑는다. 32바이트인 이유는 뒤에 쓸 AES-256이 256비트 키를 요구하기 때문이다. `base64`가 그 32바이트 이진 데이터를 설정 파일에 넣을 수 있는 텍스트로 바꾼다.

`export`가 중요하다. 다음 절의 `envsubst`가 값을 환경(environment)에서 읽으므로, `export` 없이 그냥 대입하면 치환이 빈 값으로 나간다.

## 03. EncryptionConfig 구조 {#encryption-config-structure}

리포는 키를 채워 넣을 자리를 비워둔 템플릿 `configs/encryption-config.yaml`을 제공한다. 구조는 이렇다.

```yaml
kind: EncryptionConfig
apiVersion: v1
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: ${ENCRYPTION_KEY}
      - identity: {}
```

읽는 순서로 뜯으면 이렇다. `resources`의 안쪽 `resources: [secrets]`는 암호화 대상을 Secret으로 한정한다(ConfigMap 등 다른 자원은 대상이 아니다). `providers`는 순서가 의미를 갖는 목록이다.

`providers` 순서의 규칙이 이 설정의 핵심이다. **쓰기에는 목록의 첫 프로바이더가 쓰이고, 읽기에는 목록을 위에서부터 시도한다.** 여기서는 `aescbc`(AES-CBC 암호화)가 첫 번째라 새로 쓰는 Secret은 전부 암호화되고, `identity: {}`(평문, 무변환)가 두 번째라 폴백(fallback)으로 남는다. `identity`가 뒤에 있으면 암호화 이전에 이미 평문으로 저장돼 있던 Secret도 계속 읽힌다. 만약 두 프로바이더 순서를 뒤집어 `identity`를 먼저 두면, 새 Secret이 평문으로 저장돼 암호화가 무의미해진다.

> **논리적 추론에 따른 답.** 이 템플릿은 `kind: EncryptionConfig` / `apiVersion: v1` 형식이다. 현재 upstream 쿠버네티스 문서는 `kind: EncryptionConfiguration` / `apiVersion: apiserver.config.k8s.io/v1`을 쓴다. 리포가 고정한 형식을 그대로 따르되, 최신 클러스터·제품에서는 새 형식을 쓴다는 차이를 알아둔다. 정확한 대응은 착수 시 리포와 upstream 문서로 확인한다. ([Encrypting Confidential Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/))

## 04. envsubst 치환과 배포 {#envsubst-and-distribution}

템플릿의 `${ENCRYPTION_KEY}` 자리에 방금 만든 키를 치환해 실제 설정 파일을 만든다.

```bash
envsubst < configs/encryption-config.yaml > encryption-config.yaml
```

`envsubst`(환경변수 치환 도구)가 템플릿을 읽어 `${ENCRYPTION_KEY}`를 환경의 값으로 바꾼 결과를 `encryption-config.yaml`로 쓴다. 앞에서 키를 `export`한 이유가 여기다. 혹시 `envsubst: command not found`가 뜨면 `sudo apt-get install -y gettext-base`로 넣고 다시 실행한다(gettext 패키지에 들어 있다).

치환이 실제로 됐는지 로컬에서 확인한다.

```bash
cat encryption-config.yaml
```

`secret:` 자리에 base64 문자열이 채워져 있어야 한다. 만약 `${ENCRYPTION_KEY}`가 그대로 보이면 치환이 실패한 것이니(대개 `export` 누락) 거기서 멈춘다.

컨트롤 플레인인 server로 보낸다.

```bash
scp encryption-config.yaml root@server:~/
ssh -n root@server "ls -1 ~/encryption-config.yaml"
```

server에 파일이 뜨면 06이 끝이다. 이 파일은 암호화 키를 평문으로 담고 있으니 취급에 주의한다. 사실상 Secret 그 자체다. 버전 관리에 올리지 않고, 접근 권한을 좁게 둔다.

> **제품으로 접히는 지점.** RKE2는 이 저장 데이터 암호화를 자동으로 구성한다(secrets-encryption 기능). Hard Way에서 손으로 키를 만들고 프로바이더 순서를 짜고 apiserver 플래그로 거는 이 과정을, RKE2는 설치 시 알아서 처리한다. 제품 콘솔이 다뤄야 하는 건 그 위의 운영, 곧 키 상태 조회와 회전(rotation)이다. 손으로 겪은 이 층이 제품이 자동화하는 지점을 읽는 근거가 된다.

---

## 부록 A. 핵심 어휘 빠른 참조 {#appendix-a-glossary}

| 용어 | 한 줄 정의 |
| --- | --- |
| **저장 데이터 암호화(encryption at rest)** | apiserver가 Secret을 etcd에 쓰기 전에 암호화하는 것. etcd 디스크·백업 탈취를 방어 |
| **대칭 키(symmetric key)** | 암호화·복호화에 같은 키를 쓰는 방식. 인증서의 비대칭 키와 다른 종류 |
| **AES-CBC(aescbc)** | 대칭 암호 알고리즘의 한 모드. Hard Way가 쓰는 암호화 프로바이더 |
| **`/dev/urandom`** | 커널의 암호학적 난수원. 여기서 32바이트를 뽑아 256비트 키를 만듦 |
| **base64** | 이진 데이터를 텍스트로 바꾸는 인코딩. 암호가 아니라 표현 방식(그래서 etcd 기본 저장이 노출됨) |
| **EncryptionConfig** | apiserver의 암호화 설정. 대상 자원과 프로바이더 목록을 담음 |
| **identity 프로바이더** | 무변환(평문) 프로바이더. 목록 뒤에 두면 기존 평문 Secret을 읽는 폴백 |
| **프로바이더 순서** | 쓰기엔 첫 프로바이더, 읽기엔 위에서부터. 그래서 aescbc 먼저·identity 나중 |
| **envsubst** | 템플릿의 `${VAR}`를 환경변수 값으로 치환하는 도구(gettext-base) |
| **KMS provider** | 키를 호스트 밖 외부 키 관리 서비스에 두는 방식. 호스트 침해까지 방어(Hard Way 범위 밖) |

---

## 부록 B. 명령어 빠른 참조 {#appendix-b-commands}

```bash
# === 암호화 키 생성 (jumpbox, 리포 디렉터리에서) ===
export ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64)   # 32바이트(256비트) → base64

# === 템플릿 치환 (envsubst 없으면 apt-get install -y gettext-base) ===
envsubst < configs/encryption-config.yaml > encryption-config.yaml
cat encryption-config.yaml                                   # secret: 자리에 base64 채워졌는지 확인

# === server로 배포 ===
scp encryption-config.yaml root@server:~/
ssh -n root@server "ls -1 ~/encryption-config.yaml"

# === (페이즈 2·리포 08) apiserver에서 활성화되는 플래그, 참고 ===
# --encryption-provider-config=/var/lib/kubernetes/encryption-config.yaml
```

---

## 개인 노트 {#personal-notes}

### 손때 검증 상태 {#hands-on-status}

이 구간은 실습으로 닫혔다. 키 생성, 템플릿 치환(`cat`으로 base64 채움 확인), server 배포(`ls`로 확인)를 실제로 수행했다. 짧고 곧은 구간이라 이번엔 박제할 삽질이 없었다. 그 자체를 기록으로 남긴다. 다만 이 파일이 담은 키의 실제 활성화(apiserver 플래그)와 암호화가 정말 걸렸는지의 검증은 페이즈 2에서 apiserver를 올린 뒤에 확인할 몫이다.

### 심화로 가는 길 {#deeper}

- **암호화 프로바이더 비교**: `aescbc`·`aesgcm`·`secretbox`·`kms`의 성능·보안·키 회전 요구의 차이. AES-GCM은 빠르지만 자동 키 회전 없이는 권장되지 않는다.
- **키 회전(key rotation)**: 새 키를 목록 앞에 추가 → 모든 Secret 재작성(`kubectl get secrets -A -o json | kubectl replace -f -`) → 옛 키 제거의 순서. etcd에서 어느 키로 암호화됐는지(`k8s:enc:aescbc:v1:...` 접두)를 확인하는 방법.
- **호스트 침해와 KMS**: 로컬 키의 한계와, KMS provider로 키를 호스트 밖에 두는 봉투 암호화(envelope encryption)의 구조.
- **적용 범위 확장**: Secret 외 다른 민감 자원으로 암호화 대상을 넓힐 때의 고려.

### 자기 점검 {#self-check}

각 절이 왜 성립하는지를 한 줄로 재구성해 본다.

1. **왜 base64만으로는 부족한가** → base64는 암호가 아니라 되돌릴 수 있는 표현 방식이라, etcd에 닿는 사람은 Secret을 평문으로 본다 (→ 왜 저장 데이터 암호화인가).
2. **왜 키가 32바이트인가** → AES-256이 256비트(32바이트) 키를 요구하기 때문 (→ 대칭 키 생성).
3. **왜 identity를 목록 뒤에 두나** → 쓰기엔 첫 프로바이더(aescbc)가 쓰이고 읽기엔 위에서부터 시도하므로, identity가 뒤에 있어야 기존 평문 Secret을 폴백으로 읽는다 (→ EncryptionConfig 구조).
4. **왜 export가 필요한가** → envsubst가 값을 환경에서 읽으므로, export 없이 대입하면 치환이 빈 값으로 나간다 (→ envsubst 치환과 배포).
5. **이 방식의 한계는** → 키가 호스트의 평문 파일에 있어, etcd 유출은 막아도 호스트 침해 시 키까지 노출된다 (→ 왜 저장 데이터 암호화인가).

이로써 **A-페이즈 1(기반과 신뢰)이 완성**이다. 전용 클러스터망, CA와 여덟 인증서와 여섯 kubeconfig, 그리고 저장 데이터 암호화 키까지 프로세스를 올릴 판이 다 깔렸다. 다음은 페이즈 2, A3 etcd(리포 07)에서 이 위에 첫 프로세스를 올린다. server에 etcd를 세우고, 방금 배포한 인증서로 TLS를 걸어 단일 노드 etcd를 부트스트랩한다.
