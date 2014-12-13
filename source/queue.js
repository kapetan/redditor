var Queue = function(interval) {
	this._interval = interval;
	this._queue = [];
	this._running = false;
	this._next = 0;
};

Queue.prototype.push = function(fn) {
	this._queue.push(fn);
	this._tryRun();
};

Queue.prototype._tryRun = function() {
	if(this._running || !this._queue.length) return;

	this._running = true;

	var self = this;
	var wait = this._next - Date.now();

	var work = function() {
		var fn = self._queue.shift();

		fn(function(limited) {
			if(limited) self._next = Date.now() + self._interval;
			self._running = false;

			self._tryRun();
		});
	};

	if(wait > 0) setTimeout(work, wait);
	else work();
};

module.exports = Queue;
