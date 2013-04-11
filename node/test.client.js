var client 			= require('./node.awsi').client;

function testClient() {
	var scope = this;
	console.log("testClient","Connecting...");
	this.client = new client({
		port:		8000,
		host:		"127.0.0.1",
		keepalive:	true,
		reconnect:	true,
		onConnect:	function(reconnected) {
			level = 1;
			console.info("#############################");
			console.info("onConnect",reconnected);
			console.info("#############################");
			scope.client.ask({raceToken: '0c8b800b-2fad-4195-a3b6-d2b30d827dce'}, function(response) {
				console.info(">>>>>> client.ask",response);
				console.log("broadcasting...");
				scope.client.broadcast({
					hello: "world"
				},false,true);
			});
		},
		onReceive:	function(message) {
			console.log(">onReceive",message);
		},
		onClose:	function() {
			console.log(">onClose");
		}
	});
	this.client.connect();
}
new testClient();