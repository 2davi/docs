---
title: "Soft Reset"
section: notes
category: git
slug: "soft-reset"
draft: false
---


로컬에서 방금 커밋한 사항을 무르고 싶다.

대충 SOFT인 건 기억나는데 명령어를 어케 쳐야 하는지 매번 가물가물해서 급하게 적어둠.

##

### 개요

나는 하남자라 한 개씩만 찔끔찔끔 지우려 한다.

여러 개를 한 번에 지울 거라면 HEAD~N (HEAD부터 최근 N개 커밋 삭제)

나는 상남자라 원격 커밋 히스토리는 GUI로 만진다 ^0^.

<br/>

#### 커밋만 지우고, 작업 내용은 working directory에 그대로 남기고 싶다:

```bash
git reset --soft HEAD~1
```

#### 커밋을 지우고 변경된 코드도 staged에서 빼되 && working directory에는 남기고 싶다:

```bash
git reset --mixed HEAD~1
```

#### 커밋도 지우고, 이 커밋이 간직한 변경사항도 전부 날리고 싶다:

```bash
git reset --hard HEAD~1
```

#### 커밋할 사항은 그대로인데 **메시지**만 고치고 싶다:

```bash
git commit --amend
```
