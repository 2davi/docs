# 네트워크 학습 시리즈 — 영문 보조 앵커 맵

각 헤더에 박은 영문 커스텀 앵커(`{#ID}`)의 정본 목록. 향후 영문 번역 시 이 slug을 그대로 유지하면 URL fragment가 언어 무관하게 안정적으로 보존된다.

## 01-stage-0.md

| 레벨 | 헤더(KO) | 앵커(EN) |
| --- | --- | --- |
| H2 | 개요 ─ Stage 0 | `#overview` |
| H2 | 진단 질문 | `#diagnostic-questions` |
| H2 | 01. 계층 모델 ─ OSI와 TCP/IP | `#layer-models-osi-tcpip` |
| H2 | 02. 아파트 단지 비유 | `#apartment-complex-analogy` |
| H2 | 03. 주소의 세 가지 — MAC, IP, Port | `#three-addresses-mac-ip-port` |
| H2 | 04. 데이터 단위 ─ Frame, Packet, Segment | `#data-units-frame-packet-segment` |
| H3 | 캡슐화의 흐름 (송신 측) | `#encapsulation-flow` |
| H2 | 05. ARP ─ IP와 MAC를 잇는 다리 | `#arp-ip-to-mac` |
| H3 | ARP 동작 순서 | `#arp-sequence` |
| H3 | ARP 특성 | `#arp-characteristics` |
| H2 | 06. 단지 판별 ─ 서브넷 마스크와 AND 연산 | `#subnet-decision-mask-and` |
| H3 | /24 예시 | `#subnet-example-24` |
| H3 | /24 vs /16 — 마스크가 달라지면 판정도 달라진다 | `#mask-comparison-24-vs-16` |
| H3 | 호스트 부분 — 사용 가능한 IP 범위 | `#host-range-usable-ips` |
| H3 | 마스크가 /25일 때 | `#subnet-split-25` |
| H2 | 07. 게이트웨이 ─ 단지를 떠나는 출구 | `#gateway-exit-to-other-subnet` |
| H3 | 라우팅 테이블의 모습 | `#routing-table-anatomy` |
| H3 | 다른 단지로 갈 때의 프레임 — dst MAC이 누구인가 | `#cross-subnet-frame-dst-mac` |
| H2 | 08. Broadcast Domain vs Collision Domain | `#broadcast-vs-collision-domain` |
| H3 | Collision Domain (충돌 영역) | `#collision-domain` |
| H3 | Broadcast Domain (브로드캐스트 영역) | `#broadcast-domain` |
| H2 | 09. 패킷의 생애주기 ─ 아파트 단지 비유 | `#packet-lifecycle-walkthrough` |
| H3 | 시나리오 A — 같은 단지 통신 (VM-A → VM-B) | `#scenario-a-same-subnet` |
| H3 | 시나리오 B — 다른 단지 통신 (VM-A → google.com) | `#scenario-b-cross-subnet` |
| H3 | 두 시나리오의 대비 | `#scenario-comparison` |
| H2 | 10. 무작위 모드와 NAT | `#promiscuous-mode-and-nat` |
| H3 | 무작위 모드 - L2 이슈 | `#promiscuous-mode-l2` |
| H3 | NAT ─ L3 이슈 | `#nat-l3` |
| H2 | 부록 A. 핵심 어휘 빠른 참조 | `#appendix-glossary` |
| H2 | 부록 B. 명령어 빠른 참조 (Linux) | `#appendix-commands` |
| H2 | 개인 노트 | `#personal-notes` |
| H3 | 미완·심화로 가는 길 | `#further-study` |
| H3 | 자기 점검 — 진단 질문 재방문 | `#self-check-revisit` |

## 02-stage-1.md

| 레벨 | 헤더(KO) | 앵커(EN) |
| --- | --- | --- |
| H2 | 개요 ─ Stage 1 | `#overview` |
| H2 | 진단 질문 | `#diagnostic-questions` |
| H2 | 01. ip 명령어 | `#ip-command` |
| H2 | 02. 라우팅 테이블 읽는 법 | `#reading-routing-table` |
| H3 | 각 필드의 의미 | `#routing-table-fields` |
| H3 | 핵심 — 결정적 단어는 `via` | `#routing-table-via-keyword` |
| H3 | Longest Prefix Match | `#longest-prefix-match` |
| H2 | 03. 같은 8.8.8.8, 다른 게이트웨이 | `#same-dest-different-gateway` |
| H2 | 04. ip_forward | `#ip-forward` |
| H3 | 중요 — 브리지(스위칭)와 `ip_forward`(라우팅)는 다른 layer | `#bridging-vs-routing-layers` |
| H2 | 05. /etc/network/interfaces ─ 영속적 네트워크 설정 | `#persistent-network-config` |
| H3 | 키워드 해설 | `#interfaces-keywords` |
| H3 | method — `static` vs `dhcp` vs `manual` | `#interfaces-method-types` |
| H3 | `post-up` — 활성화 후 훅(hook) | `#interfaces-post-up-hook` |
| H2 | 06. systemd Predictable Interface Names ─ `.link` 파일 | `#predictable-interface-names` |
| H3 | 필요 ─ `eth0`의 문제 | `#why-eth0-problem` |
| H3 | 해결 ─ 물리 위치 기반의 예측 가능한 이름 | `#location-based-naming` |
| H3 | .link 파일로 이름 직접 바꾸기 | `#renaming-with-link-file` |
| H2 | 07. 브리지와 커널의 분업 | `#bridge-kernel-division` |
| H2 | 부록 A. 명령어 빠른 참조 | `#appendix-commands` |
| H2 | 부록 B. 핵심 어휘 | `#appendix-glossary` |
| H2 | 개인 노트 | `#personal-notes` |
| H3 | 미완·심화로 가는 길 | `#further-study` |
| H3 | 자기 점검 — 진단 질문 재방문 | `#self-check-revisit` |

## 03-stage-2.md

| 레벨 | 헤더(KO) | 앵커(EN) |
| --- | --- | --- |
| H2 | 개요 ─ Stage 2 | `#overview` |
| H2 | 진단 질문 | `#diagnostic-questions` |
| H2 | 01. netfilter ─ 패킷이 지나는 검문소들 | `#netfilter-overview` |
| H3 | 5개 hook ─ 패킷 흐름의 검문소 | `#netfilter-five-hooks` |
| H3 | 4개 table ─ 검문소에서 *하는 일* | `#netfilter-four-tables` |
| H2 | 02. filter 테이블 ─ 방화벽의 자리 | `#filter-table` |
| H3 | 진단 질문 1·2 ─ Proxmox의 텅 빈 filter 테이블 | `#empty-filter-table-proxmox` |
| H2 | 03. nat 테이블 ─ 주소 변환 | `#nat-table` |
| H3 | 왜 SNAT은 POSTROUTING, DNAT은 PREROUTING인가 | `#snat-postrouting-dnat-prerouting` |
| H3 | MASQUERADE vs SNAT | `#masquerade-vs-snat` |
| H3 | 진단 질문 6의 답 | `#nat-direction-answer` |
| H2 | 04. conntrack ─ stateful의 심장 | `#conntrack-stateful-core` |
| H3 | PAT의 개념과 conntrack 이해 | `#pat-and-conntrack` |
| H3 | 핵심 ─ 포트가 *식별 꼬리표*가 된다 | `#port-as-identifier` |
| H3 | 더블 NAT ─ VirtualBox와 중첩 VM pfSense | `#double-nat-nested` |
| H2 | 05. pf ─ pfSense의 FreeBSD 방화벽 | `#pf-pfsense-firewall` |
| H3 | 진단 질문 3 ─ `conntrack`이 없는 이유 | `#why-no-conntrack-pf` |
| H3 | pf의 동작 ─ Pass / Block / Reject | `#pf-pass-block-reject` |
| H3 | 진단 질문 4 ─ Block vs Reject | `#block-vs-reject` |
| H2 | 06. 방화벽 아키텍처 ─ 원칙 | `#firewall-architecture-principles` |
| H3 | ① 기본 거부, 예외 허용 (Default Deny) | `#default-deny` |
| H3 | ② 위에서 아래로, 첫 매치에서 멈춤 (First-Match) | `#first-match-evaluation` |
| H3 | ③ 진단 질문 5 ─ Pass/Any/Any의 위험과 최소 권한 | `#any-any-risk-least-privilege` |
| H3 | ④ 방화벽만으로는 부족하다 | `#firewall-not-enough` |
| H2 | 부록 A. 핵심 어휘 빠른 참조 | `#appendix-glossary` |
| H2 | 부록 B. 명령어 빠른 참조 | `#appendix-commands` |
| H2 | 개인 노트 | `#personal-notes` |
| H3 | 미완·심화로 가는 길 | `#further-study` |
| H3 | 자기 점검 — 진단 질문 재방문 | `#self-check-revisit` |

## 04-stage-3.md

| 레벨 | 헤더(KO) | 앵커(EN) |
| --- | --- | --- |
| H2 | 개요 ─ Stage 3 | `#overview` |
| H2 | 진단 질문 | `#diagnostic-questions` |
| H2 | 01. Linux Bridge ─ 커널 속 L2 스위치 | `#linux-bridge-l2-switch` |
| H2 | 02. MAC 주소 학습(MAC Learning)과 FDB | `#mac-learning-and-fdb` |
| H3 | src MAC과 입력 포트 | `#src-mac-ingress-port` |
| H3 | Unknown Unicast Flooding | `#unknown-unicast-flooding` |
| H3 | **모르면 뿌리고(flood), 알면 집어준다(forward)** | `#flood-vs-forward` |
| H3 | 시나리오 ─ 학습 안 된 브리지와 VM-A·B | `#scenario-unlearned-bridge` |
| H2 | 03. 무작위 모드 | `#promiscuous-mode` |
| H3 | 정상 NIC의 하드웨어 MAC 필터 | `#nic-hardware-mac-filter` |
| H3 | 무작위 모드 ─ MAC 필터를 끄는 스위치 | `#promiscuous-disables-filter` |
| H3 | 가상화의 딜레마 ─ 중첩 가상화 환경 | `#nested-virtualization-dilemma` |
| H3 | 조용한 실패 ─ MAC 필터 차단은 Drop이다 | `#silent-drop-failure` |
| H2 | 04. **시나리오 ─** 중첩 가상화 환경 | `#scenario-nested-virtualization` |
| H3 | 왜 "들어오는 dst MAC" 예시는 내 환경에 안 맞나 | `#inbound-dst-mac-mismatch` |
| H3 | 나가는 트래픽이 막히면 ─ 그 증상 | `#outbound-block-symptoms` |
| H2 | 05. Broadcast Storm - L2의 재앙 | `#broadcast-storm` |
| H3 | Broadcast 메커니즘 ─ 순환 + 증식 | `#storm-loop-amplification` |
| H3 | STP ─ 고리를 끊는 장치 | `#stp-breaks-loops` |
| H3 | 무작위 모드가 *기름을 붓는* 이유 | `#promiscuous-fuels-storm` |
| H2 | 06. VLAN 802.1Q | `#vlan-802-1q` |
| H3 | VLAN이란 ─ 물리 하나를 논리로 쪼개기 | `#vlan-logical-segmentation` |
| H3 | Access와 Trunk | `#access-and-trunk-ports` |
| H3 | vlan-aware bridge와 multi-bridge | `#vlan-aware-vs-multi-bridge` |
| H2 | 07. 방화벽(Firewall) ─ pfSense의 역할이 포트를 결정 | `#firewall-defines-port-role` |
| H2 | 부록 A. 핵심 어휘 빠른 참조 | `#appendix-glossary` |
| H2 | 부록 B. 명령어 빠른 참조 | `#appendix-commands` |
| H2 | 개인 노트 | `#personal-notes` |
| H3 | 미완·심화로 가는 길 | `#further-study` |
| H3 | 자기 점검 ─ 진단 질문 재방문 | `#self-check-revisit` |

## 05-stage-4.md

| 레벨 | 헤더(KO) | 앵커(EN) |
| --- | --- | --- |
| H2 | 개요 ─ Stage 4 | `#overview` |
| H2 | 진단 질문 | `#diagnostic-questions` |
| H2 | 01. 왜 분리하는가 ─ 분리의 동기 | `#why-separate-networks` |
| H2 | 02. 분리 동기 ─ ***왜***, 그리고 ***무엇*** | `#separation-why-and-what` |
| H3 | 관리망은 최후의 보루 ─ Out-of-Band Management | `#out-of-band-management` |
| H3 | Corosync는 클러스터의 생명선 | `#corosync-cluster-lifeline` |
| H3 | 환경에 따라 고려할 사안 | `#environment-considerations` |
| H2 | 03. 분리 비용 | `#separation-costs` |
| H2 | 04. 적정 분리도의 다섯 원칙 | `#five-principles-of-separation` |
| H2 | 05. Defense in Depth ─ 대체가 아니라 양보 | `#defense-in-depth` |
| H2 | 06. 물리 분리 vs 논리 분리(VLAN) | `#physical-vs-logical-separation` |
| H3 | 격리를 *누가/무엇이* 보장하는가 | `#who-guarantees-isolation` |
| H3 | Latency 관점 ─ 큐와 인터럽트의 경합 | `#latency-queue-interrupt` |
| H3 | 하이브리드는 표준이다 | `#hybrid-is-standard` |
| H2 | 07. 통신의 방향성 ─ 신뢰 비대칭(Trust Asymmetry) | `#trust-asymmetry-direction` |
| H2 | 08. 매개체 ─ 직접 통신과 중간 경유 | `#direct-vs-mediated-communication` |
| H2 | 09. Zone 기반 설계 | `#zone-based-design` |
| H2 | 10. pfSense 규칙 평가 순서 ─ top-down, first-match | `#pfsense-rule-evaluation-order` |
| H2 | 11. IP 대역 설계 ─ RFC 1918 | `#ip-addressing-rfc1918` |
| H2 | 12. Unbound DNS Resolver ─ 내부 도메인 | `#unbound-internal-dns` |
| H2 | 부록 A. 핵심 어휘 빠른 참조 | `#appendix-glossary` |
| H2 | 부록 B. 명령어 빠른 참조 | `#appendix-commands` |
| H2 | 개인 노트 | `#personal-notes` |
| H3 | 미완·심화로 가는 길 | `#further-study` |
| H3 | 자기 점검 ─ 진단 질문 재방문 | `#self-check-revisit` |

## 06-stage-5.md

| 레벨 | 헤더(KO) | 앵커(EN) |
| --- | --- | --- |
| H2 | 개요 ─ Stage 5 | `#overview` |
| H2 | 진단 질문 | `#diagnostic-questions` |
| H2 | 01. 클러스터란 무엇인가 | `#what-is-a-cluster` |
| H2 | 02. 분산 시스템의 본질적 난제 ─ FLP 불가능성 | `#flp-impossibility` |
| H2 | 03. Split-Brain과 CAP Theorem | `#split-brain-and-cap` |
| H2 | 04. Split-Brain을 막는 세 층위 ─ Quorum · Fence · Watchdog | `#quorum-fence-watchdog` |
| H2 | 05. Corosync Totem 프로토콜 | `#corosync-totem-protocol` |
| H2 | 06. Control Plane vs Data Plane | `#control-plane-vs-data-plane` |
| H2 | 07. HA Manager ─ 결정과 실행의 분리 | `#ha-manager-decision-execution` |
| H3 | Failover의 전체 흐름 | `#failover-flow` |
| H3 | Destination 노드 선정 기준 | `#destination-node-selection` |
| H2 | 08. 디스크는 어디 있어야 하는가 ─ 세 시나리오와 RPO | `#disk-placement-and-rpo` |
| H3 | RPO ─ Recovery Point Objective | `#rpo-definition` |
| H3 | (나)의 숨은 함정 ─ 공유 스토리지가 SPOF | `#shared-storage-spof` |
| H3 | 세 한계가 모이는 곳 ─ 분산 스토리지 | `#toward-distributed-storage` |
| H2 | 09. Ceph ─ RADOS · CRUSH · HCI | `#ceph-rados-crush-hci` |
| H3 | RADOS 위의 세 인터페이스 | `#rados-three-interfaces` |
| H3 | Ceph의 데몬들 ─ 또 한 번의 layer 분리 | `#ceph-daemons` |
| H3 | CRUSH ─ 중앙 메타데이터 서버 없는 분산 | `#crush-decentralized-placement` |
| H3 | Replication vs Erasure Coding | `#replication-vs-erasure-coding` |
| H3 | Ceph가 네트워크에 까다로운 이유 | `#ceph-network-demands` |
| H2 | 10. Ceph에 Stage 적용 | `#applying-stages-to-ceph` |
| H2 | 부록 A. 핵심 어휘 빠른 참조 | `#appendix-glossary` |
| H2 | 부록 B. 명령어 빠른 참조 | `#appendix-commands` |
| H2 | 개인 노트 | `#personal-notes` |
| H3 | 미완·심화로 가는 길 | `#further-study` |
| H3 | 자기 점검 ─ 진단 질문 재방문 | `#self-check-revisit` |
