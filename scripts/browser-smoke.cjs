'use strict';
// Run against a disposable, seeded server. Password tests restore the sample password.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
const base = process.env.NAWI_TEST_URL || 'http://localhost:4180';
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors = [];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    await page.locator('#lab-verdict').filter({hasText:'POINT PASSES'}).waitFor();
    await page.locator('[data-point="3"]').click();
    assert.match(await page.locator('#lab-verdict').textContent(), /OUTSIDE LIMIT/);
    assert.equal(await page.locator('#lab-error').textContent(), '+10 g');
    await page.goto(base+'/login');
    await page.locator('[data-u="viewer"]').click();
    await page.locator('#show-password').click();assert.equal(await page.locator('#password').getAttribute('type'),'text');
    await page.locator('#submit-login').click();await page.waitForURL('**/app',{waitUntil:'domcontentloaded'});
    await page.locator('.metric-value').first().waitFor();
    assert.equal(await page.locator('[data-view="new"]').isVisible(),false);
    await page.locator('[data-view="tests"]').click();await page.locator('#sessions-table [data-open]').first().waitFor();
    await page.locator('#filters select[name="status"]').selectOption('approved');
    await page.locator('#sessions-table .list-note').filter({hasText:'1 test'}).waitFor();
    const downloadEvent = page.waitForEvent('download');await page.locator('#export-register').click();
    const download = await downloadEvent;const csv = await fs.readFile(await download.path(),'utf8');
    assert.match(csv, /NAWI\/2026\/0002/);assert.doesNotMatch(csv,/NAWI\/2026\/0001/);
    await page.locator('#sessions-table [data-open]').first().focus();await page.keyboard.press('Enter');await page.locator('.session-head').waitFor();
    for(const ext of ['html','docx','pdf','json']) {
      const response = await page.request.get(base+`/api/sessions/2/report.${ext}`);
      assert.equal(response.status(),200,`${ext} export`);
      const buffer=await response.body();assert.ok(buffer.length>100,`${ext} has content`);
      if(ext==='pdf')assert.equal(buffer.subarray(0,4).toString(),'%PDF');
      if(ext==='docx')assert.equal(buffer.subarray(0,2).toString(),'PK');
    }
    await page.locator('[data-view="account"]').click();
    await page.locator('#current-password').fill('viewer123');await page.locator('#new-password').fill('temporary-test-password');await page.locator('#confirm-password').fill('different-password');
    await page.locator('#form-password button').click();assert.match(await page.locator('#password-msg').textContent(),/do not match/);
    await page.locator('#confirm-password').fill('temporary-test-password');await page.locator('#form-password button').click();await page.locator('#password-msg').filter({hasText:'has been updated'}).waitFor();
    const login = await page.request.post(base+'/api/login',{data:{username:'viewer',password:'temporary-test-password'}});assert.equal(login.status(),200);
    const restore = await page.request.post(base+'/api/me/password',{data:{current:'temporary-test-password',password:'viewer123'}});assert.equal(restore.status(),200);
    await page.goto(base+'/demo.html');for(let i=0;i<5;i++)await page.locator('#demo-next').click();assert.equal(await page.locator('#demo-count').textContent(),'1 of 5');
    for(const route of ['/','/app','/demo.html','/standards']) {
      await page.setViewportSize({width:390,height:844});await page.goto(base+route);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No horizontal page overflow: ${route}`);
    }
    const guest = await browser.newPage();await guest.route('**/api/rulesets/oiml-r76-2006',r=>r.abort());await guest.goto(base);await guest.locator('#lab-verdict').filter({hasText:'UNAVAILABLE'}).waitFor();assert.equal(await guest.locator('[data-point="0"]').isDisabled(),true);
    await guest.goto(base+'/login');await guest.locator('[data-u="viewer"]').click();await guest.route('**/api/login',r=>r.abort());await guest.locator('#submit-login').click();await guest.locator('#login-msg').filter({hasText:'Unable to connect'}).waitFor();assert.equal(await guest.locator('#submit-login').isDisabled(),false);
    assert.deepEqual(errors,[]);console.log('PASS: calculation, login, viewer permissions, filtered CSV, report navigation, HTML/Word/PDF/JSON exports, password changes, demo guide, mobile layouts, network failure states.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
