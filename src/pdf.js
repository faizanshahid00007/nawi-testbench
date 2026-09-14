'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const run = promisify(execFile);

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium'
].filter(Boolean);

async function findBrowser() {
  for (const c of CANDIDATES) {
    try {
      await fs.access(c);
      return c;
    } catch { /* keep looking */ }
  }
  return null;
}

async function fromHtml(html) {
  const browser = await findBrowser();
  if (!browser) {
    const err = new Error('no Chromium-based browser available for PDF rendering');
    err.code = 'NO_BROWSER';
    throw err;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nawi-'));
  const src = path.join(dir, 'report.html');
  const out = path.join(dir, 'report.pdf');
  try {
    await fs.writeFile(src, html, 'utf8');
    await run(browser, [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--no-pdf-header-footer',
      '--virtual-time-budget=4000',
      `--print-to-pdf=${out}`,
      `file://${src}`
    ], { timeout: 30000 });
    return await fs.readFile(out);
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { fromHtml, findBrowser };
