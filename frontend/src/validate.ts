// 저장 시 경량 문법 검사.
//
// 정식 파서(구조 추출기 WP)를 대체하지 않는다 — 필수 섹션 존재 여부만 훑는
// 가벼운 체크다. 상세 스펙: SPEC 2.0/appendix/WP.md, DWP.md.

import type { ElementFormat } from "./tree";

export interface ValidationResult {
    valid: boolean;
    issues: string[];
}

function has(pattern: RegExp, raw: string): boolean {
    return pattern.test(raw);
}

function validateCommonEnvelope(raw: string): string[] {
    const issues: string[] = [];
    if (!has(/^###\s*IDENTITY/m, raw)) issues.push("`### IDENTITY` 섹션이 없습니다.");
    if (!has(/-\s*SUMMARY:/m, raw)) issues.push("IDENTITY에 `SUMMARY` 항목이 없습니다.");
    if (!has(/^###\s*CONNECTIONS/m, raw)) issues.push("`### CONNECTIONS` 섹션이 없습니다.");
    return issues;
}

function validateWp(raw: string): string[] {
    const issues = validateCommonEnvelope(raw);
    if (!has(/^##\s*\[STATUS]/m, raw)) issues.push("`## [STATUS]` 헤더가 없습니다.");
    if (!has(/^###\s*TODO/m, raw)) issues.push("`### TODO` 섹션이 없습니다.");
    return issues;
}

function validateDwp(raw: string): string[] {
    return validateCommonEnvelope(raw);
}

export function validateContent(format: ElementFormat, raw: string): ValidationResult {
    let issues: string[];
    switch (format) {
        case "WP":
            issues = validateWp(raw);
            break;
        case "DWP":
            issues = validateDwp(raw);
            break;
        case "GROUP":
            issues = validateCommonEnvelope(raw);
            break;
        case "OTHER":
            // OTHER는 공통 봉투 자체가 면제된다(02.ELEMENT_FORMAT.md §6) — 검사할 게 없다.
            issues = [];
            break;
    }
    return { valid: issues.length === 0, issues };
}
