const base = require("../../jest.config.base.cjs");

const shared = {
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  extensionsToTreatAsEsm: [".ts"],
  clearMocks: true,
  setupFiles: ["<rootDir>/jest.setup.cjs"],
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      ...shared,
      displayName: "unit",
      rootDir: ".",
      testMatch: ["<rootDir>/src/**/*.test.ts"],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            useESM: true,
            tsconfig: "<rootDir>/tsconfig.json",
          },
        ],
      },
      moduleNameMapper: {
        ...base.moduleNameMapper,
      },
      collectCoverageFrom: ["src/**/*.ts", "!src/**/*.test.ts"],
    },
    {
      ...shared,
      displayName: "integration",
      rootDir: ".",
      maxWorkers: 1,
      testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            useESM: true,
            tsconfig: "<rootDir>/tsconfig.test.json",
          },
        ],
      },
      moduleNameMapper: {
        ...base.moduleNameMapper,
      },
    },
  ],
};
