> 🌐 **[English](README.md)** | **한국어**

# LOADSTAR Explorer UI

> 🚧 **LOADSTAR 2.0을 위해 재구축 중입니다.** 기존 구현(Spring Boot + React 웹앱)은 작업 트리에서 제거되었고 새 Go 프로젝트 스캐폴드로 대체되었습니다. 기존 구현은 이 저장소의 git 히스토리에서 그대로 조회할 수 있습니다.

> 📌 LOADSTAR가 처음이라면 먼저 [openLoadstar 전체 안내](https://github.com/openLoadstar/openLoadstar) 와 [spec 2.0 설계](https://github.com/openLoadstar/spec/tree/main/SPEC%202.0) 를 참고하세요.

---

## 🧭 계획 중인 방향

브라우저 기반 클라이언트/서버 앱이었던 이전 버전과 달리, **standalone 크로스플랫폼(Windows/Linux) 데스크톱 앱**으로 전환합니다.

| 레이어 | 스택 (계획) |
|:---|:---|
| 앱 셸 | Go + [Wails](https://wails.io) (OS 네이티브 웹뷰, 브라우저 엔진 번들 없음) |
| 추출기 | FORMAT별 플러그인 파서 (`spec 2.0/06.META_EXTRACTION.md` 참조) |
| 저장소 | SQLite (순수 RDBMS, FTS5 미사용 — 근거는 spec 2.0 참조) |
| 다이어그램 렌더링 | Mermaid.js, 웹뷰 안에서 실시간 렌더링 |

## 📄 License

[Apache License 2.0](./LICENSE)
