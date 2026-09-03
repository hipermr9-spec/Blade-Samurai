(() => {
  function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = localStorage.getItem('blade-samurai-session');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(path, { ...options, credentials: 'include', headers });
  }
  const messagesElement = document.getElementById('messages');
  const form = document.getElementById('message-form');
  const input = document.getElementById('message-input');
  const status = document.getElementById('chat-status');
  const currentUser = document.getElementById('current-user');
  const profileForm = document.getElementById('profile-form');
  const profileImage = document.getElementById('profile-image');
  const profileStatus = document.getElementById('profile-status');
  const adminPanel = document.getElementById('admin-panel');
  const adminUsers = document.getElementById('admin-users');
  let account;
  let newestMessageId = '';

  function badge(profile) {
    if (profile?.developer) return '<img class="badge" src="img/developer-bagde.webp" alt="Developer">';
    if (profile?.admin) return '<img class="badge" src="img/admin-badge.webp" alt="Admin">';
    if (profile?.verified) return '<img class="badge" src="img/verified-badge.webp" alt="Verified">';
    return '';
  }

  function validImageUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

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
      const avatarUrl = validImageUrl(message.profile?.profile_image);
      if (avatarUrl) {
        const avatar = document.createElement('img');
        avatar.src = avatarUrl;
        avatar.alt = '';
        avatar.addEventListener('error', () => avatar.remove(), { once: true });
        meta.append(avatar);
      }
      const name = document.createElement('strong');
      name.textContent = message.username;
      meta.append(name);
      name.insertAdjacentHTML('afterend', badge(message.profile));
      const time = document.createElement('time');
      time.dateTime = message.created_at;
      time.textContent = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      meta.append(name, time);
      const text = document.createElement('p');
      text.textContent = message.content;
      item.append(meta, text);
      if (newestMessageId && message.mentioned && message.message_id !== newestMessageId && message['user-id'] !== account['user-id'] && 'Notification' in window) {
        if (Notification.permission === 'granted') new Notification(`Mention from ${message.username}`, { body: message.content });
      }
      if (account.admin) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button'; deleteButton.className = 'text-button'; deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', async () => { await apiFetch(`/api/admin/messages/${message.message_id}`, { method: 'DELETE' }); loadMessages(); });
        meta.append(deleteButton);
      }
      return item;
    }));
    if (messages.at(-1)?.message_id !== newestMessageId) {
      newestMessageId = messages.at(-1)?.message_id || '';
      messagesElement.scrollTop = messagesElement.scrollHeight;
    }
  }

  async function loadMessages() {
    const response = await apiFetch('/api/messages');
    if (response.status === 401) return window.location.assign('/login?next=/chat');
    if (!response.ok) throw new Error('Could not load messages.');
    renderMessages(await response.json());
  }

  async function saveProfile(event) {
    event.preventDefault();
    profileStatus.textContent = 'Saving...';
    const response = await apiFetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileImage: profileImage.value }) });
    const result = await response.json();
    profileStatus.textContent = response.ok ? 'Profile saved.' : result.error;
    if (response.ok) account = { ...account, ...result };
  }

  async function loadAdminUsers() {
    const response = await apiFetch('/api/admin/users');
    if (!response.ok) return;
    const users = await response.json();
    adminUsers.replaceChildren(...users.map((user) => {
      const row = document.createElement('div');
      row.className = 'admin-user';
      const avatarUrl = validImageUrl(user.profile_image);
      if (avatarUrl) { const image = document.createElement('img'); image.src = avatarUrl; image.alt = ''; image.addEventListener('error', () => image.remove(), { once: true }); row.append(image); }
      const name = document.createElement('span');
      name.className = 'admin-user-name';
      name.textContent = `${user.username}${user.admin ? ' (admin)' : ''}`;
      row.append(name);
      const actions = document.createElement('div');
      actions.className = 'admin-actions';
      for (const [field, label] of [['verified', 'Verify'], ['admin', 'Admin'], ['developer', 'Developer']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${user[field] ? 'Remove' : 'Give'} ${label}`;
        button.addEventListener('click', async () => { await apiFetch(`/api/admin/users/${user['user-id']}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: !user[field] }) }); loadAdminUsers(); });
        actions.append(button);
      }
      if (String(user['user-id']) !== String(account['user-id'])) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'danger'; button.textContent = 'Delete';
        button.addEventListener('click', async () => { if (window.confirm(`Delete ${user.username}?`)) { await apiFetch(`/api/admin/users/${user['user-id']}`, { method: 'DELETE' }); loadAdminUsers(); } });
        actions.append(button);
      }
      row.append(actions);
      return row;
    }));
  }

  async function start() {
    try {
      const meResponse = await apiFetch('/api/me');
      if (meResponse.status === 401) return window.location.assign('/login?next=/chat');
      if (!meResponse.ok) throw new Error((await meResponse.json()).error || 'The account service is unavailable.');
      account = await meResponse.json();
      currentUser.textContent = `Signed in as ${account.username}${account.admin ? ' · Admin' : ''}`;
      profileImage.value = account.profile_image || '';
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      if (account.admin) { adminPanel.hidden = false; loadAdminUsers(); }
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
    const response = await apiFetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
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
  profileForm.addEventListener('submit', saveProfile);
  document.getElementById('refresh-admin').addEventListener('click', loadAdminUsers);

  document.getElementById('logout-button').addEventListener('click', async () => {
    localStorage.removeItem('blade-samurai-session');
    await apiFetch('/api/logout', { method: 'POST' });
    window.location.assign('/');
  });
  start();
})();
