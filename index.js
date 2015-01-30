module.exports = Store;

var Readable = require('stream').Readable;
var JSONStream = require('JSONStream');

var dynamicDuplex = require('dynamic-duplex');
var reconnect = require('reconnect');
var inherits = require('util').inherits;
var jiff = require('jiff');
var through2 = require('through2');
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

  self.emit('change', doc);
  self.push(doc);

  var patchStream;

  options.connector(function(stream) {
    debug('connected');

    var handshake = {
      name: name,
      start: patchCount,
      consumerId: self.consumerId,
    }

    var sessionKey;
    var sid;

    if (options.auth) {
      sessionKey = 'session-' + options.auth.network + '-' + options.auth.profile;
      sid = localStorage.getItem(sessionKey);
      if (sid) {
        handshake.sid = sid;
      } else {
        handshake.auth = options.auth;
      }
    }

    stream.write(JSON.stringify(handshake));

    stream.on('error', function(err) {
      debug('error: ' + err);
    });

    patchStream = JSONStream.stringify(false);
    patchStream.pipe(stream);

    stream.pipe(JSONStream.parse()).pipe(through2.obj(function(update, enc, next) {
      if (!Array.isArray(update)) {
        if (update.error) {
          debug('error notification received', update);
        }

        if (update.sid) {
          localStorage.setItem(sessionKey, update.sid);
        }

        return next();
      }

      // update = [patch, end]
      debug('update received', update);

      self.emit('patch', update);

      var newDoc = options.patcher(update[0], doc);
      patchCount = update[1];

      localStorage.setItem('store-' + name + '-end', patchCount);
      localStorage.setItem('store-' + name, JSON.stringify(newDoc));
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

    var changed = editor(newDoc);

    // client chose to bail the edit
    if (changed === false) return;

    try {
      var patch = options.differ(doc, newDoc);
      var written = patchStream.write(patch);
      if (!written) {
        debug('error writing patch to stream');
      }
    } catch (e) {
      debug('unable to generate patch', e);
    }
  };

  this.destroy = function() {
    localStorage.removeItem('store-' + name);
    localStorage.removeItem('store-' + name + '-end');
  }
};

inherits(Store, Readable);

Store.Personal = require('./personal');