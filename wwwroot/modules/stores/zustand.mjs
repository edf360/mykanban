import { createStore } from './vanilla.mjs';

// React-free create function for non-React environments
const create = (createState) => {
  const api = createStore(createState);
  // Assign api methods to the function so useUiStore.getState() works
  const useBoundStore = Object.assign(function() {}, api);
  return useBoundStore;
};

export { createStore, create };
