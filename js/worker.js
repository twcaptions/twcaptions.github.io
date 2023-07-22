importScripts('obs-ws.min.js');
importScripts('socket.io.min.js'); // version 4.6.0


const turkish_chars = {'ı': 'ì', 'İ': 'Í', 'Ç': 'ç', 'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S'};
const FREQUENCY = 0.5; // update FREQUENCY in Hz


var handshake = "";
var username = "";
var queue = [];
var last_hidden = "";
var last_full = "";
var no_input_counter = 0;
var reset_ready = false;
var obs_connected = false;
var long_text_counter = 0;
var current_src = "en";
var current_dst = "disable";
var last_emitted_text = "";


const socket = io("http://34.74.14.6:8000");

onmessage = function(e) {
    if (e.data[0] === "login") {
        username = e.data[1];
        socket.emit("loginServer", {"username": e.data[1], "password": e.data[2], "silent": e.data[3]});
    }
    else if (e.data[0] === "empty") {
        socket.emit("clearScreen", {"username": username, "handshake": handshake});
        writeToScreen('');
        queue = [];
    }
    else {
        if (queue.length == 0 || queue[queue.length-1][1]) {
            queue.push(e.data[1]);
        }
        else {
            queue[queue.length-1] = e.data[1];
        }
		
		current_src = e.data[0][0];
		current_dst = e.data[0][1];
    }
    
};


socket.on("processedText", function(data) {
    last_hidden = data['last_hidden'];
    last_full = data['last_full'];	
    long_text_counter = Math.floor((data['screen_text'].split(" ").length - 1) / (3.5 / FREQUENCY)) - 1; // 3.5 is the average number of words Turkish people read per second (it is more like 3.2, but Twitch users are young)
    if(data['screen_text'].length > 0) {
        no_input_counter = 0;
        writeToScreen(data['screen_text']);
    }
    else {
        no_input_counter++;
    }	
});


const obs = new OBSWebSocket();

var connect_interval;
function tryToConnect() {
    connect_promise = obs.connect("ws://localhost:4455", "limonlu_kunefe");
    connect_promise.then(function() {
        clearInterval(connect_interval);
        obs_connected = true;
    }).catch();
}
connect_interval = setInterval(tryToConnect, 5000/FREQUENCY);

function number_of_words(str) {
    if (str) return str.split(" ").length;
    return 0;
}


function writeToScreen(str) {
    postMessage(['display', str]);
    if (obs_connected) {
        connect_promise = obs.call('SendStreamCaption', { captionText: str.replace(/[ıİÇğĞşŞ]/g, m => turkish_chars[m]).slice(-128) });
        connect_promise.catch(function() {
            obs_connected = false;
            connect_interval = setInterval(tryToConnect, 5000/FREQUENCY);
        });
    }
}

function continuous_processing() {
    if (reset_ready) {
        queue.shift();
        last_hidden = "";
        last_full = "";
        reset_ready = false;
    }
    if (long_text_counter > 0 && queue.length < 3) {
        long_text_counter--;
        return;
    }
    if (queue.length == 0) {
        no_input_counter++;
        if (no_input_counter > 2.5/FREQUENCY) {
            socket.emit("clearScreen", {"username": username, "handshake": handshake});
            writeToScreen('');
        }
        return;
    }

	if (last_emitted_text !== queue[0][0]) {
		if (current_src === current_dst) {
			writeToScreen(queue[0][0]);
			no_input_counter = 0;
		}
		socket.emit("newSpeech", {"username": username, "handshake": handshake, "src": current_src, "dst": current_dst, "orig_text": queue[0][0], "is_final": queue[0][1], "last_hidden": last_hidden, "last_full": last_full});
		last_emitted_text = queue[0][0];
	}
    
    if (queue[0][1]) {
        reset_ready = true; // we don't reset here to account for the delay due to XMLHttpRequest
    }
}

var interval;
socket.on("loginClient", function(data) {
    if(data['status'] == 0) {
        handshake = data['handshake'];
        interval = setInterval(continuous_processing, 1000/FREQUENCY);
    }
    postMessage(['login',data['status'],data['silent']]);
});
	



