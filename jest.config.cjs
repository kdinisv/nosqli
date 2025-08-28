/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
        useESM: true,
      }
    ],
  },
  transformIgnorePatterns: ['/node_modules/'],
  extensionsToTreatAsEsm: ['.ts'],
  // Prefer resolving TypeScript files over JavaScript when extension is omitted
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};
