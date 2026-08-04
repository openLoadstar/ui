//go:build !windows

package main

// 다른 OS는 콘솔 코드페이지/GUI 서브시스템 핸들 문제가 없다 — 손댈 게 없다.
func fixConsoleOutput() {}
