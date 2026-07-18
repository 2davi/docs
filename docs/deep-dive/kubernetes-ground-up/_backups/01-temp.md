

## 1. Debian 13.3 설치

## 2. Debian 기본 환경 세팅

### 필수 기본 패키지 설치

root 계정으로 넘어간 뒤에 진행한다.

```bash
iidavi@ctl-01:~$ su -
> Password: ******

root@ctl-01:~$ apt update && apt install -y sudo curl apt-transport-https ca-certificates gnupg vim nano
```

설치가 끝나면, 일반 계정(`iidavi`)에 sudo 권한을 부여한다.

```bash
root@ctl-01:~$ usermod -aG sudo iidavi
root@ctl-01:~$ su iidavi
> [sudo] password for iidavi: ******
```

### Swap 메모리 영구 비활성화

Kubernetes 설치 전 ***필수적으로 진행해야*** 하는 절차이다. **Kubernetes의 자원 스케줄링 메커니즘과 Linux Kernel의 Swap 메커니즘이 정면으로 충돌**하기 때문이다.

```bash
# 지금 켜져있는 거 즉시 끄기
iidavi@ctl-01:~$ sudo swapoff -a

# 부팅 시에도 안 켜지게 자동 활성화 막기 (== fstab에서 swap라인 주석 처리)
iidavi@ctl-01:~$ sudo sed -i '/swap/s/^/#/' /etc/fstab
```

**검증:**

```bash
free -h

iidavi@ctl-01:~$ nano /etc/fstab
```

![/etc/fstab에서 swap 라인 주석 처리 확인](./_embeds/img/01-temp/20260707_001.png)


