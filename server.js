const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const dataDirectory = path.join(__dirname, 'data');
const dataFile = path.join(dataDirectory, 'chat.json');
const sessions = new Map();

function loadData() {
	if (!fs.existsSync(dataDirectory)) fs.mkdirSync(dataDirectory, { recursive: true });
	if (!fs.existsSync(dataFile)) {
		fs.writeFileSync(dataFile, JSON.stringify({ users: [], messages: [] }, null, 2));
	}
	return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function saveData(data) {
	fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getSessionUser(request) {
	const token = request.headers.cookie?.match(/(?:^|; )session=([^;]+)/)?.[1];
	const userId = token && sessions.get(token);
	if (!userId) return null;
	const user = loadData().users.find((candidate) => candidate.id === userId);
	return user ? { id: user.id, username: user.username } : null;
}

function requireUser(request, response, next) {
	const user = getSessionUser(request);
	if (!user) return response.status(401).json({ error: 'Please sign in first.' });
	request.user = user;
	next();
}

function pageRoute(page) {
	return (request, response) => response.sendFile(path.join(__dirname, page));
}

app.use(express.json({ limit: '10kb' }));

app.get('/', pageRoute('index.html'));
app.get('/login', pageRoute('login.html'));
app.get('/signup', pageRoute('signup.html'));
app.get('/chat', (request, response) => {
	if (!getSessionUser(request)) return response.redirect('/login?next=/chat');
	response.sendFile(path.join(__dirname, 'chat.html'));
});

app.get(['/index.html', '/login.html', '/signup.html', '/chat.html'], (request, response) => {
	const cleanPath = request.path.replace('.html', '') || '/';
	response.redirect(301, cleanPath);
});

app.use('/data', (request, response) => response.sendStatus(404));
app.use(express.static(__dirname, { extensions: ['html'] }));

app.post('/api/signup', async (request, response) => {
	const username = String(request.body.username || '').trim();
	const password = String(request.body.password || '');
	if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
		return response.status(400).json({ error: 'Username must be 3-20 letters, numbers, or underscores.' });
	}
	if (password.length < 8) return response.status(400).json({ error: 'Password must be at least 8 characters.' });

	const data = loadData();
	if (data.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
		return response.status(409).json({ error: 'That username is already taken.' });
	}
	const user = { id: crypto.randomUUID(), username, password: await bcrypt.hash(password, 12) };
	data.users.push(user);
	saveData(data);
	createSession(response, user.id);
	response.status(201).json({ username: user.username });
});

app.post('/api/login', async (request, response) => {
	const username = String(request.body.username || '').trim();
	const password = String(request.body.password || '');
	const user = loadData().users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());
	if (!user || !(await bcrypt.compare(password, user.password))) {
		return response.status(401).json({ error: 'Incorrect username or password.' });
	}
	createSession(response, user.id);
	response.json({ username: user.username });
});

function createSession(response, userId) {
	const token = crypto.randomBytes(32).toString('hex');
	sessions.set(token, userId);
	response.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

app.post('/api/logout', (request, response) => {
	const token = request.headers.cookie?.match(/(?:^|; )session=([^;]+)/)?.[1];
	if (token) sessions.delete(token);
	response.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
	response.status(204).end();
});

app.get('/api/me', requireUser, (request, response) => response.json(request.user));

app.get('/api/messages', requireUser, (request, response) => {
	const messages = loadData().messages.slice(-100);
	response.json(messages);
});

app.post('/api/messages', requireUser, (request, response) => {
	const text = String(request.body.text || '').trim();
	if (!text || text.length > 500) return response.status(400).json({ error: 'Message must be between 1 and 500 characters.' });
	const data = loadData();
	const message = { id: crypto.randomUUID(), username: request.user.username, text, createdAt: new Date().toISOString() };
	data.messages.push(message);
	data.messages = data.messages.slice(-500);
	saveData(data);
	response.status(201).json(message);
});

app.listen(port, () => console.log(`Blade Samurai server listening on port ${port}`));
