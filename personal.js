module.exports = PersonalStore;

var Store = require('./index');

var dynamicDuplex = require('dynamic-duplex');
var defaults = require('defaults');

function PersonalStore(name, options) {
  var authHash = null;
  var store = null;

  var duplexStream = dynamicDuplex(function(authChange, enc, cb) {
    var newAuthHash = authChange.auth && authChange.profile ? authChange.auth.network + '-' + authChange.profile.id : null;
    if (authHash === newAuthHash) {
      return cb(null, store);
    }

    if (store) {
      store.destroy()
    }

    if (authChange && authChange.auth) {
      options = defaults(options, {
        auth: {
          network: authChange.auth.network,
          access_token: authChange.auth.authResponse.access_token,
          profile: authChange.profile.id
        }
      });

      var storeName = 'p-' + name + '-' + newAuthHash;

      store = new Store(storeName, options);
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