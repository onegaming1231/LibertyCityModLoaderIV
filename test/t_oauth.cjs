// Nexus login test: a pretend Nexus login + API server checks the whole OAuth 2 / PKCE flow
//   node test/t_oauth.cjs <a game folder made by test/fixture.cjs>
const http = require('http'), crypto = require('crypto'), assert = require('assert');
const game = process.argv[2];
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (payload) => 'x.' + b64url(Buffer.from(JSON.stringify(payload))) + '.sig';
const log = [];
let challenge = '', redirect = '', issued = 0, refreshOk = true;
const codes = new Map();
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname === '/oauth/authorize') {
    const q = u.searchParams;
    assert.strictEqual(q.get('response_type'), 'code'); assert.strictEqual(q.get('client_id'), 'liberty_city_mod_loader_iv');
    assert.strictEqual(q.get('code_challenge_method'), 'S256'); assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(q.get('redirect_uri')));
    challenge = q.get('code_challenge'); redirect = q.get('redirect_uri');
    const code = 'code' + Math.random(); codes.set(code, challenge);
    log.push('authorize');
    res.writeHead(302, { Location: redirect + '/?code=' + code + '&state=' + encodeURIComponent(q.get('state')) }); res.end(); return;
  }
  if (u.pathname === '/oauth/token') {
    let body = ''; req.on('data', (d) => body += d); req.on('end', () => {
      const f = new URLSearchParams(body);
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (f.get('grant_type') === 'authorization_code') {
        const ch = codes.get(f.get('code'));
        if (!ch || b64url(crypto.createHash('sha256').update(f.get('code_verifier')).digest()) !== ch || f.get('redirect_uri') !== redirect) return send(400, { error: 'invalid_grant' });
        log.push('token');
      } else if (f.get('grant_type') === 'refresh_token') {
        if (!refreshOk || !/^refresh/.test(f.get('refresh_token'))) return send(400, { error: 'invalid_grant' });
        log.push('refresh');
      } else return send(400, { error: 'unsupported_grant_type' });
      issued++;
      // the first token is already almost expired, so the app must renew it
      const exp = Math.floor(Date.now() / 1000) + (issued === 1 ? 10 : 3600);
      send(200, { access_token: jwt({ exp, user: { username: 'AnnaEnxo', membership_roles: ['member'] }, n: issued }), refresh_token: 'refresh' + issued, token_type: 'Bearer', expires_in: 3600 });
    });
    return;
  }
  if (u.pathname === '/v1/users/validate.json') {
    const a = req.headers.authorization || '';
    const p = a.startsWith('Bearer ') ? JSON.parse(Buffer.from(a.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64')) : null;
    if (!p || req.headers.apikey) { res.writeHead(401); res.end('{}'); return; }
    log.push('api' + p.n);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ name: 'AnnaEnxo', is_premium: false })); return;
  }
  res.writeHead(404); res.end();
});
srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  process.env.LCML_TEST_OAUTH_URL = 'http://127.0.0.1:' + port + '/oauth';
  process.env.LCML_TEST_NEXUS_API = 'http://127.0.0.1:' + port + '/v1/';
  const C = require('../electron/engine/core.cjs');
  const X = require('../electron/engine/features.cjs');
  C.E.game = game;
  C.E.host.status = () => {};
  C.E.host.secret = async (op, v) => (op === 'encrypt' ? 'enc:' + Buffer.from(v).toString('base64') : Buffer.from(String(v).slice(4), 'base64').toString());
  // the "browser": opening the login page follows Nexus' redirect back to the app
  C.E.host.open = async (url) => { assert.ok(url.startsWith(process.env.LCML_TEST_OAUTH_URL + '/authorize?')); setTimeout(() => fetch(url).catch(() => {}), 50); return true; };
  try {
    // an API key saved by an older version is removed
    X.saveSettings(Object.assign(X.loadSettings(), { NexusKeyV2: 'oldsecret', NexusKey: 'older' }));
    let acc = await X.nexusAccount();
    assert.deepStrictEqual(acc, { connected: false, oldKey: true });
    assert.ok(!('NexusKeyV2' in X.loadSettings()) && !('NexusKey' in X.loadSettings()), 'old keys removed');

    acc = await X.nexusLogin();
    assert.strictEqual(acc.connected, true); assert.strictEqual(acc.name, 'AnnaEnxo');
    const saved = X.loadSettings().NexusLogin; assert.ok(saved.startsWith('enc:'), 'login stored encrypted');
    // the first token was nearly expired: the API call must have renewed it first (api2, not api1)
    assert.deepStrictEqual(log, ['authorize', 'token', 'refresh', 'api2']);

    // a refused renewal logs you out
    refreshOk = false;
    const s = X.loadSettings(); s.NexusLogin = await C.E.host.secret('encrypt', JSON.stringify({ access: jwt({ exp: 1 }), refresh: 'refresh9' })); X.saveSettings(s);
    acc = await X.nexusAccount();
    assert.strictEqual(acc.connected, false);
    assert.strictEqual(X.loadSettings().NexusLogin, '', 'logged out after invalid_grant');

    // cancel works
    refreshOk = true;
    C.E.host.open = async () => true;
    const p = X.nexusLogin(); setTimeout(() => X.nexusLoginCancel(), 100);
    await assert.rejects(p, /cancel/i);
    console.log('OAUTH TEST OK', JSON.stringify(log));
  } catch (e) { console.log('OAUTH TEST FAILED', e.stack); process.exitCode = 1; }
  srv.close();
});
