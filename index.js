module.exports = Store;

var Readable = require('stream').Readable;
var dynamicDuplex = require('dynamic-duplex');
var reconnect = require('reconnect');
var inherits = require('util').inherits;
var jiff = require('jiff');
var through2 = require('through2');
var JSONStream = require('JSONStream');
var uuid = require('uuid');
var defaults = require('defaults');
var localStorage = require('./localStorage.js');

function Store(name, options) {
  if (typeof name !== 'string') throw new Error('store must be given a name');
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid store name given');

  options = defaults(options, {
    endPoint: '/sync',
    patcher: function(patch, doc) {
      return jiff.patch(patch, doc);
    },
    differ: function(before, after) {
      return jiff.diff(before, after, function(obj) {
        return obj.id || obj._id || obj.hash || JSON.stringify(obj);
      });
    },
    connector: function(fn) {
      // if no connector is provided, then it'll use the reconnect one
      reconnect(fn).connect(options.endPoint);
    }
  });

  Readable.call(this, {
    objectMode: true
  });
  this._read = function() {};

  var self = this;

  // consumerId is used to identify this client, not user
  this.consumerId = localStorage.getItem('store-consumerId');
  if (!this.consumerId) {
    this.consumerId = uuid.v4();
    localStorage.setItem('store-consumerId', this.consumerId);
  }

  var doc = JSON.parse(localStorage.getItem('store-' + name) || '{}');

  var patchCount = JSON.parse(localStorage.getItem('store-' + name + '-end') || '0');

  var debug = require('debug')('store:' + name);

  var initialized = false;

  setTimeout(function() {
    self.emit('change', doc);
    self.push(doc);
  }, 0);

  var patchStream;

  options.connector(function(stream) {
    stream.write(JSON.stringify({
      name: name,
      start: patchCount,
      consumerId: self.consumerId
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

      var newDoc = options.pather(update[0], doc);
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
  });

  this.edit = function(editor) {
    var newDoc = JSON.parse(JSON.stringify(doc));

    editor(newDoc, function(err, changed) {
      // client chose to bail the edit
      if (changed === false || changed === void 0) return;

      try {
        var patch = option.differ(doc, newDoc);
        var written = patchStream.write(patch);
        if (!written) {
          debug('error writing patch to stream');
        }
      } catch (e) {
        debug('unable to generate patch', e);
      }
    });
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