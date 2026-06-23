---
title: "사내 GitLab User Settings"
date: 2026-06-23
lastmod: 2026-06-23
author: "Davi"
description: ""
slug: "gitlab-setting"
section: "notes"
category: "ide/eclipse"
tags: []
order: 1
series: "Eclipse"
series_order: 1
status: "active"
draft: false
search: true
toc: true
difficulty: beginner
version: ""
---

Git이 `includeIf`와 같은 조건부 설정으로 사용자를 관리한다면, Eclipse(STS)는 EGit/JGit을 사용한다. EGit은 JGit 설정을 읽지만, JGit은 `includeIf`(조건부 포함) 파싱을 지원하지 않는다.

IntelliJ나 VSCode, CLI(Command-Line Interface)는 **실제 git binary를 호출해서** 커밋을 한다. 반면 Eclipse의 Git Plugin인 EGit은 git binary를 쓰지 않고, JGit이라는 **순수 Java로 구현한 git 엔진**을 사용한다.

문제는 이 JGit이 git의 모든 기능을 따라잡지 못하고 있다는 것 ─ JGit이 인식하는 옵션은 `ConfigConstants.java`를 봐야 안다고 한다. [(Eclipse ─ EGit/FAQ)](https://wiki.eclipse.org/EGit/FAQ)

사용자가 여러 계정을 자동 분리하여 쓰는 표준 도구가 `includeIf`인데, **JGit이 이걸 지원하지 않는다.**

Git 설정은 계층 구조고, **system > global > local** 순서로 범위가 좁아지며 **좁은 범위가 넓은 범위를 덮어쓴다.** Eclipse에서 Git Perspective로 GUI 작업을 할 때, 항상 Commit Staging의 author, committer 자리에 git global user 정보가 명시되는 것이다.

이 경우 문제가 되는 것은, 개인 GitHub Repository와 사내 GitLab으로 프로젝트를 관리할 때 발생한다. 혹여나 사내 프로젝트의 커밋 도중 Merge가 발생하면, 뜬금없이 GitHub 프로필로 'Merge ...' 같은 커밋 메시지가 추가되는 것이다.

EGit에서 이 문제를 해결하기 위해서는, 각 Repository마다 local 설정을 추가해주는 것이다.

**config 파일을 열어 아래와 같이 추가한다. (..\사내 프로젝트 레포\.git\config):**

```ini
[user]
	name = GitLab 사용자 아이디
	email = GitLab 사용자 이메일
```

```bash
git config user.name "GitLab 사용자 아이디"
git config user.email "GitLab 사용자 이메일"
```

혹여 안전장치를 만들어두고 싶다면, git global에 아래 설정을 한 줄 추가한다:

```ini
[user]
    useConfigOnly: true
```

identity가 명시적으로 설정되지 않으면 git이 호스트명·사용자명으로 자동 추론하는데, _useConfigOnly = true_ 를 주면 git이 추론을 거부하고 커밋을 막는다. [(HEITS ─ handle multiple Git accounts professionally)](https://heits.digital/articles/handle-multiple-git-accounts-professionally)
