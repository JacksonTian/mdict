

const Dict = require('./dict');

class MDD extends Dict {
  constructor(filename) {
    super(filename, 'Library_Data');
  }
}

module.exports = MDD;
