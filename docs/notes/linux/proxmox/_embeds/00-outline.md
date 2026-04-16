---
title: "Outline"
date: 2026-04-10
lastmod: 2026-04-10
author: "Davi"
description: "Proxmox VE VM 라이프사이클 & REST API 심화 학습 - 개요"
slug: "proxmox-outline"
section: "notes"
category: "linux"
tags: [proxmox, virtualization, linux, debian, 64x-bit, cmp, cloud, cluster, ssh, partitioning]
order: 0
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 0
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
embed_only: true
---


"VM 생성/삭제/복제/스냅샷/백업/복구의 CLI 조작과 Proxmox REST API, 인증 체계, 비동기 태스크, QEMU Guest Agent, Cloud-Init까지 CMP 개발자 관점에서 정리한다."

proxmox-vm-lifecycle-and-api

## proxmox-lvm-disk.md

### 이전 환경

```bash
pvecm status && echo "---" && pvecm nodes && echo "---" && ha-manager status && echo "---" && cat /etc/pve/storage.cfg

>  ############################
>  #### pvecm status 결과
>  ############################
>  Cluster information
>  -------------------
>  Name:             test  # "test"라는 이름의 클러스터
>  Config Version:   3
>  Transport:        knet  # 노드 간 통신은 보안이 적용된 Kronosnet 사용
>  Secure auth:      on
>  
>  Quorum information
>  ------------------
>  Date:             Fri Apr 10 09:24:52 2026
>  Quorum provider:  corosync_votequorum
>  Nodes:            3     # 총 노드 세 개가 클러스터에 존재
>  Node ID:          0x00000003
>  Ring ID:          1.74
>  Quorate:          Yes
>  
>  Votequorum information
>  ----------------------
>  Expected votes:   3     # 노드 수만큼의 투표권 3표
>  Highest expected: 3
>  Total votes:      3
>  Quorum:           2     # 정족수를 만족하려면 2표 이상이 필요
>  Flags:            Quorate   # == YES, 현재 정족수를 만족한 상태
>  
>  Membership information  # 각 Name은 연결된 노드의 HOST IP를 가리킨다.
>  ----------------------  # 모두 1표씩 잘 행사하며 연결되어 있다.
>      Nodeid      Votes Name
>  0x00000001          1 10.10.250.115    # pve
>  0x00000002          1 10.10.250.117    # pve-ksy
>  0x00000003          1 10.10.250.119 (local) # kcy0122
>  ---
>  
>  ############################
>  #### pvecm nodes 결과
>  ############################
>  Membership information  # 마찬가지 노드 목록:
>  ----------------------  # IP 대신 호스트명으로 보여준다.
>      Nodeid      Votes Name
>           1          1 pve
>           2          1 pve-ksy
>           3          1 kcy0122 (local)
>  ---
>  
>  ############################
>  #### ha-manager status 결과 : 고가용성(HA) 매니저 상태
>  ############################
>  quorum OK                                       # 정족수 문제없음.
>  master pve (active, Fri Apr 10 09:24:45 2026)   # HA 관리하는 마스터노드 = pve
>  lrm kcy0122 (idle, Fri Apr 10 09:24:53 2026)    # 각 노드의 Local Resource Manager Daemon 상태
>  lrm pve (idle, Fri Apr 10 09:24:53 2026)
>  lrm pve-ksy (active, Fri Apr 10 09:24:45 2026)
>  service vm:301 (pve-ksy, started)   # VM 301이 HA 보호를 받아 pve-ksy 노드에서 실행 중.
>  ---
>  
>  ############################
>  #### cat /etc/pve/storage.cfg 결과: Proxmox Storage 설정 파일
>  ############################
>  dir: local             # 일반 디렉토리 스토리지. 백업, 템플릿, ISO 등 파일을 저장한다.
>          path /var/lib/vz
>          content vztmpl,iso,backup,import
>  
>  lvmthin: local-lvm     # VG "pve" 안의 Thin-Pool `data`를 사용 중인 LVM-Thin 스토리지.
>          thinpool data  # VM 가상 디스크(images)나 컨테이너 루트(rootdir) 용도로 사용한다.
>          vgname pve
>          content images,rootdir
>  
>  nfs: shared            # .117 서버(노드)에서 마운트한 NFS 네트워크 스토리지.
>          export /mnt/nfs_shared
>          path /mnt/pve/shared
>          server 10.10.250.117
>          content vztmpl,iso,backup,rootdir,import,images,snippets
>          prune-backups keep-all=1
```
