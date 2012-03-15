var bee = require("beeline");
var http = require('http');
var $ = require('jquery'); 
var url = require('url');

var requestCounter = 0;

$("<div>").appendTo("body"); 

function getObjectClassName(object) { 
	var funcNameRegex = /function (.{1,})\(/;
	var results = (funcNameRegex).exec((object).constructor.toString());
	return (results && results.length > 1) ? results[1] : "";
};

var root = $("body > div");

function buildNode(parent, name) {
	var childNode = $("<div>");	
	var parts = name.split("@");
	
	var id = url.parse(parts[0]).path;
	childNode.attr("data-id", id);
	if(parts[1]) {
		childNode.attr("data-src", parts[1]);
	}
	
	if(isRoot(parent)) {
		parent.children("*[data-id=" + id +"]").remove();
	}
	
	childNode.appendTo(parent);	

	return childNode;
}

function addToCache(node, tree) {	
	if(getObjectClassName(tree) == "Object") {
		for(var child in tree) {
			if(tree.hasOwnProperty(child)) {				
				addToCache(buildNode(node, child), tree[child]);
			}
		}	
	} else if(getObjectClassName(tree) == "Array") {
		for(var child in tree) {
			if(tree.hasOwnProperty(child)) {
				addToCache(node, tree[child]);
			}
		}
	} else {
		buildNode(node, tree.toString())
	}
}

function isRoot(node){
	return node[0] == root[0];
}

root.bind("cache", function(event, tree){
	addToCache(root, tree);
});

root.bind("remove", function(event, id){
	if(id) {
		var path = url.parse(id).path;
		$("*[data-id=" + id + "]").trigger("uncache", id);
	}
});

root.on("uncache", "*", function(event){
	var self = $(event.currentTarget);
	var dataSrc = self.attr("data-src"); 
	if(dataSrc){
		var siteUrl = url.parse(dataSrc);
		var site = http.createClient(siteUrl.port, siteUrl.host);
		var retries = 5;
		var currentCounter = requestCounter++;
		site.on('error', function(err) {
			console.log('unable to connect to ' + dataSrc);
			if(retries > 0) {
				retries -= 1;		
				var retryTime = -4 * retries + 20;
				console.log("retrying in " + retryTime + " second");
				setTimeout(function(){
					console.log("retrying " + currentCounter + " " + dataSrc);
					var request = site.request("GET", siteUrl.pathname, {'host' : siteUrl.host});
					request.end();
					request.on('response', function(res) {
					       console.log("done " + currentCounter + " " + dataSrc);
					    });
					}, retryTime * 1000);								
				} else {
				console.log("giving up on " + currentCounter + " " + dataSrc);
				}
			});
			var request = site.request("GET", siteUrl.pathname, {'host' : siteUrl.host});
			request.end();
			request.on('response', function(res) {
			        console.log("done " + currentCounter + " " + dataSrc);
			    });			
		}
		if(isRoot(self.parent())){
			self.remove();
		}
	});

function renderSuccess(res, text) {
	res.writeHead(200, {'Content-Type': 'text/plain'});	
	res.write(text);
	res.end('\n');
}

var router = bee.route({ // Create a new router
	"/": {
		"GET": function(req, res) {
			renderSuccess(res, $("body").html());
		},
		"POST": function(req, res) {
			var data = '';
			var parsedData = null;
			req.addListener('data', function(chunk) { data += chunk; });
			req.addListener('end', function() {
				root.trigger("cache", [JSON.parse(data)]);
			});

			renderSuccess(res, "OK");
		},
		"DELETE": function(req, res) {
			req.addListener('end', function() {
				root.trigger("remove", [url.parse(req.url, true).query.id]);
			});			
			
			renderSuccess(res, "OK");
		}
	}
});

http.createServer(router).listen(3030);