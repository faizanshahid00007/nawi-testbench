'use strict';
const form = document.getElementById('form-login');
const message = document.getElementById('login-msg');
document.querySelectorAll('[data-u]').forEach(button => button.addEventListener('click', () => {
  form.elements.username.value = button.dataset.u;
  form.elements.password.value = `${button.dataset.u}123`;
  document.querySelectorAll('[data-u]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  message.textContent = '';
  document.getElementById('submit-login').focus();
}));
document.getElementById('show-password').addEventListener('click', event => {
  const visible = form.elements.password.type === 'password';
  form.elements.password.type = visible ? 'text' : 'password';
  event.currentTarget.textContent = visible ? 'Hide' : 'Show';
  event.currentTarget.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  event.currentTarget.setAttribute('aria-pressed', String(visible));
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('submit-login');
  button.disabled = true; message.textContent = 'Signing in…'; message.style.color = 'var(--ink-2)';
  try {
    const res = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(new FormData(form)))});
    if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'Sign in failed. Please try again.'); }
    location.href = '/app' + location.hash;
  } catch(error) {
    message.textContent = error instanceof TypeError ? 'Unable to connect. Check your connection and try again.' : error.message;
    message.style.color = 'var(--fail)'; button.disabled = false;
  }
});
