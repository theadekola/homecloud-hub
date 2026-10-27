import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'styles.css'), 'utf8');
const js = readFileSync(resolve(root, 'script.js'), 'utf8');

test('marketing site ships as a standalone static page', () => {
  assert.ok(existsSync(resolve(root, 'index.html')));
  assert.ok(existsSync(resolve(root, 'styles.css')));
  assert.ok(existsSync(resolve(root, 'script.js')));
  assert.ok(existsSync(resolve(root, 'assets/iclusters-192.png')));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/script\.js"/);
  assert.doesNotMatch(html, /<script[^>]+src="https:\/\//);
  assert.match(html, /src="\.\/assets\/iclusters-192\.png"/);
});

test('all local navigation targets exist and have no duplicate IDs', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const idsSet = new Set(ids);
  assert.equal(idsSet.size, ids.length, 'all HTML ids should be unique');
  const anchors = [...html.matchAll(/\bhref="#([^"]+)"/g)].map((match) => match[1]);
  assert.ok(anchors.length > 8, 'should have substantive internal navigation');
  for (const id of anchors) assert.ok(idsSet.has(id), '#' + id + ' has a target');
});

test('the site accurately identifies the product and open-source licence', () => {
  for (const term of ['Proxmox VE', 'Docker', 'TrueNAS', 'MIT', '3.1.0-rc.3', 'release candidate']) {
    assert.ok(html.toLowerCase().includes(term.toLowerCase()), 'missing ' + term);
  }
  assert.match(html, /github\.com\/theadekola\/i-clusters\/blob\/main\/LICENSE/);
  assert.match(html, /github\.com\/theadekola\/i-clusters\/blob\/main\/docs\/acceptance-checklist\.md/);
  assert.match(html, /not live infrastructure data/i);
  assert.match(html, /isAccessibleForFree": true/);
  assert.doesNotMatch(html, /guaranteed uptime|certified secure|production ready|unlimited backup/i);
});

test('the quick-start sequence matches the documented safe installer pattern', () => {
  for (const command of [
    'sudo apt-get update',
    'sudo apt-get install -y curl',
    'curl -fsSL https://raw.githubusercontent.com/theadekola/i-clusters/main/install.sh -o /tmp/iclusters-install.sh',
    'less /tmp/iclusters-install.sh',
    'sudo bash /tmp/iclusters-install.sh'
  ]) {
    assert.ok(html.includes(command), 'displayed command missing: ' + command);
    assert.ok(js.includes(command), 'clipboard command missing: ' + command);
  }
  assert.doesNotMatch(html, /curl[^<]*\|\s*(?:sudo\s+)?(?:sh|bash)/);
});

test('responsive and keyboard-friendly navigation is implemented', () => {
  assert.match(html, /aria-controls="primary-navigation"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /class="skip-link"/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 440px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /setAttribute\('aria-expanded'/);
});

test('SEO metadata and public source links are present', () => {
  assert.match(html, /<title>i-Clusters/);
  assert.match(html, /name="description"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /rel="canonical"/);
  assert.ok(existsSync(resolve(root, 'robots.txt')));
  assert.ok(existsSync(resolve(root, 'sitemap.xml')));
});

test('no fictional reviews or tracking scripts are included', () => {
  assert.doesNotMatch(html, /testimonial|trusted by \d|customers worldwide/i);
  assert.doesNotMatch(html, /google-analytics|gtag\(|hotjar|facebook\.net/);
});
