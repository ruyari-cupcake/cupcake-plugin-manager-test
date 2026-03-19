import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * _isActivePlan / _getPlanLabelFromUser 로직을 소스에서 추출하여 테스트.
 * /copilot_internal/user 응답의 copilot_plan, quota_snapshots, codex_agent_enabled
 * 필드로 구독 상태를 올바르게 판별하는지 검증.
 */
describe('Copilot plan classification (cpm-copilot-manager)', () => {
    const src = readFileSync(resolve(__dirname, '..', 'cpm-copilot-manager.js'), 'utf-8');

    function extractFn(name) {
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

     
    const _isActivePlan = new Function(extractFn('_isActivePlan') + '\nreturn _isActivePlan;')();
    const _getPlanLabelFromUser = new Function(extractFn('_getPlanLabelFromUser') + '\nreturn _getPlanLabelFromUser;')();

    describe('_isActivePlan', () => {
        // ── Pro+ → true ──
        it('returns true for Pro+ (codex_agent_enabled + quota_snapshots)', () => {
            expect(_isActivePlan({
                copilot_plan: 'copilot_for_individual_pro_plus',
                codex_agent_enabled: true,
                quota_snapshots: [{}],
            })).toBe(true);
        });
        it('returns true for plan containing "plus"', () => {
            expect(_isActivePlan({ copilot_plan: 'pro_plus' })).toBe(true);
        });

        // ── Pro → true ──
        it('returns true for plan containing "pro"', () => {
            expect(_isActivePlan({ copilot_plan: 'copilot_for_individual_pro' })).toBe(true);
        });
        it('returns true when quota_snapshots exists (paid plan indicator)', () => {
            expect(_isActivePlan({ copilot_plan: 'some_unrecognized_plan', quota_snapshots: [{}] })).toBe(true);
        });

        // ── Business / Enterprise → true ──
        it('returns true for business plan', () => {
            expect(_isActivePlan({ copilot_plan: 'copilot_business' })).toBe(true);
        });
        it('returns true for enterprise plan', () => {
            expect(_isActivePlan({ copilot_plan: 'copilot_enterprise' })).toBe(true);
        });

        // ── Free / inactive → false ──
        it('returns false for free plan without quota_snapshots', () => {
            expect(_isActivePlan({ copilot_plan: 'copilot_free', chat_enabled: true })).toBe(false);
        });
        it('returns false for copilot_for_individual_free', () => {
            expect(_isActivePlan({ copilot_plan: 'copilot_for_individual_free' })).toBe(false);
        });
        it('returns false when copilot_plan is empty and no quota_snapshots', () => {
            expect(_isActivePlan({ copilot_plan: '' })).toBe(false);
        });
        it('returns false for null userData', () => {
            expect(_isActivePlan(null)).toBe(false);
        });
        it('returns false for undefined userData', () => {
            expect(_isActivePlan(undefined)).toBe(false);
        });
        it('returns false for empty object', () => {
            expect(_isActivePlan({})).toBe(false);
        });
        it('returns false when plan has no keywords and no quota_snapshots', () => {
            expect(_isActivePlan({ copilot_plan: 'copilot_for_individual', chat_enabled: true })).toBe(false);
        });

        // ── Real API response patterns (from v1.7.12 user testing) ──
        it('real Pro+: codex_agent_enabled + quota_snapshots + quota_reset_date', () => {
            expect(_isActivePlan({
                copilot_plan: 'copilot_for_individual_pro_plus',
                codex_agent_enabled: true,
                quota_snapshots: [{ date: '2025-01-01' }],
                quota_reset_date: '2025-02-01',
            })).toBe(true);
        });
        it('real Pro: quota_snapshots + quota_reset_date (no codex)', () => {
            expect(_isActivePlan({
                copilot_plan: 'copilot_for_individual_pro',
                quota_snapshots: [{ date: '2025-01-01' }],
                quota_reset_date: '2025-02-01',
            })).toBe(true);
        });
        it('real Free: no quota_snapshots, no codex', () => {
            expect(_isActivePlan({
                copilot_plan: 'copilot_for_individual_free',
                chat_enabled: true,
            })).toBe(false);
        });
    });

    describe('_getPlanLabelFromUser', () => {
        it('returns "Pro+" when codex_agent_enabled is true', () => {
            expect(_getPlanLabelFromUser({ codex_agent_enabled: true, copilot_plan: 'whatever' })).toBe('Pro+');
        });
        it('returns "Pro+" for plan containing "plus"', () => {
            expect(_getPlanLabelFromUser({ copilot_plan: 'copilot_pro_plus' })).toBe('Pro+');
        });
        it('returns "Pro" for plan containing "pro" (no plus)', () => {
            expect(_getPlanLabelFromUser({ copilot_plan: 'copilot_for_individual_pro' })).toBe('Pro');
        });
        it('returns "Biz" for business', () => {
            expect(_getPlanLabelFromUser({ copilot_plan: 'copilot_business' })).toBe('Biz');
        });
        it('returns "Enterprise" for enterprise', () => {
            expect(_getPlanLabelFromUser({ copilot_plan: 'copilot_enterprise' })).toBe('Enterprise');
        });
        it('returns "Pro" when plan is generic but has quota_snapshots', () => {
            expect(_getPlanLabelFromUser({ copilot_plan: 'some_plan', quota_snapshots: [{}] })).toBe('Pro');
        });
        it('returns "" for free user', () => {
            expect(_getPlanLabelFromUser({ copilot_plan: 'copilot_free' })).toBe('');
        });
        it('returns "" for null', () => {
            expect(_getPlanLabelFromUser(null)).toBe('');
        });
    });

    describe('source file contract', () => {
        it('_checkTokenStatusCached uses /copilot_internal/user endpoint', () => {
            const fnBody = extractFn('_checkTokenStatusCached');
            expect(fnBody).toContain('copilot_internal/user');
        });

        it('_isActivePlan checks copilot_plan and quota_snapshots', () => {
            const fnBody = extractFn('_isActivePlan');
            expect(fnBody).toContain('copilot_plan');
            expect(fnBody).toContain('quota_snapshots');
        });

        it('_checkTokenStatusCached does NOT call checkTokenStatus (/v2/token)', () => {
            const fnBody = extractFn('_checkTokenStatusCached');
            expect(fnBody).not.toContain('checkTokenStatus(');
        });
    });
});
