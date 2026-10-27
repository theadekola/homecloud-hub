'use strict';

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#primary-navigation');

function setMenuOpen(open) {
  if (!menuButton || !navigation) return;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  navigation.classList.toggle('is-open', open);
}

if (menuButton && navigation) {
  menuButton.addEventListener('click', () => {
    setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  navigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      menuButton.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!menuButton.contains(event.target) && !navigation.contains(event.target)) {
      setMenuOpen(false);
    }
  });
  window.matchMedia('(min-width: 721px)').addEventListener('change', (event) => {
    if (event.matches) setMenuOpen(false);
  });
}

const installCommands = [
  'sudo apt-get update',
  'sudo apt-get install -y curl',
  'curl -fsSL https://raw.githubusercontent.com/theadekola/i-clusters/main/install.sh -o /tmp/iclusters-install.sh',
  'less /tmp/iclusters-install.sh',
  'sudo bash /tmp/iclusters-install.sh'
].join('\n');

const copyButton = document.querySelector('[data-copy-install]');
if (copyButton) {
  const label = copyButton.querySelector('span');
  let resetTimer;
  copyButton.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard || !window.isSecureContext) {
        throw new Error('Clipboard requires a secure context');
      }
      await navigator.clipboard.writeText(installCommands);
      label.textContent = 'Copied!';
      copyButton.setAttribute('aria-label', 'Installation commands copied');
    } catch {
      label.textContent = 'Select commands above';
      copyButton.setAttribute('aria-label', 'Select and copy installation commands above');
    }
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      label.textContent = 'Copy commands';
      copyButton.setAttribute('aria-label', 'Copy installation commands');
    }, 2500);
  });
}

const year = document.querySelector('#year');
if (year) year.textContent = String(new Date().getFullYear());
