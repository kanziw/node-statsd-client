var http = require('http');
var https = require('https');
var urlParse = require('url').parse;
var debug = require('util').debuglog('statsd-client');

interface HttpSocketOptions {
    host?: string
    headers?: {[key:string]: string}
    socketTimeout?: number
    maxBufferSize?: number
}

class HttpSocket {
    _requestOptions: any; // Output of url.parse
    _socketTimeoutMsec: number;
    _maxBufferSize: number;
    _http: any;
    _buffer: string;
    _socketTimer: NodeJS.Timeout;

    constructor (options?: HttpSocketOptions) {
        if (!options) { options = {}; }

        this._requestOptions = urlParse(options.host || 'http://localhost/');
        this._requestOptions.method = 'PUT';
        this._requestOptions.headers = options.headers || {};
        this._socketTimeoutMsec = 'socketTimeout' in options ? options.socketTimeout : 1000;

        // Require the correct HTTP library
        this._http = http;
        if (this._requestOptions.protocol === 'https:') {
            this._http = https;
        }

        this._maxBufferSize = 'maxBufferSize' in options ? options.maxBufferSize : 10000;

        // Set up re-usable socket
        this._socketTimer = undefined; // Reference to check-timer
        this._buffer = "";
    }

    /* Checks if there is anything in it's buffer that need to be sent. If it is
     * non-empty, it will be flushed.
     */
    _socketTimeout() {
        debug("_socketTimeout()");
        // Flush the buffer, if it contain anything.
        if (this._buffer.length > 0) {
            this._flushBuffer();
            return;
        }
    };


    /*
     * Flush all current data and stop any timers running.
     */
    close() {
        debug("close()");
        if (this._buffer.length > 0) {
            this._flushBuffer();
        }

        // Cancel the running timer
        if (this._socketTimer) {
            clearInterval(this._socketTimer);
            this._socketTimer = undefined;
        }

        // Wait a tick or two, so any remaining stats can be sent.
        setTimeout(this.kill.bind(this), 10);
    };

    /* Kill the socket RIGHT NOW.
     */
    kill() {
        debug("kill()");

        // Clear the timer and catch any further errors silently
        if (this._socketTimer) {
            clearInterval(this._socketTimer);
            this._socketTimer = undefined;
        }
    };

    /* Buffer management
     */
    _enqueue(data) {
        debug("_enqueue(", data, ")");

        if (!this._socketTimer) {
            this._socketTimer = setInterval(this._socketTimeout.bind(this), this._socketTimeoutMsec);
        }

        // Empty buffer if it's too full
        if (this._buffer.length + data.length > this._maxBufferSize) {
            this._flushBuffer();
        }

        if (this._buffer.length === 0) {
            this._buffer = data;
        } else {
            this._buffer += "\n" + data;
        }
    };

    _flushBuffer() {
        debug("_flushBuffer() →", this._buffer);
        this._send(this._buffer);
        this._buffer = "";
    };

    /* Send data - public interface.
     */
    send(data) {
        debug("send(", data, ")");
        if (this._maxBufferSize === 0) {
            return this._send(data);
        } else {
            this._enqueue(data);
        }
    };

    /*
     * Send data.
     */
    _send(data) {
        debug("_send(", data, ")");
        var req = this._http.request(this._requestOptions);

        // Catch but ignore errors
        req.once('error', function () {});

        // Send data
        req.end(data);

        debug(data);
    }
}

module.exports = HttpSocket;
