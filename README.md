# redditor

A minimal wrapper for the reddit API. It manages the session tokens, rate limiting and JSON parsing, otherwise it just passes on the raw response from reddit.

	npm install redditor

# Usage

It supports both doing anonymouse and authorized requests.

```javascript
var reddit = require('redditor');

reddit.get('/r/funny.json', function(err, response) {
	if(err) throw err;
	console.log(response); // response is a Javascript object
});
```

Login using username and password.

```javascript
reddit({
	username: 'test_username',
	password: 'test_password'
}, function(err, authorized) {
	// Note that the returned object and the main reddit instance are not the same

	if(err) throw err;
	authorized.get('/api/me.json', function(err, response) {
		// ...
	});
});
```

Or using `username`, `cookie` and `modhash` directly.

```javascript
var authorized = reddit({
	username: 'test_username',
	cookie: 'test_cookie',
	modhash: 'test_modhash'
});
```

If needed the data can also be streamed using the returned instance.

```javascript
reddit.post('/api/new_captcha').pipe(fs.createWriteStream('captcha.png'));
```
