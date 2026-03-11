/**
 * Tests for router.js — _toFiniteFloat, _toFiniteInt helpers.
 */
import { describe, it, expect } from 'vitest';
import { _toFiniteFloat, _toFiniteInt } from '../src/lib/router.js';

describe('_toFiniteFloat', () => {
    it('parses valid numeric strings', () => {
        expect(_toFiniteFloat('3.14')).toBe(3.14);
        expect(_toFiniteFloat('0.7')).toBe(0.7);
        expect(_toFiniteFloat('100')).toBe(100);
    });

    it('returns undefined for empty/null/undefined', () => {
        expect(_toFiniteFloat('')).toBeUndefined();
        expect(_toFiniteFloat(null)).toBeUndefined();
        expect(_toFiniteFloat(undefined)).toBeUndefined();
    });

    it('returns undefined for NaN strings', () => {
        expect(_toFiniteFloat('abc')).toBeUndefined();
        expect(_toFiniteFloat('not-a-number')).toBeUndefined();
    });

    it('returns undefined for Infinity', () => {
        expect(_toFiniteFloat('Infinity')).toBeUndefined();
        expect(_toFiniteFloat('-Infinity')).toBeUndefined();
    });

    it('passes through valid numbers', () => {
        expect(_toFiniteFloat(42)).toBe(42);
        expect(_toFiniteFloat(0)).toBe(0);
        expect(_toFiniteFloat(-1.5)).toBe(-1.5);
    });

    it('returns undefined for NaN number', () => {
        expect(_toFiniteFloat(NaN)).toBeUndefined();
    });
});

describe('_toFiniteInt', () => {
    it('parses valid integer strings', () => {
        expect(_toFiniteInt('42')).toBe(42);
        expect(_toFiniteInt('0')).toBe(0);
        expect(_toFiniteInt('1000')).toBe(1000);
    });

    it('truncates float strings to integer', () => {
        expect(_toFiniteInt('3.9')).toBe(3);
        expect(_toFiniteInt('7.1')).toBe(7);
    });

    it('returns undefined for empty/null/undefined', () => {
        expect(_toFiniteInt('')).toBeUndefined();
        expect(_toFiniteInt(null)).toBeUndefined();
        expect(_toFiniteInt(undefined)).toBeUndefined();
    });

    it('returns undefined for NaN strings', () => {
        expect(_toFiniteInt('abc')).toBeUndefined();
    });

    it('returns undefined for Infinity', () => {
        expect(_toFiniteInt('Infinity')).toBeUndefined();
    });

    it('passes through valid integers', () => {
        expect(_toFiniteInt(42)).toBe(42);
        expect(_toFiniteInt(0)).toBe(0);
    });
});
