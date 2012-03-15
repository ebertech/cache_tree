var bee = require("beeline");
var http = require('http');
var $ = require('jquery'); 
var url = require('url');

$("<div>").appendTo("body"); 

function getObjectClassName(object) { 
	var funcNameRegex = /function (.{1,})\(/;
	var results = (funcNameRegex).exec((object).constructor.toString());
	return (results && results.length > 1) ? results[1] : "";
};

var root = $("body > div");

function addListeners(node) {
	node.bind("uncache", function(event)
	{
		var self = $(event.currentTarget);
		var dataSrc = self.attr("data-src"); 
		if(dataSrc){
			var siteUrl = url.parse(dataSrc);
			var site = http.createClient(siteUrl.port, siteUrl.host);
			site.on('error', function(err) {
				console.log('unable to connect to ' + dataSrc);
			});
			var request = site.request("GET", siteUrl.pathname, {'host' : siteUrl.host})
			request.end();
		}
		if(self.parent()[0] == root[0]){
			self.remove();
		}
	});	
}

function buildNode(name) {
	var childNode = $("<div>");	
	var parts = name.split("@");
	
	var id = url.parse(parts[0]).path;
	childNode.attr("data-id", id);
	if(parts[1]) {
		childNode.attr("data-src", parts[1]);
	}

	return childNode;
}

function addToCache(node, tree) {	
	if(getObjectClassName(tree) == "Object") {
		for(var child in tree) {
			if(tree.hasOwnProperty(child)) {				
				var childNode = buildNode(child);
				childNode.appendTo(node);
				addListeners(childNode);
				addToCache(childNode, tree[child]);
			}
		}	
	} else if(getObjectClassName(tree) == "Array") {
		for(var child in tree) {
			if(tree.hasOwnProperty(child)) {
				addToCache(node, tree[child]);
			}
		}
	} else {
		var childNode = buildNode(tree.toString());
		childNode.appendTo(node);
		addListeners(childNode);		
	}
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
			root.trigger("remove", [url.parse(req.url, true).query.id])
			renderSuccess(res, "OK");
		}
	}
});

http.createServer(router).listen(3030);