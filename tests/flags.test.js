// tests/flags.test.js
//
// Covers the typed feature-flag registry (src/platform/configuration/flags.ts):
// source precedence, defaults, query parsing, and unknown-flag guards.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createFlagSet,
  resolveFlag,
  recordSource,
  searchParamSource,
} from '../src/platform/configuration/flags.ts';

const REGISTRY = {
  calculatorReact: { default: false, description: 'React calculator island' },
  demoBanner: { default: true },
};

test('falls back to the registry default when no source provides a value', () => {
  const flags = createFlagSet(REGISTRY, []);
  assert.equal(flags.isEnabled('calculatorReact'), false);
  assert.equal(flags.isEnabled('demoBanner'), true);
});

test('first source that defines a flag wins (precedence order)', () => {
  const flags = createFlagSet(REGISTRY, [
    recordSource({ calculatorReact: true }),
    recordSource({ calculatorReact: false }),
  ]);
  assert.equal(flags.isEnabled('calculatorReact'), true);
});

test('undefined from a source defers to the next, then default', () => {
  const flags = createFlagSet(REGISTRY, [
    recordSource({ calculatorReact: undefined }),
    recordSource({ demoBanner: false }),
  ]);
  assert.equal(flags.isEnabled('calculatorReact'), false); // default
  assert.equal(flags.isEnabled('demoBanner'), false); // 2nd source
});

test('searchParamSource: bare param and truthy/falsy tokens', () => {
  const src = searchParamSource('?calculatorReact&demoBanner=off');
  assert.equal(src.get('calculatorReact'), true); // bare => true
  assert.equal(src.get('demoBanner'), false);
  assert.equal(src.get('missing'), undefined);
});

test('searchParamSource: unrecognized value defers (undefined)', () => {
  const src = searchParamSource('?calculatorReact=maybe');
  assert.equal(src.get('calculatorReact'), undefined);
});

test('searchParamSource integrates as an override above defaults', () => {
  const flags = createFlagSet(REGISTRY, [searchParamSource('?calculatorReact=1')]);
  assert.equal(flags.isEnabled('calculatorReact'), true);
});

test('all() resolves every flag in the registry', () => {
  const flags = createFlagSet(REGISTRY, [recordSource({ calculatorReact: true })]);
  assert.deepEqual(flags.all(), { calculatorReact: true, demoBanner: true });
});

test('resolveFlag throws on an unknown flag name', () => {
  assert.throws(() => resolveFlag('nope', REGISTRY, []), /Unknown feature flag: nope/);
});

console.log('feature-flag tests passed');
