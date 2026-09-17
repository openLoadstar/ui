### IDENTITY
- SUMMARY:

### CONNECTIONS
- REFERENCE: []

### DIAGRAM
```mermaid
flowchart LR
    begin((시작)) --> step1[단계]
    step1 --> f1[[새 하위 흐름]]
    f1 --> s1[새 단계]
    f1 --> s2[새 단계]
    s2 --> m1
    f1 --> s3[새 단계]
    s3 --> m1
    s1 --> m1(( ))
    m1 --> done((끝))
```

### REFERENCES
- step1: [WP][2.0][2026.08.13]뷰 전환 아키텍처.md

### ISSUE
