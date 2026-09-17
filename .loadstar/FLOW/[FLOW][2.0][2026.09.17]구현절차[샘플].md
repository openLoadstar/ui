### IDENTITY
- SUMMARY:

### CONNECTIONS
- REFERENCE: []

### DIAGRAM
```mermaid
flowchart LR
    begin((시작)) --> step1[단계]
    step1 --> f1
    subgraph g1[사전작업그룹]
        f1 --> check
        check{조건 확인} -- 통과 --> work[본 작업]
        check -- 반려 --> back[되돌리기]
        f1[[새 하위 흐름]]
    end
    work --> out(( ))
    back --> out
    out --> s1[새 단계]
    out --> s2[새 단계]
    s2 --> m1
    out --> s3[새 단계]
    s3 --> m1
    s1 --> m1(( ))
    m1 --> done((끝))
```

### REFERENCES
- step1: [WP][2.0][2026.08.13]뷰 전환 아키텍처.md

### ISSUE
