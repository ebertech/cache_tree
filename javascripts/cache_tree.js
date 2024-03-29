var bee = require("beeline");
var http = require('http');
var $ = require('jquery');
var url = require('url');
var memcache = require('memcache');
var Log = require('log')
  , log = new Log('info');

var memcacheClient = new memcache.Client();

memcacheClient.port = 11211;
memcacheClient.host = 'localhost';

memcacheClient.on('connect', function() {
    log.info("memcached connected");
});

memcacheClient.on('close', function() {
    log.info("memcached closed connection");
    memcacheClient = null;
});

memcacheClient.on('timeout', function() {
    log.info("memcached timeout");
    memcacheClient = null;
});

memcacheClient.on('error', function(e) {
    console.error("memcached error");
    memcacheClient = null;
});

memcacheClient.connect();

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
        parent.children("*[data-id=" + id + "]").remove();
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

function isRoot(node) {
    return node[0] == root[0];
}

root.bind("cache", function(event, tree) {
    addToCache(root, tree);
});

root.bind("remove", function(event, id) {
    if(id) {
        var path = url.parse(id).path;
        $("*[data-id=" + id + "]").trigger("uncache", id);
    }
});

root.on("uncache", "*", function(event) {
    var self = $(event.currentTarget);
    var id = self.data("id");
    if(memcacheClient) {
        memcacheClient.delete(id, function(error, result) {
            if(error) {
                log.error("Could not delete '" + id + "' from memcached: " + error);
            } else {
                log.info("Deleted '" + id + "' from memcached: " + result);
            }
        });
    }
});

root.on("uncache", "*", function(event) {
	function errorHandler(jqXHR, textStatus, errorThrown) {
		if(jqXHR.status >= 400) {
			log.error('error getting ' + dataSrc + " : " + jqXHR.status);
			if(retries > 0) {
				retries -= 1;
				var retryTime = -4 * retries + 20;
				log.info("retrying in " + retryTime + " second");
				setTimeout(function() {
					log.info("retrying " + currentCounter + " " + dataSrc);
					$.ajax(dataSrc, {
						error: errorHandler,
						complete: completeHandler
					})
				}, retryTime * 1000);
			} else {
				log.error("giving up on " + currentCounter + " " + dataSrc);
			}
		}
	};
	
	function completeHandler(jqXHR, textStatus) {
		log.info("Finished[" + requestCounter + "]: " + dataSrc);
	}
	
	var self = $(event.currentTarget);
    var dataSrc = self.attr("data-src");

    if(dataSrc) {
	    var id = self.attr("data-id");
	    var retries = 5;
		var currentCounter = requestCounter++;
					
		$.ajax(dataSrc, {
			error: errorHandler,
			complete: completeHandler
		})
    }

    if(isRoot(self.parent())) {
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
            req.addListener('end', function() {
                renderSuccess(res, $("body").html());
            });
        },
        "POST": function(req, res) {
            var data = '';
            req.addListener('data', function(chunk) {
                data += chunk;
            });
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
var port = 3030;
http.createServer(router).listen(port);
log.info("CacheTree is listening on " + port);