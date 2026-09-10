//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// hideConsoleWindow는 자식 프로세스(git)가 콘솔 창을 새로 띄우지 않게 한다.
// Wails는 GUI 서브시스템으로 빌드되므로 부모에 붙일 콘솔이 없고, 그대로 두면
// 이력을 조회할 때마다 검은 창이 한 번씩 깜빡인다.
func hideConsoleWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
}
