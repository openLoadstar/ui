//go:build windows

package main

// 디버그 로그로 실측한 결과(2026-08-04): cmd.exe에서 `loadstar show`를 실행하면
// GetStdHandle(STD_OUTPUT_HANDLE)이 NULL(0x0)을 반환한다 — 코드페이지 문제가
// 아니라 표준출력 핸들 자체가 없는 상황이었다. Wails가 GUI 서브시스템으로
// 빌드하기 때문에(더블클릭 시 콘솔 창이 안 뜨게 하려는 목적) 생기는 것으로
// 보인다. 핸들이 이미 유효하면(콘솔이든 파이프든) 절대 건드리지 않고, NULL일
// 때만 AttachConsole로 부모 콘솔에 명시적으로 붙인다.
//
// (처음엔 이 판단 없이 무조건 AttachConsole을 시도했다가, 이미 유효한 핸들이
// 있던 환경 — Git Bash의 파이프 리다이렉션 등 — 에서 출력이 안 보이는
// 핸들로 새버리는 회귀를 만들어서 폐기했었다. NULL일 때만 개입하도록
// 좁히면 그 부작용 없이 실제 증상만 고칠 수 있다.)

import (
	"os"
	"syscall"
)

var (
	kernel32               = syscall.NewLazyDLL("kernel32.dll")
	procSetConsoleOutputCP = kernel32.NewProc("SetConsoleOutputCP")
	procGetStdHandle       = kernel32.NewProc("GetStdHandle")
	procAttachConsole      = kernel32.NewProc("AttachConsole")
)

const (
	cpUTF8 = 65001
	// STD_OUTPUT_HANDLE = -11. GetStdHandle takes a DWORD, so pass the
	// 32-bit two's-complement bit pattern of -11 — works on both 32/64-bit.
	stdOutputHandle = 0xFFFFFFF5
	// ATTACH_PARENT_PROCESS = -1.
	attachParentProcess = 0xFFFFFFFF
)

func fixConsoleOutput() {
	h, _, _ := procGetStdHandle.Call(uintptr(stdOutputHandle))
	if h == 0 {
		procAttachConsole.Call(uintptr(attachParentProcess))
		if f, err := os.OpenFile("CONOUT$", os.O_RDWR, 0); err == nil {
			os.Stdout = f
			os.Stderr = f
		}
	}
	_, _, _ = procSetConsoleOutputCP.Call(uintptr(cpUTF8))
}
