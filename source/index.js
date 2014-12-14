var util = require('util');
var stream = require('stream');

var request = require('request');
var pump = require('pump');

var Queue = require('./queue');
var pkg = require('../package.json');

var DEFAULT_BASE_URL = 'http://www.reddit.com';
var DEFAULT_USER_AGENT = util.format('%s v%s', pkg.name, pkg.version);

var queue = new Queue(2000);

var copy = function(obj) {
	return JSON.parse(JSON.stringify(obj));
};

var extend = function(that, defaults) {
	['get', 'post', 'put', 'patch', 'del', 'head'].forEach(function(type) {
		that[type] = function(url, data, callback) {
			if(!callback && typeof data === 'function') {
				callback = data;
				data = null;
			}

			var headers = { 'User-Agent': that.defaults.userAgent };
			var method = type.toUpperCase();

			if(method === 'DEL') method = 'DELETE';
			if(that.session) {
				headers['Cookie'] = util.format('reddit_session=%s;', encodeURIComponent(that.session.cookie));
				headers['X-Modhash'] = that.session.modhash;
			}

			url = that.url(url);

			return send(method, url, headers, data, callback);
		};
	});

	that.defaults = copy(defaults);
	that.url = function(url) {
		if(!/^http(s)?:/.test(url)) {
			url = /^\//.test(url) ? url : ('/' + url);
			url = that.defaults.baseUrl + url;
		}

		return url;
	};

	return that;
};

var send = function(method, url, headers, data, callback) {
	var options = {
		method: method,
		url: url,
		headers: headers
	};

	if(method in { POST: 1, PATCH: 1, PUT: 1 }) {
		data = data || {};

		data.api_type = 'json';
		options.form = data;
	} else if(data) {
		options.qs = data;
	}

	var onresponse = function(err, response, body) {
		if(err) return callback(err);
		if(!/2\d\d/.test(response.statusCode)) {
			var err = new Error('Unexpected status code ' + response.statusCode);
			return callback(err);
		}

		if(!/\/json/.test(response.headers['content-type'])) return callback(null, body);

		try {
			body = JSON.parse(body);
		} catch(err) {
			return callback(err);
		}

		if(body.json && body.json.errors && body.json.errors.length) {
			var message = body.json.errors[0]
				.filter(Boolean)
				.join(', ');

			return callback(new Error(message));
		}

		callback(null, body);
	};

	var pass = new stream.PassThrough();
	var limited = false;

	pass.headers = {};
	pass.statusCode = 0;

	var createRequest = function() {
		var req = request.apply(this, arguments);

		req.on('response', function(response) {
			pass.headers = response.headers;
			pass.statusCode = response.statusCode;

			limited = !!response.headers['x-ratelimit-used'];
		});

		return req;
	};

	queue.push(function(cb) {
		var ondone = function() { cb(limited); };
		if(!callback) return pump(createRequest(options), pass, ondone);

		createRequest(options, function(err, response, body) {
			onresponse(err, response, body);
			ondone();
		});
	});

	return pass;
};

var login = function(credentials, callback) {
	callback = callback || function() {};
	var that = extend({}, login.defaults);

	if(credentials.username && credentials.cookie && credentials.modhash) {
		that.session = credentials;
		callback(null, that);

		return that;
	}

	var data = { user: credentials.username, passwd: credentials.password, rem: true };

	that.post('/api/login', data, function(err, user) {
		if(err) return callback(err);

		that.session = user.json.data;
		that.session.username = credentials.username;

		callback(null, that);
	});

	return that;
};

module.exports = extend(login, {
	baseUrl: DEFAULT_BASE_URL,
	userAgent: DEFAULT_USER_AGENT
});
