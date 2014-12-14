var qs = require('querystring');

var test = require('tape');
var nock = require('nock');
var sequence = require('after-sequence');
var concat = require('concat-stream');
var pump = require('pump');

var reddit = require('../');

var server, user = {};
var env = process.env;

var errorMessage = function(err) {
	return err ? err.message : 'No error';
};

if(env.REDDIT_USERNAME && env.REDDIT_PASSWORD) {
	user.username = env.REDDIT_USERNAME;
	user.password = env.REDDIT_PASSWORD;
} else {
	user.username = 'test_user';
	user.password = 'test_password';

	server = nock('http://www.reddit.com')
		.get('/r/funny.json')
		.reply(200, {
			kind: 'Listing',
			data: {
				children: [{
					kind: 't3',
					data: {
						domain: 'example.com',
						subreddit: 'funny',
						url: 'http://example.com'
					}
				}]
			}
		})
		.get('/r/funny')
		.reply(200, '<h1>r/funny</h1>')
		.post('/api/login', qs.stringify({
			user: user.username,
			passwd: user.password,
			rem: true,
			api_type: 'json'
		}))
		.reply(200, {
			json: {
				errors: [],
				data: {
					need_https: false,
					modhash: 'test_modhash',
					cookie: 'test_cookie'
				}
			}
		})
		.get('/api/me.json')
		.times(2)
		.matchHeader('Cookie', 'reddit_session=test_cookie;')
		.matchHeader('X-Modhash', 'test_modhash')
		.reply(200, {
			kind: 't2',
			data: {
				id: 'test_id',
				name: user.username,
				modhash: 'test_modhash',
				link_karma: 0,
				comment_karma: 0,
				has_mail: false,
				is_mod: false,
				is_gold: false
			}
		}, {
			'X-Ratelimit-Remaining': '300',
			'X-Ratelimit-Used': '1',
			'X-Ratelimit-Reset': '600',
		})
		.post('/api/new_captcha')
		.reply(200, function() {
			return new Buffer(32);
		})
		.get('/api/no_route')
		.reply(404)
		.post('/api/login', qs.stringify({
			user: user.username,
			passwd: 'test_invalid_password',
			rem: true,
			api_type: 'json'
		}))
		.reply(200, {
			json: {
				errors: [
					['WRONG_PASSWORD', 'wrong password', 'passwd']
				]
			}
		});
}

test('list threads as json', function(t) {
	reddit.get('/r/funny.json', function(err, response) {
		t.notOk(err, errorMessage(err));

		t.ok(response.data);
		t.ok(Array.isArray(response.data.children));
		t.ok(response.data.children.length > 0);

		t.end();
	});
});

test('list threads as plain text', function(t) {
	reddit.get('/r/funny', function(err, response) {
		t.notOk(err, errorMessage(err));
		t.ok(typeof response === 'string');

		t.end();
	});
});

test('authorized requests', function(t) {
	var authorized;
	var next = sequence(function() {
		t.end();
	});

	next(function(callback) {
		reddit({
			username: user.username,
			password: user.password
		}, function(err, api) {
			authorized = api;

			t.notOk(err, errorMessage(err));

			t.ok(authorized.session);
			t.ok(authorized.session.cookie);
			t.ok(authorized.session.modhash);
			t.equal(authorized.session.username, user.username);

			callback();
		});
	});

	next(function(callback) {
		authorized.get('/api/me.json', function(err, response) {
			t.notOk(err, errorMessage(err));

			t.ok(response.data);
			t.ok(response.data.modhash);
			t.equal(response.data.name, user.username);

			callback();
		});
	});

	next(function(callback) {
		var api = reddit({
			username: authorized.session.username,
			cookie: authorized.session.cookie,
			modhash: authorized.session.modhash
		});

		authorized = api;

		authorized.get('/api/me.json', function(err, response) {
			t.notOk(err, errorMessage(err));

			t.ok(response.data);
			t.ok(response.data.modhash);
			t.equal(response.data.name, user.username);

			callback();
		});
	});
});

test('stream captcha', function(t) {
	var stream = reddit.post('/api/new_captcha');
	var sink = concat(function(data) {
		t.ok(data.length > 0);
	});

	pump(stream, sink, function(err) {
		t.notOk(err, errorMessage(err));
		t.end();
	});
});

test('bad status code', function(t) {
	reddit.get('/api/no_route', function(err) {
		t.ok(err, errorMessage(err));
		t.end();
	});
});

if(server) {
	// The real API blocks if we do too many invalid login requests
	test('invalid login details', function(t) {
		reddit({
			username: user.username,
			password: 'test_invalid_password'
		}, function(err) {
			t.ok(err, errorMessage(err));
			t.end();
		});
	});

	test('all mocks called', function(t) {
		t.ok(server.isDone(), server.pendingMocks());
		t.end();
	});
}
