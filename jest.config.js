/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: {
                // Relax strict settings for test files
                strict: false,
                esModuleInterop: true,
            },
        }],
    },
    clearMocks: true,
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/database/migrate.ts',
        '!src/database/production-schema.sql',
        '!src/**/*.d.ts',
    ],
};
