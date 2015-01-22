var assert = require('assert');

var Store = require('../index.js');

describe('SynopsisClient', function() {
  it('should support simple construction', function(done) {
    var store = new Store('test');
    assert(store instanceof Store);
    done();
  });
});