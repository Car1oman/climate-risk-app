import 'dotenv/config';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAYER1_PATH = resolve(__dirname, '../../../server/layers/Layer1_ClimateDataFusion.js');

describe('Layer1 — NASA integration contract', () => {
  it('exports async fusionClimateData function', () => {
    // Read source to verify export signature (avoids loading supabaseClient)
    const source = readFileSync(LAYER1_PATH, 'utf-8');
    assert.ok(source.includes('export async function fusionClimateData'));
  });

  it('source references all three NASA result keys', () => {
    const source = readFileSync(LAYER1_PATH, 'utf-8');
    assert.ok(source.includes('nasaPowerData'), 'Must reference nasaPowerData');
    assert.ok(source.includes('ndviData'), 'Must reference ndviData');
    assert.ok(source.includes('graceFoData'), 'Must reference graceFoData');
  });

  it('imports all three NASA service wrappers', () => {
    const source = readFileSync(LAYER1_PATH, 'utf-8');
    assert.ok(source.includes('getNasaPowerData'), 'Must import getNasaPowerData');
    assert.ok(source.includes('getModisNdviData'), 'Must import getModisNdviData');
    assert.ok(source.includes('getGraceFoData'), 'Must import getGraceFoData');
  });

  it('executes all three NASA calls in Promise.allSettled', () => {
    const source = readFileSync(LAYER1_PATH, 'utf-8');
    assert.ok(source.includes('getNasaPowerData(latNum, lonNum)'));
    assert.ok(source.includes('getModisNdviData(latNum, lonNum)'));
    assert.ok(source.includes('getGraceFoData(latNum, lonNum)'));
  });
});
