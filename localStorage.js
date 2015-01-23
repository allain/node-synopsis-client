// stut out local storage for testing purposes

if (typeof(localStorage) === 'undefined') {
  var data = {};
  module.exports = {
    setItem: function(key, val) {
      data[key] = val;
    },
    getItem: function(key) {
      return data[key];
    }
  };
} else {
  module.exports = localStorage;
}
