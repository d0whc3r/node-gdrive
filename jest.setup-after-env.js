// Jest extended => https://github.com/jest-community/jest-extended
require('jest-extended');

// Jest chain => https://github.com/mattphillips/jest-chain
require('jest-chain');

const JEST_TIMEOUT = 35 * 1000;

// eslint-disable-next-line no-undef
jest.setTimeout(JEST_TIMEOUT);
