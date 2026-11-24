import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { androidVersionPolicy, MobileVersionController } from '../dist/mobile-version.controller.js';

test('Android policy defaults to the first supported build with no invented update address', () => {
  assert.deepEqual(androidVersionPolicy({}), { minimumBuild: 1, updateUrl: null });
  assert.deepEqual(androidVersionPolicy({ ANDROID_MINIMUM_BUILD: '12', ANDROID_UPDATE_URL: ' https://famsync.test/android ' }), { minimumBuild: 12, updateUrl: 'https://famsync.test/android' });
});

test('bad release settings fail rather than accidentally accepting every build', () => {
  for (const value of ['', '0', '-1', '01', '1.5', '1e3', '1.2.3', '2100000001', 'NaN']) assert.throws(() => androidVersionPolicy({ ANDROID_MINIMUM_BUILD: value }));
  assert.equal(androidVersionPolicy({ ANDROID_MINIMUM_BUILD: '2100000000' }).minimumBuild, 2100000000);
});

test('update destinations allow only HTTPS links without embedded credentials', () => {
  for (const value of ['javascript:alert(1)', 'market://details?id=test', 'http://test', 'https://user:password@test', 'bad']) assert.throws(() => androidVersionPolicy({ ANDROID_UPDATE_URL: value }));
  assert.equal(androidVersionPolicy({ ANDROID_UPDATE_URL: '' }).updateUrl, null);
});

test('public policy endpoint works before sign-in and prevents shared HTTP caching', async () => {
  const before = { min: process.env.ANDROID_MINIMUM_BUILD, url: process.env.ANDROID_UPDATE_URL };
  process.env.ANDROID_MINIMUM_BUILD = '12'; process.env.ANDROID_UPDATE_URL = 'https://famsync.test/android';
  class PolicyModule {}
  Module({ controllers: [MobileVersionController] })(PolicyModule);
  const app = await NestFactory.create(PolicyModule, { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(await app.getUrl() + '/api/v1/mobile/android/version');
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { minimumBuild: 12, updateUrl: 'https://famsync.test/android' });
  } finally {
    await app.close();
    for (const [name, value] of [['ANDROID_MINIMUM_BUILD', before.min], ['ANDROID_UPDATE_URL', before.url]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
