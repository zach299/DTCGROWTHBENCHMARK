const input = document.getElementById('apiBase');
const status = document.getElementById('status');

chrome.storage.sync.get(['apiBase'], (v) => {
  input.value = v.apiBase || 'https://dtcgrowthbenchmark.vercel.app';
});

document.getElementById('save').addEventListener('click', () => {
  const apiBase = input.value.trim().replace(/\/$/, '');
  chrome.storage.sync.set({ apiBase }, () => {
    status.textContent = 'Saved ✓';
    setTimeout(() => (status.textContent = ''), 2000);
  });
});
