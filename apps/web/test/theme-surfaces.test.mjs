import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
const css=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const rules=name=>postcss.parse(css(name));
function lastValue(tree,selector,property){let value;tree.walkRules(rule=>{if(rule.selector===selector)rule.walkDecls(property,decl=>{value=decl.value})});return value}

test('notification overlay, unread rows and footer use palette tokens in both colour modes',()=>{
 const tree=rules('components/header-notifications.css');
 assert.equal(lastValue(tree,':root[data-preset] .header-notification-panel','background'),'var(--theme-surface)');
 assert.equal(lastValue(tree,':root[data-preset] .header-notification-panel','color'),'var(--theme-text)');
 assert.equal(lastValue(tree,':root[data-preset] .header-notification-panel','border-color'),'var(--theme-border)');
 assert.equal(lastValue(tree,':root[data-preset] :is(.header-notification-item.unread,.header-notification-item:hover)','background'),'var(--theme-highlight)');
 assert.equal(lastValue(tree,':root[data-preset] .header-notification-item.unread','border-left-color'),'var(--app-accent)');
 assert.equal(lastValue(tree,':root[data-preset] .header-notification-footer a','color'),'var(--theme-icon)');
 // Attention remains a warning or error rather than becoming a decorative accent.
 assert.equal(lastValue(tree,'.header-notification-item.critical','border-left-color'),'#ff5974');
 assert.equal(lastValue(tree,'.header-notification-item.warning','border-left-color'),'#f4b148');
 assert.equal(lastValue(tree,'.needs-attention .notification-bell-count','background'),'#b9233d');
});

test('legacy components resolve the same surface contract and light mode replaces the dark surface',()=>{
 const tree=rules('appearance.css'),selector=':root[data-preset]';
 for(const [alias,token] of Object.entries({'--surface':'--theme-surface','--text':'--theme-text','--muted':'--theme-muted','--border':'--theme-border','--input-bg':'--theme-input'}))assert.equal(lastValue(tree,selector,alias),`var(${token})`);
 assert.equal(lastValue(tree,selector,'--theme-surface'),'var(--app-theme-surface)');
 assert.match(lastValue(tree,':root[data-preset][data-theme="light"]','--theme-surface'),/var\(--app-accent\).*#fff/);
 for(const name of ['components/connections.css','components/cluster-topology.css','components/docker-updates.css','pages/settings-overview.css','styles.css'])assert.match(css(name),/var\(--theme-(?:surface|raised|input)/,name);
 assert.match(css('components/pagination.css'),/var\(--input-bg/);
 assert.match(css('appearance.css'),/recharts-default-tooltip[^}]*var\(--theme-surface\)/);
});

test('login controls use the saved palette without forcing a dark colour scheme',()=>{
 const tree=rules('iclusters-brand.css');
 assert.equal(lastValue(tree,'.login-page','color-scheme'),'inherit');
 assert.equal(lastValue(tree,'.login-page','background'),'var(--app-theme-background)');
 assert.equal(lastValue(tree,'.login-page .login-card','background'),'var(--theme-surface)');
 assert.equal(lastValue(tree,':root[data-theme] .login-page .login-card input:not([type=checkbox]):not([type=range])','background'),'var(--theme-input)');
 assert.equal(lastValue(tree,'.login-page .login-card>.btn.primary','background'),'var(--app-accent-fill)');
 assert.equal(lastValue(tree,'.login-page .login-card>.btn.primary','color'),'var(--app-accent-text)');
});
