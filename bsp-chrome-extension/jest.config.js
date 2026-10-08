/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", {
      tsconfig: "tsconfig.test.json",
    }],
  },
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    // Strip .js extensions for TypeScript source imports
    "^(\\.\\.?/.*)\\.js$": "$1",
  },
};
