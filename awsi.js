var awsi = function(options) {
	this.options = $.extend({
		addr:		"ws://localhost:8080",
		keepalive:	true,
		reconnect:	true,
		onConnect:	function(reconnected) {},
		onReceive:	function(message) {},
		onClose:	function() {},
		interval:	{
			keepalive:	10000
		}
	},options);
	
	this.execStart		= new Date().getTime();
	
	// status
	this.online			= false;	// Are we online?
	this.closeRequest	= false;	// Was the close requested?
	this.reconnecting	= false;	// Are we trying to reconnect already?
	this.reconnected	= false;	// Are we reconnected?
	
	// stack
	this.stack			= [];		// The stack
	this.stackRunning	= false;	// Is the stack currently running?
	
	// Hooks
	this.hooks			= {
		"onConnect":		{},
		"onReceive":		{},
		"onClose":			{}
	};
	
	// Websocket
	this.ws				= false;
};
awsi.prototype.connect = function() {
	console.info(this.getExecTime()+">>> connect()");
	var scope 			= this;
	this.closeRequest	= false;
	
	try {
		var url = this.options.addr[0];
		// Init the WebSocket
		if (window['MozWebSocket']) {
			this.ws = new MozWebSocket(url, []);
		} else if (window['WebSocket']) {
			this.ws = new WebSocket(url, []);
		} else {
			this.ws = false;
		}
	} catch (e) {
		console.log("Connection lost.");
		this.online = false;
	}
	
	// If Websocket
	if (this.ws) {
		$(this.ws).unbind();	// unbind from all previous events
		$(this.ws).bind('open', 	function(){scope.onConnect()});
		$(this.ws).bind('close', 	function(){scope.onClose()});
		$(this.ws).bind('message', 	function(e) {
			var data = e.originalEvent.data;
			if (typeof(data) != "object") {
				data = JSON.parse(data);
			}
			scope.onReceive(data)
		});
		
		// Close the connection when we leave.
		$(window).unload(function(){
			scope.ws.close();
			scope.ws = null;
		});
		
	}
};
awsi.prototype.onConnect = function() {
	console.info(this.getExecTime()+">>> onConnect()");
	this.online			= true;
	this.reconnecting	= false;
	// Start the Keepalive
	this.keepAliveStart();
	// process hooks first
	var i;
	for (i in this.hooks["onConnect"]) {
		this.hooks["onConnect"][i](this.reconnected);
	}
	this.options.onConnect(this.reconnected);
	return this;
};
awsi.prototype.onReceive = function(data) {
	console.info(this.getExecTime()+">>> onReceive()");
	// process hooks first
	var i;
	console.log("this.hooks",this.hooks);
	for (i in this.hooks["onReceive"]) {
		this.hooks["onReceive"][i](data);
	}
	this.options.onReceive(data);
	return this;
};
awsi.prototype.onClose = function(data) {
	console.info(this.getExecTime()+">>> onClose()");
	if (!this.closeRequest) {
		// unrequested close
		// Start the reconnection attempt
		this.reconnectStart();
	}
	// Stop the Keepalive
	this.keepAliveStop();
	// process hooks first
	var i;
	for (i in this.hooks["onClose"]) {
		this.hooks["onClose"][i](data);
	}
	this.options.onClose(this.closeRequest);
	this.online 		= false;
	this.closeRequest 	= false;
	this.ws				= false;
	return this;
};
awsi.prototype.hook = function(fn, name, callback) {
	console.info(this.getExecTime()+">>> hook()");
	if (!this.hooks[fn]) {
		this.hooks[fn] = {};
	}
	if (!this.hooks[fn][name]) {
		this.hooks[fn][name] = callback;
	}
	return this;
};
awsi.prototype.unhook = function(fn, name) {
	console.info(this.getExecTime()+">>> unhook()");
	if (this.hooks[fn] && this.hooks[fn][name]) {
		delete this.hooks[fn][name];
	}
	return this;
};
awsi.prototype.send = function(data, async, now) {
	console.info(this.getExecTime()+">>> send()");
	if (!now || !this.online || !this.ws) {
		this.stack.push({
			type:		"send",
			data:		data,
			async:		async
		});
		console.log("send() stacked",this.stack);
	} else {
		data = JSON.stringify(data);
		this.ws.send(data);
	}
	this.processStack();
	return this;
};
awsi.prototype.ask = function(data, callback, async, now) {
	console.info(this.getExecTime()+">>> ask()");
	console.log("ask",data, async, now);
	var scope = this;
	if (!now || !this.online) {
		this.stack.push({
			type:		"ask",
			data:		data,
			callback:	callback,
			async:		async
		});
		console.log("ask() stacked",this.stack);
	} else {
		// create unique ask_id
		var ask_id = uuid.v4();
		data.ask_id = ask_id;
		console.log("ask_id",ask_id);
		// set the hook
		this.hook("onReceive", "ask-"+ask_id, function(data) {
			if (data) {
				if (data.response_id == ask_id) {
					console.log("HOOK EXECUTED",ask_id, data, callback);
					// remove the hook
					scope.unhook("onReceive", "ask-"+ask_id);
					// return the data
					callback(data);
				}
			}
		});
		// send the data, and wait for the answer
		this.send(data, false, true);
	}
	this.processStack();
	return this;
};
awsi.prototype.clearStack = function() {
	console.info(this.getExecTime()+">>> clearStack()");
	this.stack 			= [];		// reset the stack
	this.stackRunning	= false;	// stop the stack
	return this;
};
awsi.prototype.processStack = function() {
	console.info(this.getExecTime()+">>> processStack()");
	var scope = this;
	if (this.stackRunning || this.stack.length == 0 || !this.online) {
		return this;
	}
	// Set the stack as being processed
	this.stackRunning = true;
	var item = this.stack[0];
	switch (item.type) {
		case "send":
			if (!item.async) {
				// Sync exec
				this.ask(item.data, function(data) {
					scope.stack.shift();	// Remove that item from the stack
					scope.stackRunning = false;
					scope.processStack();	// continue with the next element
				}, false, true);
			} else {
				scope.stack.shift();	// Remove that item from the stack
				// Async exec
				this.send(item.data, false, true);
				this.stackRunning = false;
			}
		break;
		case "ask":
			if (!item.async) {
				// Sync exec
				this.ask(item.data, function(data) {
					scope.stack.shift();	// Remove that item from the stack
					item.callback(data);
					scope.stackRunning = false;
					scope.processStack();	// continue with the next element
				}, false, true);
			} else {
				scope.stack.shift();	// Remove that item from the stack
				this.ask(item.data, item.callback, false, true);
				this.stackRunning = false;
			}
		break;
	}
	return this;
};
awsi.prototype.keepAliveStart = function() {
	var scope = this;
	console.info(this.getExecTime()+">>> keepAliveStart()");
	// Stop previous timers
	window.clearInterval(this.timerKeepalive);
	// Start the timer
	this.timerKeepalive = window.setInterval(function() {
		if (scope.online && scope.ws) {
			scope.send({ping: true}, true, true);
		}
	}, this.options.interval.keepalive);
};
awsi.prototype.keepAliveStop = function() {
	console.info(this.getExecTime()+">>> keepAliveStop()");
	window.clearInterval(this.timerKeepalive);
};
awsi.prototype.reconnectStart = function() {
	console.info(this.getExecTime()+">>> reconnectStart()");
	var scope 			= this;
	console.group("reconnectStart");
	console.trace();
	console.log("reconnecting", this.reconnecting);
	console.log("online", 		this.online);
	console.log("reconnected", 	this.reconnected);
	if (this.reconnecting) {
		// Already processing a connection request...
		return this;
	}
	this.reconnecting 	= true;
	this.hook("onConnect", "reconnect", function(reconnected) {
		scope.reconnectStop();
		// We are reconnected
		// remove the hooks
		scope.unhook("onConnect", "reconnect");
		scope.unhook("onClose", "reconnect");
	});
	this.hook("onClose", "reconnect", function(reconnected) {
		scope.reconnectStop();
		// We are reconnected
		// remove the hook
		scope.unhook("onConnect", "reconnect");
		scope.unhook("onClose", "reconnect");
	});
	scope.connect();
	console.groupEnd();
};
awsi.prototype.reconnectStop = function() {
	console.info(this.getExecTime()+">>> reconnectStop()");
	this.reconnecting 	= false;
};
awsi.prototype.close = function() {
	console.info(this.getExecTime()+">>> close()");
	this.closeRequest = true;
	this.ws.close();
	this.onClose();
};

awsi.prototype.getExecTime = function() {
	return (new Date().getTime()-this.execStart)+"ms ("+Math.round((new Date().getTime()-this.execStart)/1000)+"sec)";
};

