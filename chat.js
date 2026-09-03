(() => {
  const messagesElement = document.getElementById('messages');
  const form = document.getElementById('message-form');
  const input = document.getElementById('message-input');
  const status = document.getElementById('chat-status');
  const currentUser = document.getElementById('current-user');
  let newestMessageId = '';

  function renderMessages(messages) {
    if (!messages.length) {
      messagesElement.innerHTML = '<p class="empty-state">No messages yet. Start the conversation.</p>';
      return;
    }
    messagesElement.replaceChildren(...messages.map((message) => {
      const item = document.createElement('article');
      item.className = 'message';
      const meta = document.createElement('div');
      meta.className = 'message-meta';
      const name = document.createElement('strong');
      name.textContent = message.username;
      const time = document.createElement('time');
      time.dateTime = message.createdAt;
      time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      meta.append(name, time);
      const text = document.createElement('p');
      text.textContent = message.text;
      item.append(meta, text);
      return item;
    }));
    if (messages.at(-1)?.id !== newestMessageId) {
      newestMessageId = messages.at(-1)?.id || '';
      messagesElement.scrollTop = messagesElement.scrollHeight;
    }
  }

  async function loadMessages() {
    const response = await fetch('/api/messages');
    if (response.status === 401) return window.location.assign('/login?next=/chat');
    if (!response.ok) throw new Error('Could not load messages.');
    renderMessages(await response.json());
  }

  async function start() {
    try {
      const meResponse = await fetch('/api/me');
      if (!meResponse.ok) return window.location.assign('/login?next=/chat');
      currentUser.textContent = `Signed in as ${(await meResponse.json()).username}`;
      await loadMessages();
      window.setInterval(() => loadMessages().catch(() => {}), 5000);
    } catch (error) {
      status.textContent = error.message;
      status.className = 'form-status is-error';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    status.textContent = '';
    const response = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const result = await response.json();
    if (!response.ok) {
      status.textContent = result.error || 'Message failed to send.';
      status.className = 'form-status is-error';
      return;
    }
    input.value = '';
    await loadMessages();
    input.focus();
  });

  document.getElementById('logout-button').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.assign('/');
  });
  start();
})();
