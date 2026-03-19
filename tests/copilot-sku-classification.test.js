import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * _isActiveSubscription / _getPlanLabel 로직을 소스에서 추출하여 테스트.
 * cpm-copilot-manager.js 내부 IIFE 함수를 직접 import 할 수 없으므로
 * 소스 파일에서 함수 본문을 추출 → eval하여 실제 구현을 검증.
 */
describe('Copilot SKU classification (cpm-copilot-manager)', () => {
    // 소스에서 함수 추출
    const src = readFileSync(resolve(__dirname, '..', 'cpm-copilot-manager.js'), 'utf-8');

    function extractFn(name) {
        // "function NAME(...) {" 패턴으로 함수 블록 추출
        const start = src.indexOf(`function ${name}(`);
        if (start === -1) throw new Error(`Function ${name} not found in source`);
        let depth = 0;
        let foundOpen = false;
        let end = start;
        for (let i = start; i < src.length; i++) {
            if (src[i] === '{') { depth++; foundOpen = true; }
            if (src[i] === '}') { depth--; }
            if (foundOpen && depth === 0) { end = i + 1; break; }
        }
        return src.slice(start, end);
    }

     
    const _isActiveSubscription = new Function(extractFn('_isActiveSubscription') + '\nreturn _isActiveSubscription;')();
    const _getPlanLabel = new Function(extractFn('_getPlanLabel') + '\nreturn _getPlanLabel;')();

    describe('_isActiveSubscription', () => {
        // ── Pro / Pro+ / Business / Enterprise → true ──
        const activeSkus = [
            'copilot_for_individuals_pro_subscriber',
            'copilot_pro',
            'copilot_pro_subscriber',
            'pro_monthly',
            'copilot_pro_plus',
            'plus_monthly_subscriber_quota',
            'plus_yearly_subscriber_quota',
            'copilot_for_business_seat',
            'copilot_business',
            'copilot_enterprise',
            'copilot_for_enterprise_seat',
        ];
        for (const sku of activeSkus) {
            it(`should return true for active SKU: "${sku}"`, () => {
                expect(_isActiveSubscription(sku)).toBe(true);
            });
        }

        // ── 무료 / 비활성 / 에러 → false ──
        const inactiveSkus = [
            'copilot_for_individuals_subscriber',  // 무료/레거시 (pro 미포함)
            'monthly_subscriber',                   // pro 미포함
            'copilot_free',
            'free_subscriber',
            'community_subscriber',
            'default',
            'unknown',
            'error',
            '',
            null,
            undefined,
        ];
        for (const sku of inactiveSkus) {
            it(`should return false for inactive SKU: ${JSON.stringify(sku)}`, () => {
                expect(_isActiveSubscription(sku)).toBe(false);
            });
        }
    });

    describe('_getPlanLabel', () => {
        it('returns "Pro+" for plus SKUs', () => {
            expect(_getPlanLabel('copilot_pro_plus')).toBe('Pro+');
            expect(_getPlanLabel('plus_monthly_subscriber_quota')).toBe('Pro+');
        });
        it('returns "Pro" for pro SKUs (without plus)', () => {
            expect(_getPlanLabel('copilot_pro')).toBe('Pro');
            expect(_getPlanLabel('copilot_for_individuals_pro_subscriber')).toBe('Pro');
        });
        it('returns "Biz" for business/enterprise', () => {
            expect(_getPlanLabel('copilot_for_business_seat')).toBe('Biz');
            expect(_getPlanLabel('copilot_enterprise')).toBe('Biz');
        });
        it('returns "Individual" for individual SKUs', () => {
            expect(_getPlanLabel('copilot_for_individuals_subscriber')).toBe('Individual');
        });
        it('returns "Active" as fallback', () => {
            expect(_getPlanLabel('some_unknown_sku')).toBe('Active');
        });
    });

    describe('source file contract', () => {
        it('_isActiveSubscription uses whitelist keywords (pro/plus/business/enterprise)', () => {
            const fnBody = extractFn('_isActiveSubscription');
            // 화이트리스트 키워드가 함수 내에 있어야 함
            expect(fnBody).toContain("'pro'");
            expect(fnBody).toContain("'plus'");
            expect(fnBody).toContain("'business'");
            expect(fnBody).toContain("'enterprise'");
        });

        it('_isActiveSubscription does NOT use broad patterns like "subscriber"', () => {
            const fnBody = extractFn('_isActiveSubscription');
            // "subscriber" 단독으로 매칭하면 무료 토큰도 활성 처리됨
            expect(fnBody).not.toMatch(/includes\(['"]subscriber['"]\)/);
        });
    });
});
