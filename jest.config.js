module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!electron/**',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 55,
      lines: 55,
      statements: 55,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
};
