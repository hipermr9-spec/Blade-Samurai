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
  const profileDialog = document.getElementById('profile-dialog');
  const profileDialogContent = document.getElementById('profile-dialog-content');
  const closeProfileDialog = document.getElementById('close-profile-dialog');
  let account;
  let newestMessageId = '';
  let newestMessageCreatedAt = '';
  let oldestMessageCreatedAt = '';
  let hasOlderMessages = true;
  let loadingOlderMessages = false;

  function badge(profile) {
    const badges = [];
    if (profile?.developer) badges.push('<img class="badge" src="img/developer-badge.webp" alt="Developer">');
    if (profile?.admin) badges.push('<img class="badge" src="img/admin-badge.webp" alt="Admin">');
    if (profile?.verified) badges.push('<img class="badge" src="img/verified-badge.webp" alt="Verified">');
    return badges.join('');
  }

  function validImageUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function showProfile(profile, username) {
    profileDialogContent.replaceChildren();
    const imageUrl = validImageUrl(profile?.profile_image);
    if (imageUrl) {
      const image = document.createElement('img');
      image.className = 'profile-dialog-avatar';
      image.src = imageUrl;
      image.alt = '';
      image.addEventListener('error', () => image.remove(), { once: true });
      profileDialogContent.append(image);
    } else {
      const initials = document.createElement('div');
      initials.className = 'profile-dialog-avatar profile-dialog-placeholder';
      initials.textContent = username.slice(0, 1).toUpperCase();
      profileDialogContent.append(initials);
    }
    const name = document.createElement('h2');
    name.id = 'profile-dialog-name';
    name.textContent = username;
    profileDialogContent.append(name);
    const badges = document.createElement('div');
    badges.className = 'profile-dialog-badges';
    badges.insertAdjacentHTML('beforeend', badge(profile));
    if (!badges.children.length) {
      const detail = document.createElement('p');
      detail.textContent = 'Blade Samurai community member';
      profileDialogContent.append(detail);
    } else {
      profileDialogContent.append(badges);
    }
    profileDialog.showModal();
  }

  function createMessageElement(message) {
      const item = document.createElement('article');
      item.className = 'message';
      item.dataset.messageId = message.message_id;
      const meta = document.createElement('div');
      meta.className = 'message-meta';
      const author = document.createElement('button');
      author.className = 'message-author';
      author.type = 'button';
      author.addEventListener('click', () => showProfile(message.profile, message.username));
      const avatarUrl = validImageUrl(message.profile?.profile_image);
      if (avatarUrl) {
        const avatar = document.createElement('img');
        avatar.src = avatarUrl;
        avatar.alt = '';
        avatar.addEventListener('error', () => avatar.remove(), { once: true });
        author.append(avatar);
      }
      const name = document.createElement('strong');
      name.textContent = message.username;
      author.append(name);
      author.insertAdjacentHTML('beforeend', badge(message.profile));
      meta.append(author);
      const time = document.createElement('time');
      time.dateTime = message.created_at;
      time.textContent = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      meta.append(time);
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
  }

  function renderMessages(messages, shouldScroll = false) {
    if (!messages.length) {
      messagesElement.innerHTML = '<p class="empty-state">No messages yet. Start the conversation.</p>';
      return;
    }
    messagesElement.replaceChildren(...messages.map(createMessageElement));
    newestMessageId = messages.at(-1)?.message_id || '';
    newestMessageCreatedAt = messages.at(-1)?.created_at || '';
    oldestMessageCreatedAt = messages[0]?.created_at || '';
    if (shouldScroll) messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  async function loadMessages() {
    const response = await apiFetch('/api/messages');
    if (response.status === 401) return window.location.assign('/login?next=/chat');
    if (!response.ok) throw new Error('Could not load messages.');
    const messages = await response.json();
    hasOlderMessages = messages.length === 15;
    renderMessages(messages, true);
  }

  async function loadOlderMessages() {
    if (loadingOlderMessages || !hasOlderMessages || !oldestMessageCreatedAt) return;
    loadingOlderMessages = true;
    const previousHeight = messagesElement.scrollHeight;
    try {
      const response = await apiFetch(`/api/messages?limit=15&before=${encodeURIComponent(oldestMessageCreatedAt)}`);
      if (!response.ok) {
        status.textContent = 'Could not load older messages.';
        status.className = 'form-status is-error';
        return;
      }
      const olderMessages = await response.json();
      if (!olderMessages.length) {
        hasOlderMessages = false;
        return;
      }
      const existingMessages = [...messagesElement.querySelectorAll('.message')];
      const existingIds = new Set(existingMessages.map((element) => element.dataset.messageId));
      const messages = olderMessages.filter((message) => !existingIds.has(message.message_id));
      messagesElement.replaceChildren(...messages.map(createMessageElement), ...existingMessages);
      oldestMessageCreatedAt = messages[0]?.created_at || oldestMessageCreatedAt;
      hasOlderMessages = olderMessages.length === 15;
      messagesElement.scrollTop += messagesElement.scrollHeight - previousHeight;
    } finally {
      loadingOlderMessages = false;
    }
  }

  async function loadNewMessages() {
    if (!newestMessageCreatedAt) return loadMessages();
    const response = await apiFetch(`/api/messages?limit=100&after=${encodeURIComponent(newestMessageCreatedAt)}`);
    if (!response.ok) return;
    const newMessages = await response.json();
    if (!newMessages.length) return;
    const wasAtBottom = messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight < 24;
    const existingMessages = [...messagesElement.querySelectorAll('.message')];
    messagesElement.replaceChildren(...existingMessages, ...newMessages.map(createMessageElement));
    newestMessageId = newMessages.at(-1).message_id;
    newestMessageCreatedAt = newMessages.at(-1).created_at;
    if (wasAtBottom) messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  async function saveProfile(event) {
    event.preventDefault();
    profileStatus.textContent = 'Saving...';
    try {
      const formData = new FormData(profileForm);
      const response = await apiFetch('/api/profile', { method: 'PATCH', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save profile.');
      profileStatus.textContent = 'Profile saved.';
      account = { ...account, ...result };
      profileForm.reset();
    } catch (error) {
      profileStatus.textContent = error.message;
      profileStatus.className = 'form-status is-error';
    }
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
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      if (account.admin) { adminPanel.hidden = false; loadAdminUsers(); }
      await loadMessages();
      window.setInterval(() => loadNewMessages().catch(() => {}), 5000);
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
  messagesElement.addEventListener('scroll', () => {
    if (messagesElement.scrollTop <= 40) loadOlderMessages().catch(() => {});
  });
  document.getElementById('refresh-admin').addEventListener('click', loadAdminUsers);
  closeProfileDialog.addEventListener('click', () => profileDialog.close());
  profileDialog.addEventListener('click', (event) => {
    if (event.target === profileDialog) profileDialog.close();
  });

  document.getElementById('logout-button').addEventListener('click', async () => {
    localStorage.removeItem('blade-samurai-session');
    await apiFetch('/api/logout', { method: 'POST' });
    window.location.assign('/');
  });
  start();
})();
