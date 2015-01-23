var assert = require('assert');
var Readable = require('stream').Readable;
var PassThrough = require('stream').PassThrough;
var Store = require('../index.js');
var duplexify = require('duplexify');
var JSONStream = require('JSONStream');
var localStorage = require('../localStorage');

describe('SynopsisClient', function() {
  var mockStore;
  var backendIn;
  var backendOut;
  var backendInJSON;
  var backendOutJSON;

  beforeEach(function() {
    localStorage.clear();
    backendIn = new PassThrough();
    backendOut = new PassThrough();

    backendInJSON = JSONStream.parse();
    backendIn.pipe(backendInJSON);

    backendOutJSON = JSONStream.stringify(false);
    backendOutJSON.pipe(backendOut);

    mockStore = new Store('testing', {
      connector: function(connected) {
        connected(duplexify(backendIn, backendOut));
      }
    });
  });

  it('should support simple construction', function(done) {
    var store = new Store('name');
    assert(store instanceof Store);
    assert(store instanceof Readable);
    done();
  });

  it('should fail when no store name given', function() {
    try {
      var store = new Store();
      assert.fail('expected failure');
    } catch (e) {}
  });

  it('should fail when invalid store name given', function() {
    try {
      var store = new Store('123');
      assert.fail('expected failure');
    } catch (e) {}
  });

  it('should generate uuid consumerId', function(done) {
    var store = new Store('test');
    assert.equal(store.consumerId.length, 36);
    assert.equal(store.consumerId.replace(/[^-]/g, '').length, 4, 'expected 4 hyphens');
    done();
  });

  it('sends proper handshake data', function(done) {
    backendInJSON.on('data', function(handshake) {
      assert.equal(handshake.name, 'testing');
      assert(handshake.consumerId);
      assert.equal(handshake.start, 0);
      done();
    });
  });

  it('emit empty doc when first created', function(done) {
    mockStore.on('data', function(data) {
      assert.deepEqual(data, {});
      done();
    });
  });

  it('emits docs as valid updates are received', function(done) {
    var dataCount = 0;
    var expectedDocs = [
      {},
      {
        a: 1
      },
      {
        a: 1,
        b: 2
      },
    ];

    mockStore.on('data', function(doc) {
      assert.deepEqual(doc, expectedDocs.shift());
      if (expectedDocs.length === 0) done();
    });

    backendOutJSON.write([[{
      op: 'add',
      path: '/a',
      value: 1
    }], 1]);

    backendOutJSON.write([[{
      op: 'add',
      path: '/b',
      value: 2
    }], 2]);

    mockStore.on('error', done);
  });
});