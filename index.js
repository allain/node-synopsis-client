module.exports = Store;

var Readable = require('stream').Readable;
var dynamicDuplex = require('dynamic-duplex');
var reconnect = require('reconnect');
var inherits = require('util').inherits;
var jiff = require('jiff');
var through2 = require('through2');
var JSONStream = require('JSONStream');
var uuid = require('uuid');

var store;

if (typeof(localStorage) === 'undefined') {
  var values = {};
  store = {
		get: function(key) { return values[key]; },
    set: function(key, value) { values[key] = value; }
	};
} else {
  store = {
		get: function(key) { return localStorage[key]; },
    set: function(key, value) { localStorage[key] = value; }
	};
}

function Store(name, endPoint) {
  if (typeof name !== 'string') throw new Error('store must be given a name');
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid store name given');

  Readable.call(this, {objectMode: true});

  var self = this;

  var consumerId = store.get('store-consumerId');
	if (!consumerId) {
		consumerId = uuid.v4();
    store.set('store-consumerId', consumerId);
	}

  var doc = JSON.parse(store.get('store-' + name)  || '{}');
  var patchCount = parseInt(store.get('store-' + name + '-end') || '0', 10) || 0;

  endPoint = endPoint || '/sync';

  var debug = require('debug')('store:' + name);

  var initialized = false;

  setTimeout(function() {
    self.emit('change', doc);
    self.push(doc);
  }, 0);

  this._read = function() {

  };

  var patchStream;

  reconnect(function (stream) {
    stream.write(JSON.stringify({
			name: name,
			start: patchCount,
			consumerId: consumerId
		})); 
    
    stream.on('error', function(err) {
      debug('error: ' + err);
    });

    patchStream = JSONStream.stringify(false);
		patchStream.pipe(stream);
    stream.pipe(JSONStream.parse()).pipe(through2.obj(function(update, enc, next) {
      if (!Array.isArray(update)) {
        debug('error notification received', update);
				return next();
      }

      // update = [patch, end]
      debug('update received', update);

      self.emit('patch', update);

      var newDoc = jiff.patch(update[0], doc);
      patchCount = update[1];

      store.set('store-' + name + '-end', patchCount);
      store.set('store-' + name, JSON.stringify(newDoc));
      doc = newDoc;

      self.push(doc);
      self.emit('change', doc);
      next();
    }));

    if (!initialized) {
      self.emit('ready');
      initialized = false;
    }
  }).connect(endPoint);

  this.edit = function(fn) {
    var newDoc = JSON.parse(JSON.stringify(doc));

    var changed = fn(newDoc);

    // client chose to bail the edit
    if (changed === false) return;

    try {
      var patch = jiff.diff(doc, newDoc, function(obj) {
        return obj.id || obj._id || obj.hash || JSON.stringify(obj);
      });

      var written = patchStream.write(patch);
      if (!written) {
        debug('error writing patch to stream');
      }
    } catch (e) {
      debug('unable to generate patch', e);
    }
  };
};

inherits(Store, Readable);

Store.Personal = function(name, endPoint) {
  var authHash = null;
  var store = null;

  var duplexStream = dynamicDuplex(function(auth, enc, cb) {
		var newAuthHash = auth.auth && auth.profile ? auth.auth.network + '-' + auth.profile.id : null;
	  if (authHash === newAuthHash) {
			return cb(null, store);
		}

		if (store) {
			//TODO: store.destroy()
		}

    if (auth) {
			store = new Store('p-' + name + '-' + newAuthHash);
			authHash = newAuthHash;
			duplexStream.edit = store.edit.bind(store);
			cb(null, store);
		} else {
			authHash = null;
			store = null;
      duplexStream.edit = function() {
				debug('attempting to edit a disconnected personal stream');
			};
			cb(null, null);
		}
	});

  return duplexStream;
};
