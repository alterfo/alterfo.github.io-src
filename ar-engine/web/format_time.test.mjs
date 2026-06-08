import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatTime } from './format_time.js';

test('0 seconds', () => assert.equal(formatTime(0), '0:00'));
test('5 seconds', () => assert.equal(formatTime(5), '0:05'));
test('65 seconds', () => assert.equal(formatTime(65), '1:05'));
test('599 seconds', () => assert.equal(formatTime(599), '9:59'));
test('3661 seconds', () => assert.equal(formatTime(3661), '1:01:01'));
test('NaN', () => assert.equal(formatTime(NaN), '0:00'));
test('negative', () => assert.equal(formatTime(-3), '0:00'));
test('Infinity', () => assert.equal(formatTime(Infinity), '0:00'));
