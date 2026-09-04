const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;
const supabaseUrl = process.env.SUPABASE_URL || 'https://pgmqgkbqjcgwqinzxdvi.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'missing-supabase-key';
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://blade-samurai.vercel.app';
const sessionSecret = process.env.SESSION_SECRET || supabaseKey;
const profileUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (request, file, callback) => callback(null, file.mimetype.startsWith('image/'))
});

function databaseResult(result) {
	if (result.error) throw result.error;
	return result.data;
}

async function findUserById(userId) {
	const result = await supabase.from('users').select('"user-id", username, verified, admin, developer').eq('user-id', userId).single();
	const user = databaseResult(result);
	const optional = await supabase.from('users').select('profile_image, last_seen').eq('user-id', userId).single();
	return optional.error ? user : { ...user, ...optional.data };
}

function getSessionUser(request) {
	const cookieToken = request.headers.cookie?.match(/(?:^|; )session=([^;]+)/)?.[1];
	const bearerToken = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : null;
	const token = bearerToken || cookieToken;
	if (!token) return null;
	const [encodedUserId, expires, signature] = token.split('.');
	if (!encodedUserId || !expires || !signature || Number(expires) < Date.now()) return null;
	const payload = `${encodedUserId}.${expires}`;
	const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
	if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
	return Buffer.from(encodedUserId, 'base64url').toString('utf8');
}

async function attachUser(request, response, next) {
	const userId = getSessionUser(request);
	if (!userId) return response.status(401).json({ error: 'Please sign in first.' });
	try {
		request.user = await findUserById(userId);
		await supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('user-id', userId);
		next();
	} catch (error) {
		console.error('Authentication lookup failed:', error.message);
		response.status(500).json({ error: 'Could not load your account. Run supabase.sql in Supabase SQL Editor, then redeploy Render.' });
	}
}

function requireAdmin(request, response, next) {
	if (!request.user.admin) return response.status(403).json({ error: 'Admin access required.' });
	next();
}

function pageRoute(page) {
	return (request, response) => response.sendFile(path.join(__dirname, page));
}

app.use(express.json({ limit: '10kb' }));
app.use((request, response, next) => {
	if (request.headers.origin === frontendOrigin) {
		response.setHeader('Access-Control-Allow-Origin', frontendOrigin);
		response.setHeader('Access-Control-Allow-Credentials', 'true');
		response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
	}
	if (request.method === 'OPTIONS') return response.sendStatus(204);
	next();
});

app.get('/', pageRoute('index.html'));
app.get('/login', pageRoute('login.html'));
app.get('/signup', pageRoute('signup.html'));
app.get('/chat', (request, response) => {
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
	const email = String(request.body.email || '').trim().toLowerCase();
	const password = String(request.body.password || '');
	if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
		return response.status(400).json({ error: 'Username must be 3-20 letters, numbers, or underscores.' });
	}
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return response.status(400).json({ error: 'Please enter a valid email address.' });
	}
	if (password.length < 8) return response.status(400).json({ error: 'Password must be at least 8 characters.' });

	const existing = databaseResult(await supabase.from('users').select('"user-id"').ilike('username', username));
	if (existing.length) {
		return response.status(409).json({ error: 'That username is already taken.' });
	}
	const existingEmail = databaseResult(await supabase.from('users').select('"user-id"').ilike('email', email));
	if (existingEmail.length) {
		return response.status(409).json({ error: 'That email is already registered.' });
	}
	const user = databaseResult(await supabase.from('users').insert({ username, email, password, verified: false, admin: false, developer: false }).select('"user-id", username').single());
	const token = createSession(response, user['user-id']);
	response.status(201).json({ username: user.username, token });
});

app.post('/api/login', async (request, response) => {
	const email = String(request.body.email || '').trim().toLowerCase();
	const password = String(request.body.password || '');
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return response.status(400).json({ error: 'Please enter a valid email address.' });
	}
	const userResult = await supabase.from('users').select('"user-id", username, password').ilike('email', email).maybeSingle();
	if (userResult.error) return response.status(500).json({ error: 'Could not sign in right now.' });
	const user = userResult.data;
	if (!user || user.password !== password) {
		return response.status(401).json({ error: 'Incorrect email or password.' });
	}
	const token = createSession(response, user['user-id']);
	response.json({ username: user.username, token });
});

function createSession(response, userId) {
	const encodedUserId = Buffer.from(String(userId)).toString('base64url');
	const expires = Date.now() + 604800000;
	const payload = `${encodedUserId}.${expires}`;
	const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
	const token = `${payload}.${signature}`;
	response.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=${process.env.NODE_ENV === 'production' ? 'None; Secure' : 'Lax'}; Path=/; Max-Age=604800`);
	return token;
}

app.post('/api/logout', (request, response) => {
	response.setHeader('Set-Cookie', `session=; HttpOnly; SameSite=${process.env.NODE_ENV === 'production' ? 'None; Secure' : 'Lax'}; Path=/; Max-Age=0`);
	response.status(204).end();
});

app.get('/api/me', attachUser, (request, response) => response.json(request.user));

app.get('/api/messages', attachUser, async (request, response) => {
	try {
		const messages = databaseResult(await supabase.from('chat').select('message_id, created_at, content, "user-id", badges').order('created_at', { ascending: true }).limit(request.user.admin ? 1000 : 100));
		const userIds = [...new Set(messages.map((message) => message['user-id']).filter(Boolean))];
		const users = userIds.length ? databaseResult(await supabase.from('users').select('"user-id", username, verified, admin, developer').in('user-id', userIds)) : [];
		for (const user of users) {
			const optional = await supabase.from('users').select('profile_image').eq('user-id', user['user-id']).single();
			if (!optional.error) Object.assign(user, optional.data);
		}
		const userMap = new Map(users.map((user) => [user['user-id'], user]));
		response.json(messages.map((message) => {
			const mentions = message.badges?.mentions || [];
			const mentioned = mentions.includes(request.user.username.toLowerCase()) || mentions.includes('everyone') || (request.user.admin && mentions.includes('admins')) || (mentions.includes('here') && users.some((user) => user['user-id'] === request.user['user-id']));
			return { ...message, username: userMap.get(message['user-id'])?.username || 'Deleted user', profile: userMap.get(message['user-id']) || null, mentioned };
		}));
	} catch (error) {
		response.status(500).json({ error: 'Could not load messages.' });
	}
});

app.post('/api/messages', attachUser, async (request, response) => {
	const text = String(request.body.text || '').trim();
	if (!text || text.length > 500) return response.status(400).json({ error: 'Message must be between 1 and 500 characters.' });
	try {
		const mentions = [...text.matchAll(/@(everyone|admins|here|[a-zA-Z0-9_]{3,20})/gi)].map((match) => match[1].toLowerCase());
		if (mentions.some((mention) => ['everyone', 'admins', 'here'].includes(mention)) && !request.user.admin) return response.status(403).json({ error: 'Only admins can use group mentions.' });
		const message = databaseResult(await supabase.from('chat').insert({ content: text, 'user-id': request.user['user-id'], badges: { mentions } }).select('message_id, created_at, content, "user-id", badges').single());
		response.status(201).json({ ...message, username: request.user.username, profile: request.user, mentions });
	} catch (error) {
		response.status(500).json({ error: 'Could not send message.' });
	}
});

app.patch('/api/profile', attachUser, profileUpload.single('profileImage'), async (request, response) => {
	if (!request.file) return response.status(400).json({ error: 'Please choose an image to upload.' });
	const filePath = `${request.user['user-id']}/${crypto.randomBytes(16).toString('hex')}${path.extname(request.file.originalname).toLowerCase()}`;
	try {
		const upload = await supabase.storage.from('profiles').upload(filePath, request.file.buffer, {
			contentType: request.file.mimetype,
			upsert: false
		});
		databaseResult(upload);
		const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
		const profileImage = data.publicUrl;
		const update = await supabase.from('users').update({ profile_image: profileImage }).eq('user-id', request.user['user-id']);
		databaseResult(update);
		response.json({ ...request.user, profile_image: profileImage });
	} catch (error) {
		console.error('Profile image update failed:', error.message);
		const missingProfileColumn = error.code === '42703' || error.message?.includes('profile_image');
		const message = missingProfileColumn ? 'Profile image storage is not configured. Run supabase.sql in Supabase, then redeploy.' : 'Could not update your profile.';
		response.status(500).json({ error: message, code: error.code || 'PROFILE_UPDATE_FAILED' });
	}
});

app.get('/api/admin/users', attachUser, requireAdmin, async (request, response) => {
	try { response.json(databaseResult(await supabase.from('users').select('"user-id", created_at, username, verified, admin, developer').order('created_at', { ascending: false }))); }
	catch (error) { response.status(500).json({ error: 'Could not load accounts.' }); }
});

app.patch('/api/admin/users/:id', attachUser, requireAdmin, async (request, response) => {
	const changes = {};
	for (const field of ['verified', 'admin', 'developer']) if (typeof request.body[field] === 'boolean') changes[field] = request.body[field];
	try { response.json(databaseResult(await supabase.from('users').update(changes).eq('user-id', request.params.id).select('"user-id", username, verified, admin, developer, profile_image').single())); }
	catch (error) { response.status(500).json({ error: 'Could not update account.' }); }
});

app.delete('/api/admin/users/:id', attachUser, requireAdmin, async (request, response) => {
	if (request.params.id === String(request.user['user-id'])) return response.status(400).json({ error: 'You cannot delete your own account.' });
	try {
		 databaseResult(await supabase.from('chat').delete().eq('user-id', request.params.id));
		databaseResult(await supabase.from('users').delete().eq('user-id', request.params.id));
		response.status(204).end();
	} catch (error) { response.status(500).json({ error: 'Could not delete account.' }); }
});

app.delete('/api/admin/messages/:id', attachUser, requireAdmin, async (request, response) => {
	try { databaseResult(await supabase.from('chat').delete().eq('message_id', request.params.id)); response.status(204).end(); }
	catch (error) { response.status(500).json({ error: 'Could not delete message.' }); }
});

app.use((error, request, response, next) => {
	if (!(error instanceof multer.MulterError) && request.path !== '/api/profile') return next(error);
	const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image must be smaller than 5 MB.' : 'Could not upload that image.';
	console.error('Profile upload failed:', error.message);
	response.status(400).json({ error: message });
});

if (require.main === module) {
	app.listen(port, () => console.log(`Blade Samurai server listening on port ${port}`));
}

module.exports = app;
