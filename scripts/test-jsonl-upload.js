#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test Suite for JSONL Upload Endpoint
 * 
 * Uso:
 *   npm run test:jsonl
 * 
 * o manualmente:
 *   node scripts/test-jsonl-upload.js
 */

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const TEST_TIMEOUT = 30000; // 30 segundos

console.log('🧪 JSONL Upload Endpoint Test Suite');
console.log('═'.repeat(60));
console.log(`Base URL: ${BASE_URL}`);
console.log('');

// ============================================
// Test Data Generators
// ============================================

function generateJSONLData(count = 100) {
  const records = [];
  for (let i = 0; i < count; i++) {
    records.push(
      JSON.stringify({
        lat: -12.5 + (i * 0.01),
        lon: -75.5 + (i * 0.01),
        data: {
          txx: 25 + Math.random() * 10,
          hd35: Math.floor(Math.random() * 150),
          rx1day: Math.random() * 200,
          cdd: Math.floor(Math.random() * 120),
          prec: Math.random() * 500,
        },
        cell_id: `CELL_${i}`,
      })
    );
  }
  return records.join('\n');
}

function generateJSONArrayData(count = 100) {
  const records = [];
  for (let i = 0; i < count; i++) {
    records.push({
      lat: -12.5 + (i * 0.01),
      lon: -75.5 + (i * 0.01),
      data: {
        txx: 25 + Math.random() * 10,
        hd35: Math.floor(Math.random() * 150),
        rx1day: Math.random() * 200,
        cdd: Math.floor(Math.random() * 120),
        prec: Math.random() * 500,
      },
    });
  }
  return JSON.stringify(records);
}

function generateInvalidJSONL() {
  return `{"lat": -12.5, "lon": -75.5, "data": {"txx": 28.5}}
{"lat": -12.6, "lon": -75.6, "data": {"txx": invalid_json}}
{"lat": -12.7, "lon": -75.7, "data": {"txx": 29.1}}
{malformed json`;
}

function generateMissingFieldsJSONL() {
  return `{"lat": -12.5, "lon": -75.5, "data": {"txx": 28.5}}
{"lon": -75.6, "data": {"txx": 29.1}}
{"lat": -12.7, "data": {"txx": 27.5}}`;
}

// ============================================
// Test Functions
// ============================================

async function testEndpoint(name, payload, expectedStatus = 200) {
  console.log(`\n📝 Test: ${name}`);
  console.log('─'.repeat(60));

  try {
    const response = await fetch(`${BASE_URL}/api/climate-cells/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout: TEST_TIMEOUT,
    });

    const data = await response.json();
    const status = response.status;
    const isSuccess = status === expectedStatus;

    console.log(`Status: ${status} ${isSuccess ? '✅' : '❌'}`);

    if (status === 200) {
      console.log(`\n  Detected Format: ${data.phases.parse.detected_format}`);
      console.log(`  Records Parsed: ${data.phases.parse.total_records_parsed}`);
      console.log(`  Parse Errors: ${data.phases.parse.parse_errors}`);
      console.log(`  Valid Records: ${data.phases.process.valid_records}`);
      console.log(`  Invalid Records: ${data.phases.process.invalid_records}`);
      console.log(`  Total Processed: ${data.phases.upsert.total_processed}`);
      console.log(`  Duration: ${data.phases.upsert.duration_ms}ms`);
      console.log(`  Speed: ${data.phases.upsert.records_per_second.toFixed(0)} rec/sec`);
      console.log(`  Outcome: ${data.summary.successfully_processed} successful, ${data.summary.skipped_invalid} skipped`);

      if (data.phases.parse.errors?.length > 0) {
        console.log(`\n  ⚠️ Parse Errors:`);
        data.phases.parse.errors.slice(0, 3).forEach(e => {
          console.log(`    - Line ${e.line}: ${e.error}`);
        });
      }

      if (data.phases.process.validation_errors?.length > 0) {
        console.log(`\n  ⚠️ Validation Errors:`);
        data.phases.process.validation_errors.slice(0, 3).forEach(e => {
          console.log(`    - Line ${e.line}: ${e.message}`);
        });
      }

      return {
        passed: data.phases.upsert.total_processed > 0,
        data,
      };
    } else {
      console.log(`Error: ${data.error}`);
      return { passed: false, data };
    }
  } catch (error) {
    console.log(`❌ Request Failed: ${error.message}`);
    return { passed: false, error };
  }
}

// ============================================
// Test Suite
// ============================================

async function runTests() {
  const results = [];

  // Test 1: Valid JSONL with 100 records
  let result = await testEndpoint('Valid JSONL (100 records)', {
    data: generateJSONLData(100),
    format: 'auto',
  });
  results.push({ name: 'Valid JSONL', passed: result.passed });

  // Test 2: Valid JSON Array with 100 records
  result = await testEndpoint('Valid JSON Array (100 records)', {
    data: generateJSONArrayData(100),
    format: 'auto',
  });
  results.push({ name: 'Valid JSON Array', passed: result.passed });

  // Test 3: Small JSONL (10 records)
  result = await testEndpoint('Small JSONL (10 records)', {
    data: generateJSONLData(10),
    format: 'jsonl',
  });
  results.push({ name: 'Small JSONL', passed: result.passed });

  // Test 4: JSONL with JSON Array detection
  result = await testEndpoint('JSON Array with explicit format', {
    data: generateJSONArrayData(50),
    format: 'json',
  });
  results.push({ name: 'JSON Array explicit', passed: result.passed });

  // Test 5: JSONL with parsing errors (continues anyway)
  result = await testEndpoint('JSONL with parsing errors (error resilience)', {
    data: generateInvalidJSONL(),
    format: 'jsonl',
  });
  results.push({
    name: 'Error resilience',
    passed: result.data?.phases?.parse?.total_records_parsed > 0,
  });

  // Test 6: JSONL with missing fields (skips invalid)
  result = await testEndpoint('JSONL with missing fields', {
    data: generateMissingFieldsJSONL(),
    format: 'jsonl',
  });
  results.push({
    name: 'Missing fields handling',
    passed:
      result.data?.phases?.process?.invalid_records > 0 &&
      result.data?.phases?.upsert?.total_processed >= 0,
  });

  // Test 7: Empty data error
  result = await testEndpoint(
    'Missing data field (error handling)',
    {},
    500
  );
  results.push({
    name: 'Missing data error',
    passed: !result.passed || result.data?.error !== undefined,
  });

  // Test 8: Non-string data error
  result = await testEndpoint('Non-string data (error handling)', {
    data: [{ lat: 10, lon: 20 }],
    format: 'auto',
  });
  results.push({
    name: 'Non-string data error',
    passed: result.data?.error !== undefined,
  });

  // Test 9: Large JSONL (5000 records)
  result = await testEndpoint('Large JSONL (5000 records)', {
    data: generateJSONLData(5000),
    format: 'auto',
  });
  results.push({ name: 'Large JSONL', passed: result.passed });

  // Test 10: Auto-format detection (JSONL array)
  result = await testEndpoint(
    'Auto-format detection (JSONL with leading {)',
    {
      data: generateJSONLData(50),
      format: 'auto',
    }
  );
  results.push({
    name: 'Auto-format detection JSONL',
    passed: result.data?.phases?.parse?.detected_format === 'jsonl',
  });

  // Test 11: Auto-format detection (JSON array)
  result = await testEndpoint(
    'Auto-format detection (JSON with leading [)',
    {
      data: generateJSONArrayData(50),
      format: 'auto',
    }
  );
  results.push({
    name: 'Auto-format detection JSON',
    passed: result.data?.phases?.parse?.detected_format === 'json',
  });

  // ============================================
  // Summary
  // ============================================

  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📊 Test Summary');
  console.log('═'.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const test of results) {
    const icon = test.passed ? '✅' : '❌';
    console.log(`${icon} ${test.name}`);
    if (test.passed) passed++;
    else failed++;
  }

  console.log('');
  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log(`\n⚠️ ${failed} test(s) failed`);
    process.exit(1);
  }
}

// ============================================
// Main
// ============================================

console.log('🚀 Starting tests...\n');

// Verificar que el servidor está accesible
fetch(`${BASE_URL}/api/climate-cells/status`)
  .then(() => {
    console.log('✅ Server is accessible\n');
    runTests();
  })
  .catch((error) => {
    console.error(`❌ Cannot reach server at ${BASE_URL}`);
    console.error(`Error: ${error.message}`);
    console.error('\n💡 Tip: Make sure the server is running with: npm run server');
    process.exit(1);
  });
