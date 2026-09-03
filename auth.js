(() => {
  const form = document.querySelector('form');
  const status = document.getElementById('form-status');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = 'Working...';
    status.className = 'form-status';
    const endpoint = form.id === 'signup-form' ? '/api/signup' : '/api/login';
    const body = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Something went wrong.');
      const next = new URLSearchParams(window.location.search).get('next') || '/chat';
      window.location.assign(next.startsWith('/') ? next : '/chat');
    } catch (error) {
      status.textContent = error.message;
      status.className = 'form-status is-error';
    }
  });
})();
