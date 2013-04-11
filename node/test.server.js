var server 			= require('./node.awsi').server;

function testServer() {
	var scope = this;
	console.log("testServer","Connecting...");
	this.server = new server({
		port:		8000,
		onConnect:	function(wsid) {
			console.log("onConnect",wsid);
			// Display an update every 100 players
			if (scope.server.count % 100 == 0) {
				console.log("\033[33m"+"online:\033[0m"+scope.server.count+"/"+scope.server.tcount);
			}
		},
		onReceive:	function(wsid, data, flag) {
			console.log("onReceive",wsid, data, flag);
			if (data.ask_id) {
				scope.server.send(wsid, {
					hi: 			true,
					response_id:	data.ask_id
				});
			}
		},
		onClose:	function(wsid) {
			console.log("onClose",wsid);
		}
	});
}
new testServer();