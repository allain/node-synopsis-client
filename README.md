# Synopsis Client

Provides a simple facade hiding all of the complexity regarding offline storage and synchronization.

## Usage

```js
var store = new SynopsisClient('storeName');

store.on('change', function(json) {
  console.log(JSON.stringify(json));
});

store.edit(function(doc) {
  (doc.times = doc.times || []).push(Date.now());
});

store.patch([{op: 'add', path: '/times/0', value: Date.now()}]);
```
