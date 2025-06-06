import { Dict } from './dict.js';

export class MDD extends Dict {
  constructor(filename) {
    super(filename, 'Library_Data');
    this.meta.format = 'Html';
  }
}
