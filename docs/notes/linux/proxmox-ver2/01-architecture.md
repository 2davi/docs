---
title: "01. Proxmox 단일 노드 환경 설계"
date: 2026-06-08
lastmod: 2026-06-08
author: "Davi"
description: ""
slug: architecture
section: "notes"
category: "linux/proxmox-ver2"
tags: []
order: 1
series: "Proxmox 실습 v2."
series_order: 1
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


## 실습 목표

1. 네트워크 학습
2. 스토리지 학습
3. pveproxy 학습

## Proxmox 단일 노드 환경 설계



## VirtualBox ─ 중첩 가상화 환경에서 ProxmoxVE 노드의 "완전히 꼬임"

Proxmox 노드를 띄워놓고 Spring Boot를 작업하고 있으면, 어느 순간 PVE VM이 '완전히 꼬임' 상태로 뻗어있는 경우가 종종 발생한다. 4Core 16GiB 랩탑 위에서 구동하기에 리소스를 충분히 할당하지 못하는 것이 원인인 줄로 판단하고 있다.

해보고 지켜봐야 알 일이지만, **RAM 헤드룸 확보**와 **Windows Defender 실시간 검사 제외**가 해결 방법이 될 수 있다길래 눈 감고 아웅하는 심정으로 시도해본다.

### 조치 1 ─ RAM 헤드룸 확보

- PowerShell: 게스트 RAM을 미리 통째로 할당

```powershell
$VBM = "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"
$PVE = "ProxmoxVE9.2-NODE"

& $VBM setextradata $PVE VBoxInternal/RamPreAlloc 1
```

### 조치 2 ─ Windows Defender 예외 처리

- 관리자 권한 PowerShell: Windows Defender 실시간 검사 대상에서 VirtualBox VM 제외

```powershell
# .vdi/.vmdk가 들어있는 폴더를 검사 제외
Add-MpPreference -ExclusionPath "C:\Users\letech\VirtualBox VMs"

# VirtualBox 프로세스들 제외
Add-MpPreference -ExclusionProcess "VBoxHeadless.exe"
Add-MpPreference -ExclusionProcess "VirtualBoxVM.exe"
Add-MpPreference -ExclusionProcess "VBoxSVC.exe"
Add-MpPreference -ExclusionProcess "VBoxManage.exe"
```

### 조치 3 ─ Watchdog 실행

몇 분 간격으로 MGMT IP(10.10.1.11)나 8006 포트를 확인한다. 연속 N회 무응답 발생 시 `VBoxManage controlvm "ProxmoxVE9.2-NODE" reset` + 타임스탬프 로그를 남기도록 작업 스케줄러를 돌린다.

- `.ps1` Watchdog Script 작성 → `C:\Users\letech\proxmox-watchdog.ps1`으로 저장

```ps1
# ===================== Settings (edit for your environment) =====================
$VBoxManage    = "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"
$VmName        = "ProxmoxVE9.2-NODE"      # VirtualBox VM name (exact match)
$ProbeHost     = "10.10.1.11"             # Proxmox MGMT IP
$ProbePorts    = @(8006, 22)              # alive if ANY of these accepts a TCP connect
$IntervalSec   = 30                       # poll interval when healthy (seconds)
$FailThreshold = 5                        # consecutive failures before reset (5 x 30s = ~2.5 min)
$ProbeTimeout  = 3000                     # TCP connect timeout (ms)
$GraceSec      = 150                      # wait after reset/start; set LONGER than Proxmox boot time
$LogPath       = "$env:USERPROFILE\proxmox-watchdog.log"
$PauseFlag     = "$env:USERPROFILE\proxmox-watchdog.pause"   # if this file exists -> stand down
# ================================================================================

# ----- Logging: timestamped, appended to file + echoed to console -----
function Write-Log([string]$Message) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
    Write-Host $line
}

# ----- TCP port liveness check (low-level socket with explicit timeout) -----
function Test-TcpAlive {
    param([string]$TargetHost, [int[]]$Ports, [int]$TimeoutMs)
    foreach ($port in $Ports) {
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $async = $client.BeginConnect($TargetHost, $port, $null, $null)
            if ($async.AsyncWaitHandle.WaitOne($TimeoutMs, $false) -and $client.Connected) {
                $client.EndConnect($async)
                return $true            # one port up = alive
            }
        } catch {
            # this port failed; try the next one
        } finally {
            $client.Close()
        }
    }
    return $false                       # all ports silent
}

# ----- Query VM state -----
function Get-VmState {
    $info = & $VBoxManage showvminfo $VmName --machinereadable 2>$null
    if (-not $info) { return "unknown" }
    $m = $info | Select-String '^VMState='
    if ($m) { return (($m.Line -split '=', 2)[1]).Trim('"') }
    return "unknown"
}

# ============================ Startup checks ============================
if (-not (Test-Path $VBoxManage)) {
    Write-Log "FATAL: VBoxManage not found at $VBoxManage. Exiting."
    exit 1
}

Write-Log "Watchdog started - VM='$VmName', target=$ProbeHost, ports=$($ProbePorts -join ','), threshold=$FailThreshold, interval=${IntervalSec}s"
$failCount = 0
$paused    = $false

# ============================== Main loop ==============================
while ($true) {

    # --- Pause gate: operator intentionally took the lab down. ---
    #     Stand down completely; log only on enter/leave so the log stays clean.
    if (Test-Path $PauseFlag) {
        if (-not $paused) { Write-Log "Pause flag found -> standing down (no auto-recovery until flag is cleared)"; $paused = $true }
        $failCount = 0
        Start-Sleep -Seconds $IntervalSec
        continue
    }
    if ($paused) { Write-Log "Pause flag cleared -> resuming watch"; $paused = $false }

    $state = Get-VmState

    if ($state -eq "running") {
        # VM process is up. Check whether the actual service responds.
        if (Test-TcpAlive -TargetHost $ProbeHost -Ports $ProbePorts -TimeoutMs $ProbeTimeout) {
            if ($failCount -gt 0) { Write-Log "Recovered - service responding again (after $failCount consecutive failures)" }
            $failCount = 0
        }
        else {
            $failCount++
            Write-Log "No response ($failCount/$FailThreshold) - $ProbeHost ports $($ProbePorts -join ',') all silent"
            if ($failCount -ge $FailThreshold) {
                # Guest is frozen, so ACPI shutdown will not work -> hard reset.
                Write-Log "Threshold reached -> controlvm reset (hard reset)"
                & $VBoxManage controlvm $VmName reset 2>&1 | Out-Null
                $failCount = 0
                Start-Sleep -Seconds $GraceSec   # hold probing while it reboots
                continue
            }
        }
    }
    elseif ($state -eq "paused") {
        # VirtualBox auto-pauses the guest e.g. when the host disk runs out of space.
        Write-Log "State=paused -> controlvm resume (check host free disk space)"
        & $VBoxManage controlvm $VmName resume 2>&1 | Out-Null
        $failCount = 0
    }
    elseif ($state -in @("saved", "poweroff", "aborted")) {
        # Powered off / aborted / saved -> bring it back (reset only works on running).
        Write-Log "State=$state -> startvm --type headless"
        & $VBoxManage startvm $VmName --type headless 2>&1 | Out-Null
        $failCount = 0
        Start-Sleep -Seconds $GraceSec
        continue
    }
    else {
        # gurumeditation / stuck / unknown -> force power off, then start.
        Write-Log "State=$state (abnormal) -> poweroff then start"
        & $VBoxManage controlvm $VmName poweroff 2>&1 | Out-Null
        Start-Sleep -Seconds 5
        & $VBoxManage startvm $VmName --type headless 2>&1 | Out-Null
        $failCount = 0
        Start-Sleep -Seconds $GraceSec
        continue
    }

    Start-Sleep -Seconds $IntervalSec
}
```

- Watchdog이 참조할 플래그 전환 파일 생성

**lab-up.bat:**

```bat
@echo off
REM ============================================================
REM  Lab UP  -  start of day (double-click)
REM  Just clear the pause flag. The watchdog detects the VM is down
REM  and brings it up within one poll cycle, so no startvm needed here.
REM ============================================================
del "%USERPROFILE%\proxmox-watchdog.pause" 2>nul
echo [Lab UP] Pause flag cleared. Watchdog will start the lab shortly.
timeout /t 3 >nul
```

**lab-down.bat:**

```bat
@echo off
REM ============================================================
REM  Lab DOWN  -  end of day (double-click)
REM  Order matters: set the pause flag FIRST so the watchdog stops
REM  auto-restarting, THEN gracefully shut down the VM. This avoids
REM  a race where the watchdog sees the VM down before it is paused.
REM ============================================================
set "VBOX=C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"
set "VM=ProxmoxVE9.2-NODE"

echo paused > "%USERPROFILE%\proxmox-watchdog.pause"
echo [Lab DOWN] Watchdog paused.

"%VBOX%" controlvm "%VM%" acpipowerbutton
echo [Lab DOWN] Sent graceful ACPI shutdown to %VM%.
timeout /t 3 >nul
```

- 관리자 권한 PowerShell: 작업 스케줄러 등록

```powershell
# 변수 5개 미리 지정 (scriptPath, action, trigger, principal settings)
$scriptPath = "$env:USERPROFILE\proxmox-watchdog.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe"  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet  -MultipleInstances IgnoreNew  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

# 작업 스케줄러 등록
Register-ScheduledTask -TaskName "ProxmoxWatchdog" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force

# 작업 스케줄러 해지
Unregister-ScheduledTask -TaskName "ProxmoxWatchdog" -Confirm:$false -ErrorAction SilentlyContinue
```

- 검증

```powershell
Start-ScheduledTask -TaskName "ProxmoxWatchdog"
Start-Sleep -Seconds 3
Get-ScheduledTask -TaskName ProxmoxWatchdog | Select-Object State # Running이어야 정상
Get-Content "$env:USERPROFILE\proxmox-watchdog.log" -Wait # 노드가 문제 없을 땐 작동 안 함.
```

> lab-up.bat 파일을 실행하는 것으로 ProxmoxVE9.2-NODE VM을 시작한다.
>
> 작업을 마치고 종료할 땐 lab-down.bat 파일 실행하여 VM을 종료한다.
