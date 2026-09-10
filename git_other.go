//go:build !windows

package main

import "os/exec"

// 다른 OS는 콘솔 창이 새로 뜨는 문제가 없다 — 손댈 게 없다.
func hideConsoleWindow(cmd *exec.Cmd) {}
