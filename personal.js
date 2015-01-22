module.exports = function(name, endPoint) {
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

